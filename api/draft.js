import { gemini, clip, readBody, fail, HttpError } from "../lib/gemini.js";

// Borradores con IA para los módulos de Procesos, Competencias, Políticas y KPIs.
// Cada tipo define su esquema de salida (JSON) y cómo armar la petición.

const S = { type: "STRING" };
const LIST = { type: "ARRAY", items: S };
const obj = (properties, order = Object.keys(properties)) => ({ type: "OBJECT", properties, required: order, propertyOrdering: order });

const BASE = `Eres especialista en desarrollo organizacional, sistemas de gestión de calidad y recursos humanos en México. Escribes en español neutro, claro y profesional.
No inventes nombres de personas, salarios, cifras legales ni datos confidenciales. No afirmes que algo "cumple" o está "certificado" en ISO 9001: como mucho, que está alineado a su estructura.`;

const puestosTxt = ps => (Array.isArray(ps) && ps.length ? ps.slice(0, 80).map(p => clip(p, 120)).join("; ") : "No hay puestos registrados.");

const TYPES = {
  proceso: {
    schema: obj({
      objetivo: S,
      alcance: S,
      entradas: LIST,
      salidas: LIST,
      pasos: { type: "ARRAY", items: obj({ actividad: S, responsable: S }) },
      indicadores: LIST,
    }),
    system: `${BASE}
Documentas procesos con la estructura que suele pedir ISO 9001 (objetivo, alcance, entradas, salidas, actividades, responsables e indicadores).
- Pasos: de 5 a 9 actividades en orden, cada una inicia con verbo en infinitivo.
- Responsable de cada paso: elige el puesto más adecuado de la lista de puestos de la empresa; escribe el nombre exactamente como aparece.
- Entradas y salidas: de 2 a 4 cada una. Indicadores: de 1 a 3, medibles.`,
    prompt: b => `Documenta el proceso.
Nombre: ${clip(b.nombre, 150)}
Departamento dueño: ${clip(b.departamento, 100) || "No especificado"}
Descripción o notas del usuario: ${clip(b.descripcion, 1500) || "Ninguna"}
Puestos de la empresa: ${puestosTxt(b.puestos)}`,
  },

  competencia: {
    schema: obj({
      descripcion: S,
      niveles: LIST,
      comportamientos: LIST,
      puestos_sugeridos: LIST,
    }),
    system: `${BASE}
Defines competencias para un catálogo de competencias laborales.
- Descripción: una o dos oraciones.
- Niveles: exactamente 4, en este orden: Básico, Intermedio, Avanzado y Experto; cada uno es una oración que describe lo que la persona demuestra en ese nivel (sin repetir el nombre del nivel).
- Comportamientos: de 3 a 5 conductas observables.
- Puestos sugeridos: de la lista de puestos de la empresa, los que más requieren esta competencia; escribe los nombres exactamente como aparecen.`,
    prompt: b => `Define la competencia.
Nombre: ${clip(b.nombre, 120)}
Tipo: ${clip(b.tipo_competencia, 40) || "No especificado"}
Contexto adicional: ${clip(b.contexto, 1000) || "Ninguno"}
Puestos de la empresa: ${puestosTxt(b.puestos)}`,
  },

  politica: {
    schema: obj({
      objetivo: S,
      alcance: S,
      lineamientos: LIST,
      responsabilidades: LIST,
    }),
    system: `${BASE}
Redactas políticas corporativas.
- Objetivo y alcance: una o dos oraciones cada uno.
- Lineamientos: de 5 a 8 reglas claras y verificables.
- Responsabilidades: de 2 a 4, cada una indica qué área o puesto hace qué.
- No incluyas sanciones legales ni referencias a artículos de ley específicos.`,
    prompt: b => `Redacta la política.
Título: ${clip(b.titulo, 150)}
Categoría: ${clip(b.categoria, 60) || "No especificada"}
Departamento responsable: ${clip(b.departamento, 100) || "No especificado"}
Puntos clave del usuario: ${clip(b.puntos, 1500) || "Ninguno"}`,
  },

  kpi: {
    schema: obj({
      kpis: {
        type: "ARRAY",
        items: obj({
          nombre: S,
          descripcion: S,
          formula: S,
          unidad: S,
          meta: { type: "NUMBER" },
          sentido: { type: "STRING", enum: ["mayor", "menor"] },
          frecuencia: { type: "STRING", enum: ["Mensual", "Trimestral", "Semestral", "Anual"] },
          responsable: S,
        }),
      },
    }),
    system: `${BASE}
Propones indicadores clave de desempeño (KPIs) para un área.
- Propón de 3 a 5 KPIs distintos entre sí y que no repitan los existentes.
- Fórmula: cómo se calcula, en palabras. Unidad: "%", "días", "horas", "piezas", etc.
- Meta: número realista para una empresa mediana. Sentido: "mayor" si más es mejor, "menor" si menos es mejor.
- Responsable: el puesto más adecuado de la lista de puestos; escribe el nombre exactamente como aparece.`,
    prompt: b => `Propón KPIs.
Departamento: ${clip(b.departamento, 100) || "No especificado"}
Enfoque o necesidad del usuario: ${clip(b.enfoque, 1000) || "Ninguno"}
KPIs que ya existen: ${(Array.isArray(b.existentes) ? b.existentes.slice(0, 40).map(k => clip(k, 100)).join("; ") : "") || "Ninguno"}
Puestos de la empresa: ${puestosTxt(b.puestos)}`,
  },
};

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Método no permitido." });
  try {
    const body = readBody(req);
    const t = TYPES[body.tipo];
    if (!t) return res.status(400).json({ error: "Tipo de borrador no válido." });
    const main = body.nombre || body.titulo || body.departamento;
    if (!clip(main).trim()) return res.status(400).json({ error: "Faltan datos para generar el borrador." });

    const text = await gemini({
      system: t.system,
      schema: t.schema,
      maxOutputTokens: 4096,
      contents: [{ role: "user", parts: [{ text: t.prompt(body) }] }],
    });

    let out;
    try { out = JSON.parse(text); } catch { throw new HttpError(502, "La IA devolvió un formato inválido. Intenta de nuevo."); }
    res.status(200).json(out);
  } catch (err) {
    fail(res, err);
  }
}
