import { gemini, clip, readBody, fail, HttpError } from "../lib/gemini.js";

const SCHEMA = {
  type: "OBJECT",
  properties: {
    objetivo: { type: "STRING" },
    responsabilidades: { type: "ARRAY", items: { type: "STRING" } },
    competencias: { type: "ARRAY", items: { type: "STRING" } },
    perfil: { type: "STRING" },
  },
  required: ["objetivo", "responsabilidades", "competencias", "perfil"],
  propertyOrdering: ["objetivo", "responsabilidades", "competencias", "perfil"],
};

const SYSTEM = `Eres especialista en desarrollo organizacional y recursos humanos en México. Redactas descripciones de puesto claras, profesionales y en español neutro.
Reglas:
- Objetivo: una sola oración que inicie con verbo en infinitivo y diga para qué existe el puesto.
- Responsabilidades: de 5 a 8, cada una inicia con verbo en infinitivo, concreta y medible cuando sea posible. Integra y mejora las que dé el usuario, sin contradecirlas.
- Competencias: de 4 a 6, mezcla técnicas y conductuales, frases cortas.
- Perfil: escolaridad, años de experiencia y conocimientos clave, acordes al nivel jerárquico (si reporta a una dirección es mando medio; si reporta a una coordinación es operativo).
- No inventes nombres de personas, salarios ni datos confidenciales.`;

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Método no permitido." });
  const trace = [];
  try {
    const { title, dept, parent, resp } = readBody(req);
    if (!clip(title).trim()) return res.status(400).json({ error: "Falta el título del puesto." });

    const text = await gemini({
      trace,
      system: SYSTEM,
      schema: SCHEMA,
      maxOutputTokens: 4096,
      contents: [{
        role: "user",
        parts: [{ text: `Genera la descripción del puesto.
Título: ${clip(title, 150)}
Departamento: ${clip(dept, 100) || "No especificado"}
Reporta a: ${clip(parent, 150) || "No especificado"}
Responsabilidades clave indicadas por el usuario: ${clip(resp, 2000) || "Ninguna"}` }],
      }],
    });

    let out;
    try { out = JSON.parse(text); } catch { throw new HttpError(502, "La IA devolvió un formato inválido. Intenta de nuevo."); }
    res.setHeader("x-ia-trace", JSON.stringify(trace));
    res.status(200).json(out);
  } catch (err) {
    if (trace.length) res.setHeader("x-ia-trace", JSON.stringify(trace));
    fail(res, err);
  }
}
