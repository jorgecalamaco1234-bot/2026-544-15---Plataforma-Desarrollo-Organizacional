// Validación y limpieza en el servidor de los datos de cada módulo.
import { HttpError } from "./http.js";
import { funcionesDe, sinRepetirDentro } from "./estructura.js";

const CATEGORIAS = ["Calidad", "Recursos Humanos", "Seguridad e higiene", "Operación", "Ética y cumplimiento", "Tecnología"];

// [etiqueta, tipo, obligatorio, opciones]
const CAMPOS = {
  procesos: {
    nombre: ["Nombre del proceso", "texto", 1], dept: ["Departamento", "texto", 1], responsable: ["Responsable", "puesto"],
    objetivo: ["Objetivo", "largo"], alcance: ["Alcance", "largo"], entradas: ["Entradas", "lista"], salidas: ["Salidas", "lista"],
    pasos: ["Actividades", "pasos", 1], indicadores: ["Indicadores", "lista"],
  },
  competencias: {
    nombre: ["Nombre de la competencia", "texto", 1], tipo: ["Tipo", "opcion", 1, ["Técnica", "Conductual", "Directiva"]],
    descripcion: ["Descripción", "largo", 1], niveles: ["Niveles de dominio", "niveles"], comportamientos: ["Comportamientos", "lista"],
    puestos: ["Puestos", "ids"],
  },
  politicas: {
    titulo: ["Título", "texto", 1], categoria: ["Categoría", "opcion", 1, CATEGORIAS], dept: ["Departamento", "texto", 1],
    aplica: ["Aplica a", "lista"], objetivo: ["Objetivo", "largo"], alcance: ["Alcance", "largo"],
    lineamientos: ["Lineamientos", "lista", 1], responsabilidades: ["Responsabilidades", "lista"],
  },
  kpis: {
    nombre: ["Nombre del KPI", "texto", 1], dept: ["Departamento", "texto", 1], responsable: ["Responsable", "puesto"],
    frecuencia: ["Frecuencia", "opcion", 1, ["Mensual", "Trimestral", "Semestral", "Anual"]], descripcion: ["Descripción", "largo"],
    formula: ["Fórmula", "texto", 1], unidad: ["Unidad", "corto"], meta: ["Meta", "numero", 1],
    sentido: ["Sentido", "opcion", 1, ["mayor", "menor"]], valores: ["Mediciones", "numeros"],
  },
};

const txt = (v, max) => String(v ?? "").trim().slice(0, max);
const lista = (v, max = 60) => (Array.isArray(v) ? v : []).map(x => txt(x, 500)).filter(Boolean).slice(0, max);

function valor(tipo, v, opciones, etiqueta) {
  switch (tipo) {
    case "texto": return txt(v, 250);
    case "corto": return txt(v, 30);
    case "largo": return txt(v, 3000);
    case "lista": return lista(v);
    case "pasos": return (Array.isArray(v) ? v : []).map(p => ({ actividad: txt(p?.actividad, 300), responsable: txt(p?.responsable, 200) })).filter(p => p.actividad).slice(0, 40);
    case "niveles": return [0, 1, 2, 3].map(i => txt((Array.isArray(v) ? v : [])[i], 600));
    case "ids": return [...new Set((Array.isArray(v) ? v : []).map(Number).filter(n => Number.isInteger(n) && n > 0))].slice(0, 200);
    case "puesto": return v === "" || v == null ? "" : Number.isInteger(+v) && +v > 0 ? +v : "";
    case "numero": {
      if (v === "" || v == null) return "";
      const n = Number(v);
      if (!Number.isFinite(n)) throw new HttpError(400, `"${etiqueta}" debe ser un número.`);
      return n;
    }
    case "numeros": return (Array.isArray(v) ? v : []).map(Number).filter(Number.isFinite).slice(0, 60);
    case "opcion": return opciones.includes(v) ? v : "";
    default: return txt(v, 250);
  }
}

const vacio = v => (Array.isArray(v) ? !v.length : v === "" || v == null);

export function limpiarDocumento(mod, datos) {
  const campos = CAMPOS[mod];
  if (!campos) throw new HttpError(400, "Módulo no válido.");
  const out = {};
  for (const [k, [etiqueta, tipo, req, opciones]] of Object.entries(campos)) {
    out[k] = valor(tipo, datos?.[k], opciones, etiqueta);
    if (req && vacio(out[k])) throw new HttpError(400, `Completa el campo "${etiqueta}".`);
  }
  return out;
}

