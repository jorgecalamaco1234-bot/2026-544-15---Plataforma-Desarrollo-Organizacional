// Cliente mínimo para la API REST de Gemini (generateContent). La clave vive solo en el servidor.
// Modelo principal y de respaldo: si el principal está saturado (503/500) se reintenta y luego se usa el respaldo.
const MODELS = [...new Set([process.env.GEMINI_MODEL || "gemini-3.8-flash", process.env.GEMINI_FALLBACK_MODEL || "gemini-3.5-flash"])];
const endpoint = m => `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent`;
const sleep = ms => new Promise(r => setTimeout(r, ms));

export const clip = (s, n = 2000) => String(s ?? "").slice(0, n);

export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

// system: texto; contents: [{role:"user"|"model", parts:[{text}]}]
export async function gemini({ system, contents, maxOutputTokens = 2048, schema }) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new HttpError(500, "Falta GEMINI_API_KEY en las variables de entorno de Vercel.");

  const body = JSON.stringify({
    systemInstruction: { parts: [{ text: system }] },
    contents,
    generationConfig: {
      maxOutputTokens,
      ...(schema && { responseMimeType: "application/json", responseSchema: schema }),
    },
  });

  let r, data, model;
  attempts: for (model of MODELS) {
    for (let i = 0; i < 2; i++) {
      r = await fetch(endpoint(model), {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": key },
        body,
      });
      data = await r.json().catch(() => ({}));
      if (r.status !== 503 && r.status !== 500) break attempts;
      console.warn("Gemini saturado", model, r.status);
      await sleep(800 * (i + 1));
    }
  }
  if (!r.ok) {
    console.error("Gemini", r.status, data?.error?.message);
    const detail = ` (Gemini ${r.status}: ${clip(data?.error?.message || "sin detalle", 200)})`;
    if ((r.status === 400 && /api key/i.test(data?.error?.message || "")) || r.status === 401) throw new HttpError(500, "La clave de Gemini no es válida. Revisa GEMINI_API_KEY en Vercel." + detail);
    if (r.status === 403) throw new HttpError(500, "La clave de Gemini no tiene permiso." + detail);
    if (r.status === 404) throw new HttpError(500, `El modelo ${model} no está disponible para esta clave.` + detail);
    if (r.status === 429) throw new HttpError(429, "Se alcanzó el límite de uso de Gemini. Intenta en un minuto." + detail);
    throw new HttpError(502, "La IA no respondió correctamente." + detail);
  }

  const cand = data.candidates?.[0];
  const text = (cand?.content?.parts || []).filter(p => p.text && !p.thought).map(p => p.text).join("").trim();
  if (!text) {
    console.error("Gemini sin texto", cand?.finishReason, data.promptFeedback);
    throw new HttpError(502, cand?.finishReason === "MAX_TOKENS" ? "La respuesta salió demasiado larga. Intenta de nuevo." : "La IA no generó respuesta. Reformula e intenta de nuevo.");
  }
  return text;
}

export function readBody(req) {
  const b = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
  if (JSON.stringify(b).length > 100000) throw new HttpError(413, "Solicitud demasiado grande.");
  return b;
}

export function fail(res, err) {
  if (!(err instanceof HttpError)) console.error(err);
  res.status(err.status || 500).json({ error: err instanceof HttpError ? err.message : "Error interno del servidor." });
}

// Resumen compacto del organigrama para dárselo como contexto a la IA
export function orgContext(puestos) {
  if (!Array.isArray(puestos) || !puestos.length) return "No hay puestos registrados.";
  const byId = new Map(puestos.map(p => [p.id, p]));
  return puestos.slice(0, 150).map(p => {
    const boss = byId.get(p.parent);
    return [
      `- ${clip(p.name, 120)} | Depto: ${clip(p.dept, 80)} | Reporta a: ${boss ? clip(boss.name, 120) : "Nadie (nivel más alto)"} | Estado: ${clip(p.status, 20)}`,
      p.obj && `  Objetivo: ${clip(p.obj, 400)}`,
      p.resp && `  Responsabilidades: ${clip(p.resp, 600)}`,
      Array.isArray(p.comp) && p.comp.length && `  Competencias: ${clip(p.comp.join(", "), 300)}`,
      p.perfil && `  Perfil: ${clip(p.perfil, 300)}`,
    ].filter(Boolean).join("\n");
  }).join("\n");
}
