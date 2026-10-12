// Validación y limpieza en el servidor de los datos de cada módulo.
import { HttpError } from "./http.js";

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

export function limpiarPuesto(d) {
  const out = {
    nombre: txt(d?.name, 200), dept: txt(d?.dept, 120), resp: txt(d?.resp, 3000), obj: txt(d?.obj, 3000),
    comp: JSON.stringify(lista(d?.comp, 30)), perfil: txt(d?.perfil, 3000),
  };
  if (!out.nombre) throw new HttpError(400, 'Completa el campo "Nombre del puesto".');
  if (!out.dept) throw new HttpError(400, 'Completa el campo "Departamento".');
  return out;
}