// Funciones: lista (o texto con una por línea / punto y coma). Se guardan una por línea y sin repetirse dentro del puesto.
export function limpiarPuesto(d) {
  const funciones = sinRepetirDentro((Array.isArray(d?.funciones) ? d.funciones : funcionesDe(d?.resp)).map(f => txt(f, 300)).filter(Boolean)).slice(0, 25);
  const out = {
    nombre: txt(d?.name, 200), dept: txt(d?.dept, 120), resp: funciones.join("\n"), obj: txt(d?.obj, 3000),
    comp: JSON.stringify(lista(d?.comp, 30)), perfil: txt(d?.perfil, 3000),
    indicadores: JSON.stringify(limpiarIndicadores(d?.indicadores)), plazas: entero(d?.plazas ?? 1, "Plazas", 1, 500),
  };
  if (!out.nombre) throw new HttpError(400, 'Completa el campo "Nombre del puesto".');
  if (!out.dept) throw new HttpError(400, 'Completa el campo "Departamento".');
  return out;
}

// Indicadores de estándar del puesto: [{nombre, meta, unidad, sentido}]
export function limpiarIndicadores(v) {
  return (Array.isArray(v) ? v : []).slice(0, 10).map(i => {
    const nombre = txt(i?.nombre, 150);
    if (!nombre) return null;
    const meta = Number(i?.meta);
    if (i?.meta === "" || i?.meta == null || !Number.isFinite(meta)) throw new HttpError(400, `El indicador "${nombre}" necesita una meta numérica.`);
    return { nombre, meta, unidad: txt(i?.unidad, 20), sentido: i?.sentido === "menor" ? "menor" : "mayor" };
  }).filter(Boolean);
}

function entero(v, etiqueta, min, max) {
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) throw new HttpError(400, `"${etiqueta}" debe ser un número entero entre ${min} y ${max}.`);
  return n;
}
const idDe = (v, etiqueta) => entero(v, etiqueta, 1, 2 ** 31 - 1);
const fecha = (v, etiqueta) => {
  const s = txt(v, 10);
  if (s && !/^\d{4}-\d{2}-\d{2}$/.test(s)) throw new HttpError(400, `"${etiqueta}" debe ser una fecha válida.`);
  return s;
};
const opcion = (v, opciones, etiqueta, defecto) => {
  if (v === "" || v == null) { if (defecto !== undefined) return defecto; throw new HttpError(400, `Elige una opción en "${etiqueta}".`); }
  if (!opciones.includes(v)) throw new HttpError(400, `Opción no válida en "${etiqueta}".`);
  return v;
};
// {nombre: número} con claves limitadas a las permitidas
const mapaNumeros = (v, claves, min = -1e9, max = 1e9) => {
  const out = {};
  for (const c of claves) {
    const x = v?.[c];
    if (x === "" || x == null) continue;
    const n = Number(x);
    if (!Number.isFinite(n) || n < min || n > max) throw new HttpError(400, `Valor no válido en "${c}".`);
    out[c] = n;
  }
  return out;
};

/* ---------- talento ---------- */
export const TIPOS_ACCION = ["Retroalimentación", "Plan de mejora", "Capacitación", "Seguimiento semanal", "Cambio de funciones", "Reconocimiento"];
export const DECISIONES = ["En evaluación", "Contratado", "En espera", "Descartado"];

export function limpiarColaborador(d) {
  const out = { nombre: limpiarNombre(d?.nombre, "Nombre completo", 150), puesto_id: idDe(d?.puesto, "Puesto"), email: txt(d?.email, 190).toLowerCase() || null, ingreso: fecha(d?.ingreso, "Fecha de ingreso") || null };
  if (out.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(out.email)) throw new HttpError(400, "Escribe un correo electrónico válido o déjalo vacío.");
  return out;
}

