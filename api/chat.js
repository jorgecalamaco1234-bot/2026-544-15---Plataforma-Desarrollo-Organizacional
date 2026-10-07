import { gemini, clip, readBody, fail, orgContext } from "../lib/gemini.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Método no permitido." });
  const trace = [];
  try {
    const { messages, puestos, modulos } = readBody(req);
    const contents = (Array.isArray(messages) ? messages : [])
      .filter(m => (m.role === "user" || m.role === "assistant") && String(m.content ?? "").trim())
      .slice(-20)
      .map(m => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: clip(m.content, 4000) }] }));
    if (contents[0]?.role === "model") contents.shift();
    if (contents.at(-1)?.role !== "user") return res.status(400).json({ error: "Falta la pregunta." });

    const reply = await gemini({
      trace,
      system: `Eres el asistente de la Plataforma de Desarrollo Organizacional. Ayudas a Recursos Humanos y a líderes a entender y mejorar su estructura organizacional: organigrama, niveles de mando, descripciones de puesto, procesos, competencias, políticas, KPIs y buenas prácticas.
Responde en español, de forma breve y directa (máximo 3 párrafos cortos o una lista). Usa los datos de la empresa de abajo cuando la pregunta sea sobre la empresa; si algo no está en los datos, dilo en lugar de inventarlo. Tus propuestas son sugerencias: recuerda que una persona debe revisarlas antes de aplicarlas.

<organigrama>
${orgContext(puestos)}
</organigrama>

<modulos>
${clip(modulos, 12000) || "Sin datos de procesos, competencias, políticas ni KPIs."}
</modulos>`,
      contents,
    });
    res.setHeader("x-ia-trace", JSON.stringify(trace));
    res.status(200).json({ reply });
  } catch (err) {
    if (trace.length) res.setHeader("x-ia-trace", JSON.stringify(trace));
    fail(res, err);
  }
}
