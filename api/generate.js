import { gemini, clip, readBody, fail, HttpError } from "../lib/gemini.js";
import { requireUser } from "../lib/auth.js";
import { requireSameOrigin } from "../lib/http.js";

const SCHEMA = {
  type: "OBJECT",
  properties: {
    objetivo: { type: "STRING" },
    responsabilidades: { type: "ARRAY", items: { type: "STRING" } },
    competencias: { type: "ARRAY", items: { type: "STRING" } },
    perfil: { type: "STRING" },
    indicadores: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: { nombre: { type: "STRING" }, meta: { type: "NUMBER" }, unidad: { type: "STRING" }, sentido: { type: "STRING", enum: ["mayor", "menor"] } },
        required: ["nombre", "meta", "unidad", "sentido"],
        propertyOrdering: ["nombre", "meta", "unidad", "sentido"],
      },
    },
  },
  required: ["objetivo", "responsabilidades", "competencias", "perfil", "indicadores"],
  propertyOrdering: ["objetivo", "responsabilidades", "competencias", "perfil", "indicadores"],
};

const SYSTEM = `Eres especialista en desarrollo organizacional y recursos humanos en México. Redactas descripciones de puesto claras, profesionales y en español neutro.
Reglas:
- Objetivo (propósito del puesto): una sola oración que inicie con verbo en infinitivo y diga para qué existe el puesto y qué resultado aporta.
- Responsabilidades (funciones): de 5 a 8, cada una inicia con verbo en infinitivo, concreta y medible cuando sea posible. Integra y mejora las que dé el usuario, sin contradecirlas. No repitas funciones de los otros puestos de la empresa que se listan: cada función debe tener un solo dueño.
- Indicadores: de 2 a 3 indicadores de estándar con los que se mide a quien ocupa el puesto; meta numérica realista, unidad ("%", "días", "horas", "piezas"...) y sentido ("mayor" si más es mejor, "menor" si menos es mejor).
- Competencias: de 4 a 6, mezcla técnicas y conductuales, frases cortas.
- Perfil: escolaridad, años de experiencia y conocimientos clave, acordes al nivel jerárquico (si reporta a una dirección es mando medio; si reporta a una coordinación es operativo).
- No inventes nombres de personas, salarios ni datos confidenciales.`;

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Método no permitido." });
  const trace = [];
  try {
    requireSameOrigin(req);
    await requireUser(req);
    const { title, dept, parent, resp, otras } = readBody(req);
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
Responsabilidades clave indicadas por el usuario: ${clip(resp, 2000) || "Ninguna"}
Funciones que ya tienen otros puestos (no las repitas): ${clip(Array.isArray(otras) ? otras.join("; ") : "", 4000) || "Ninguna"}` }],
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