// periodo "AAAA-MM" que no sea futuro; resultados de los indicadores del puesto y nivel 1 a 4 de cada competencia.
export function limpiarEvaluacion(d, puesto, periodoMax) {
  const periodo = txt(d?.periodo, 7);
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(periodo)) throw new HttpError(400, "Elige el periodo (mes) de la evaluación.");
  if (periodo > periodoMax) throw new HttpError(400, "No se puede evaluar un mes que todavía no empieza.");
  const resultados = mapaNumeros(d?.resultados, (puesto.indicadores || []).map(i => i.nombre));
  const competencias = mapaNumeros(d?.competencias, puesto.comp || [], 1, 4);
  if (!Object.keys(resultados).length && !Object.keys(competencias).length) throw new HttpError(400, "Captura al menos un resultado o una competencia.");
  return { periodo, resultados, competencias, comentario: txt(d?.comentario, 2000) };
}

export function limpiarAccion(d) {
  const descripcion = txt(d?.descripcion, 1500);
  if (descripcion.length < 5) throw new HttpError(400, 'Describe la acción en "Qué se va a hacer".');
  return { tipo: opcion(d?.tipo, TIPOS_ACCION, "Tipo de acción"), descripcion, responsable: txt(d?.responsable, 150), fecha_limite: fecha(d?.fechaLimite, "Fecha límite") || null, ia: d?.ia ? 1 : 0 };
}

export function limpiarCandidato(d, comp) {
  const nombre = limpiarNombre(d?.nombre, "Nombre del candidato", 150);
  const prueba = d?.prueba === "" || d?.prueba == null ? "" : entero(Math.round(Number(d.prueba)), "Prueba técnica", 0, 100);
  const entrevista = d?.entrevista === "" || d?.entrevista == null ? "" : entero(Number(d.entrevista), "Entrevista", 1, 4);
  const datos = {
    fuente: opcion(d?.fuente, ["Bolsa de trabajo", "Referido", "Interno", "Agencia", "Redes sociales", "Otro"], "Fuente", "Otro"),
    fechaEntrevista: fecha(d?.fechaEntrevista, "Fecha de entrevista"),
    escolaridad: opcion(d?.escolaridad, ["Cumple", "Cumple parcialmente", "No cumple"], "Escolaridad"),
    experiencia: opcion(d?.experiencia, ["Cumple", "Cumple parcialmente", "No cumple"], "Experiencia"),
    competencias: mapaNumeros(d?.competencias, comp, 1, 4),
    prueba, entrevista,
    referencias: opcion(d?.referencias, ["Positivas", "Sin verificar", "Negativas"], "Referencias", "Sin verificar"),
    disponibilidad: opcion(d?.disponibilidad, ["Inmediata", "En 15 días o menos", "Más de 15 días"], "Disponibilidad", "Inmediata"),
    salario: opcion(d?.salario, ["Dentro del presupuesto", "Negociable", "Fuera del presupuesto"], "Expectativa económica", "Dentro del presupuesto"),
    fortalezas: txt(d?.fortalezas, 1500), riesgos: txt(d?.riesgos, 1500),
  };
  return { nombre, datos, decision: opcion(d?.decision, DECISIONES, "Decisión", "En evaluación"), justificacion: txt(d?.justificacion, 1500) };
}

/* ---------- usuarios, empresas e imágenes ---------- */
// Imagen como data URL PNG, JPG o WebP (ya reducida en el navegador). "" quita la imagen; undefined la deja igual.
export function limpiarImagen(v, etiqueta, maxKB) {
  if (v === undefined) return undefined;
  if (v === "" || v == null) return null;
  if (typeof v !== "string" || !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(v)) throw new HttpError(400, `${etiqueta}: sube una imagen PNG, JPG o WebP.`);
  if (v.length > maxKB * 1365) throw new HttpError(413, `${etiqueta}: la imagen es demasiado grande (máximo ${maxKB} KB).`);
  return v;
}

export function limpiarEmail(v) {
  const e = txt(v, 190).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) throw new HttpError(400, "Escribe un correo electrónico válido.");
  return e;
}

export function limpiarNombre(v, etiqueta = "Nombre", max = 120) {
  const n = txt(v, max);
  if (n.length < 2) throw new HttpError(400, `Completa el campo "${etiqueta}".`);
  return n;
}

export function limpiarPassword(v) {
  const p = String(v ?? "");
  if (p.length < 8) throw new HttpError(400, "La contraseña debe tener al menos 8 caracteres.");
  if (p.length > 200) throw new HttpError(400, "La contraseña es demasiado larga.");
  return p;
}

export function limpiarRol(v, roles) {
  if (!roles.includes(v)) throw new HttpError(400, "Elige un rol válido.");
  return v;
}
