// Acceso a la base de datos con Kysely: el mismo código funciona con PostgreSQL y con MySQL.
// - PostgreSQL (Neon en Vercel): DATABASE_URL=postgres://...
// - MySQL: DATABASE_URL=mysql://...  (o DB_DIALECT=mysql)
// Las tablas se crean solas la primera vez y se cargan los datos de ejemplo si la base está vacía.
// Para mantenerlo portable se evitan funciones exclusivas de un motor: los campos con listas se guardan como JSON en texto.
// Multiempresa: cada fila de usuarios, puestos, documentos e historial lleva empresa_id y toda consulta se filtra por él.
import { Kysely, PostgresDialect, MysqlDialect } from "kysely";
import { HttpError } from "./http.js";
import { hashPassword } from "./password.js";
import { PASSWORD_DEMO, PUESTOS, PUESTOS_NORTE, MODULOS, EMPRESAS, SUPER, ESTRUCTURA_DEMO, COLABORADORES_DEMO, CANDIDATOS_DEMO } from "./seed.js";
import { calificar, diagnostico, recomendaciones, alertas, evaluarCandidato } from "./talento.js";
import { funcionesRepetidas } from "./estructura.js";

export const MODULOS_DOC = ["procesos", "competencias", "politicas", "kpis"];
export let dialecto = "postgres";
let listo = null;

// Conexión compartida entre invocaciones de la misma instancia (una sola migración por arranque en frío).
export function db() {
  return (listo ??= iniciar().catch(e => { listo = null; throw e; }));
}

async function iniciar() {
  let dialect;
  if (globalThis.__dbDialect) {
    // Usado por el servidor de desarrollo local (PGlite) y las pruebas.
    dialect = globalThis.__dbDialect;
    dialecto = globalThis.__dbDialectName || "postgres";
  } else {
    const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
    if (!url) throw new HttpError(500, "Falta DATABASE_URL: conecta una base de datos al proyecto en Vercel (Storage).");
    dialecto = process.env.DB_DIALECT || (url.startsWith("mysql") ? "mysql" : "postgres");
    if (dialecto === "mysql") {
      const mysql = await import("mysql2");
      const createPool = mysql.createPool || mysql.default.createPool;
      dialect = new MysqlDialect({ pool: createPool({ uri: url, connectionLimit: 3 }) });
    } else {
      const { default: pg } = await import("pg");
      dialect = new PostgresDialect({ pool: new pg.Pool({ connectionString: url, max: 3 }) });
    }
  }
  const k = new Kysely({ dialect });
  await migrar(k);
  await sembrarSiVacia(k);
  await migrarTalento(k);
  return k;
}

/* ---------- esquema ---------- */
const NN = c => c.notNull();
const FECHA = "varchar(40)";
// Imágenes (logo y foto de perfil) como data URL; en MySQL "text" se queda corto (64 KB).
const IMAGEN = () => (dialecto === "mysql" ? "mediumtext" : "text");

async function migrar(k) {
  const tabla = nombre => {
    const t = k.schema.createTable(nombre).ifNotExists();
    return dialecto === "mysql" ? t.addColumn("id", "integer", c => c.primaryKey().autoIncrement()) : t.addColumn("id", "serial", c => c.primaryKey());
  };
  await tabla("empresas")
    .addColumn("nombre", "varchar(150)", NN)
    .addColumn("logo", IMAGEN())
    .addColumn("plantilla", "varchar(20)", NN)
    .addColumn("activa", "integer", c => c.notNull().defaultTo(1))
    .addColumn("creado_el", FECHA)
    .execute();
  await tabla("usuarios")
    .addColumn("email", "varchar(190)", c => c.notNull().unique())
    .addColumn("nombre", "varchar(120)", NN)
    .addColumn("rol", "varchar(40)", NN)
    .addColumn("pass_hash", "varchar(255)", NN)
    .addColumn("activo", "integer", c => c.notNull().defaultTo(1))
    .addColumn("creado_el", FECHA)
    .execute();
  await tabla("puestos")
    .addColumn("parent_id", "integer")
    .addColumn("nombre", "varchar(200)", NN)
    .addColumn("dept", "varchar(120)", NN)
    .addColumn("resp", "text")
    .addColumn("obj", "text")
    .addColumn("comp", "text")
    .addColumn("perfil", "text")
    .addColumn("estado", "varchar(20)", NN)
    .addColumn("creado_por", "varchar(120)")
    .addColumn("actualizado_el", FECHA)
    .execute();
  // Procesos, competencias, políticas y KPIs: columnas comunes + "datos" (JSON con los campos propios del módulo).
  await tabla("documentos")
    .addColumn("modulo", "varchar(20)", NN)
    .addColumn("codigo", "varchar(40)", NN)
    .addColumn("nombre", "varchar(250)", NN)
    .addColumn("estado", "varchar(20)", NN)
    .addColumn("version", "integer", NN)
    .addColumn("datos", "text", NN)
    .addColumn("aprobado_por", "varchar(120)")
    .addColumn("aprobado_el", FECHA)
    .addColumn("creado_por", "varchar(120)")
    .addColumn("actualizado_el", FECHA)
    .execute();
  await tabla("historial")
    .addColumn("modulo", "varchar(20)", NN)
    .addColumn("registro_id", "integer", NN)
    .addColumn("version", "integer", NN)
    .addColumn("fecha", FECHA, NN)
    .addColumn("autor", "varchar(120)", NN)
    .addColumn("nota", "varchar(250)", NN)
    .execute();
  await k.schema.createTable("config").ifNotExists()
    .addColumn("clave", "varchar(60)", c => c.primaryKey())
    .addColumn("valor", "text", NN)
    .execute();

  // Talento: personas que ocupan los puestos, sus evaluaciones, las acciones de mejora y los candidatos a contratar.
  await tabla("colaboradores")
    .addColumn("empresa_id", "integer", NN)
    .addColumn("puesto_id", "integer", NN)
    .addColumn("nombre", "varchar(150)", NN)
    .addColumn("email", "varchar(190)")
    .addColumn("ingreso", "varchar(10)")
    .addColumn("activo", "integer", c => c.notNull().defaultTo(1))
    .addColumn("creado_el", FECHA)
    .execute();
  await tabla("evaluaciones")
    .addColumn("empresa_id", "integer", NN)
    .addColumn("colaborador_id", "integer", NN)
    .addColumn("periodo", "varchar(7)", NN)
    .addColumn("resultados", "text", NN)
    .addColumn("competencias", "text", NN)
    .addColumn("puntaje", "integer")
    .addColumn("desglose", "text", NN)
    .addColumn("comentario", "text")
    .addColumn("evaluador", "varchar(120)")
    .addColumn("fecha", FECHA, NN)
    .execute();
  await tabla("acciones")
    .addColumn("empresa_id", "integer", NN)
    .addColumn("colaborador_id", "integer", NN)
    .addColumn("tipo", "varchar(40)", NN)
    .addColumn("descripcion", "text", NN)
    .addColumn("responsable", "varchar(150)")
    .addColumn("fecha_limite", "varchar(10)")
    .addColumn("estado", "varchar(20)", NN)
    .addColumn("ia", "integer", c => c.notNull().defaultTo(0))
    .addColumn("creado_por", "varchar(120)")
    .addColumn("creado_el", FECHA, NN)
    .addColumn("cerrado_el", FECHA)
    .execute();
  await tabla("candidatos")
    .addColumn("empresa_id", "integer", NN)
    .addColumn("puesto_id", "integer", NN)
    .addColumn("nombre", "varchar(150)", NN)
    .addColumn("datos", "text", NN)
    .addColumn("puntaje", "integer")
    .addColumn("recomendacion", "varchar(40)")
    .addColumn("decision", "varchar(30)", NN)
    .addColumn("justificacion", "text")
    .addColumn("evaluador", "varchar(120)")
    .addColumn("creado_el", FECHA)
    .addColumn("actualizado_el", FECHA)
    .execute();

  // Columnas agregadas después: se crean también en bases que ya existían (sin perder datos).
  await asegurarColumnas(k, {
    usuarios: [["empresa_id", "integer"], ["foto", IMAGEN()]],
    puestos: [["empresa_id", "integer"], ["indicadores", "text"], ["plazas", "integer"]],
    documentos: [["empresa_id", "integer"]],
    historial: [["empresa_id", "integer"]],
  });
}

async function asegurarColumnas(k, faltantes) {
  const tablas = await k.introspection.getTables();
  for (const [nombre, cols] of Object.entries(faltantes)) {
    const t = tablas.find(x => x.name === nombre);
    for (const [col, tipo] of cols) {
      if (t?.columns.some(c => c.name === col)) continue;
      try { await k.schema.alterTable(nombre).addColumn(col, tipo).execute(); }
      catch (e) { if (!/exist|duplicate/i.test(e.message)) throw e; } // otra instancia la agregó al mismo tiempo
    }
  }
}

/* ---------- datos de ejemplo ---------- */
export const ahora = () => new Date().toISOString();
export const hoy = () => new Date().toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric", timeZone: "America/Mexico_City" });
export const nombreDe = (mod, d) => (mod === "politicas" ? d.titulo : d.nombre);

// INSERT portable: PostgreSQL devuelve el id con RETURNING; MySQL lo da en insertId.
export async function insertar(q, tablaNombre, valores) {
  if (dialecto === "mysql") {
    const r = await q.insertInto(tablaNombre).values(valores).executeTakeFirstOrThrow();
    return Number(r.insertId);
  }
  const r = await q.insertInto(tablaNombre).values(valores).returning("id").executeTakeFirstOrThrow();
  return Number(r.id);
}

export const ROLES_EMPRESA = ["Administrador", "Recursos Humanos", "Calidad", "Dirección"];
export const ROL_SUPER = "Súper administrador";

// Crea las empresas y cuentas de ejemplo. En una base anterior a multiempresa, sus datos quedan como "Empresa Demo".
async function sembrarSiVacia(k) {
  const r = await k.selectFrom("empresas").select(k.fn.countAll().as("n")).executeTakeFirst();
  if (Number(r?.n) > 0) return;
  try {
    await k.transaction().execute(async tx => {
      // Marca de la migración: si otra instancia ya la hizo, la clave duplicada cancela esta transacción.
      await tx.insertInto("config").values({ clave: "multiempresa", valor: ahora() }).execute();
      const pass_hash = await hashPassword(PASSWORD_DEMO);
      const previos = Number((await tx.selectFrom("usuarios").select(tx.fn.countAll().as("n")).executeTakeFirst())?.n);
      for (const e of EMPRESAS) {
        const eid = await insertar(tx, "empresas", { nombre: e.nombre, logo: e.logo, plantilla: e.plantilla, activa: 1, creado_el: ahora() });
        if (e.clave === "demo" && previos > 0) {
          for (const t of ["usuarios", "puestos", "documentos", "historial"]) {
            await tx.updateTable(t).set({ empresa_id: eid }).where("empresa_id", "is", null).execute();
          }
          continue;
        }
        for (const u of e.usuarios) {
          await tx.insertInto("usuarios").values({ ...u, empresa_id: eid, pass_hash, activo: 1, creado_el: ahora() }).execute();
        }
        await sembrarDatos(tx, eid, e.plantilla);
      }
      const existe = await tx.selectFrom("usuarios").select("id").where("email", "=", SUPER.email).executeTakeFirst();
      if (!existe) await tx.insertInto("usuarios").values({ ...SUPER, empresa_id: null, pass_hash, activo: 1, creado_el: ahora() }).execute();
    });
  } catch (e) {
    const hecho = await k.selectFrom("empresas").select("id").executeTakeFirst();
    if (!hecho) throw e;
  }
}

// Carga puestos y documentos de ejemplo de una empresa (no toca usuarios). Los ids del archivo de ejemplo se traducen a los reales.
export async function sembrarDatos(tx, empresa_id, plantilla = "demo") {
  const lista = plantilla === "demo" ? PUESTOS : plantilla === "norte" ? PUESTOS_NORTE : [];
  const ids = new Map();
  for (const p of lista) {
    const id = await insertar(tx, "puestos", {
      empresa_id, parent_id: p.parent == null ? null : ids.get(p.parent), nombre: p.name, dept: p.dept, resp: p.resp, obj: p.obj,
      comp: JSON.stringify(p.comp || []), perfil: p.perfil, estado: p.status, creado_por: "Datos de ejemplo", actualizado_el: ahora(),
    });
    ids.set(p.id, id);
  }
  if (plantilla !== "demo") return;
  for (const mod of MODULOS_DOC) {
    for (const it of MODULOS[mod]) {
      const { id: _id, codigo, estado, version, aprobadoPor, aprobadoEl, historial = [], ...datos } = it;
      if (datos.responsable) datos.responsable = ids.get(datos.responsable) ?? "";
      if (Array.isArray(datos.puestos)) datos.puestos = datos.puestos.map(x => ids.get(x)).filter(Boolean);
      const nid = await insertar(tx, "documentos", {
        empresa_id, modulo: mod, codigo, nombre: nombreDe(mod, datos), estado, version, datos: JSON.stringify(datos),
        aprobado_por: aprobadoPor || null, aprobado_el: aprobadoEl || null, creado_por: "Datos de ejemplo", actualizado_el: ahora(),
      });
      for (const h of historial) {
        await tx.insertInto("historial").values({ empresa_id, modulo: mod, registro_id: nid, version: h.v, fecha: h.fecha, autor: h.autor, nota: h.nota }).execute();
      }
    }
  }
  await sembrarTalento(tx, empresa_id);
}

const TABLAS_TALENTO = ["acciones", "evaluaciones", "candidatos", "colaboradores"];

// Borra y vuelve a cargar los datos de ejemplo de UNA empresa; las demás no se tocan.
export async function restablecer(k, empresa_id) {
  const e = await k.selectFrom("empresas").select("plantilla").where("id", "=", empresa_id).executeTakeFirst();
  await k.transaction().execute(async tx => {
    for (const t of [...TABLAS_TALENTO, "historial", "documentos", "puestos"]) await tx.deleteFrom(t).where("empresa_id", "=", empresa_id).execute();
    await sembrarDatos(tx, empresa_id, e?.plantilla);
  });
}

/* ---------- talento de ejemplo ---------- */
// "2026-10": los n meses completos anteriores al mes actual, del más antiguo al más reciente.
export function ultimosPeriodos(n, fecha = new Date()) {
  const out = [];
  for (let i = n; i >= 1; i--) {
    const d = new Date(Date.UTC(fecha.getUTCFullYear(), fecha.getUTCMonth() - i, 1));
    out.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}
export const periodoActual = () => ultimosPeriodos(1)[0];
// Fecha en que se registra la evaluación de un periodo: el día 3 del mes siguiente (nunca en el futuro, salvo fechas límite).
const fechaDePeriodo = (p, dias = 0, futuro = false) => {
  const [y, m] = p.split("-").map(Number), f = new Date(Date.UTC(y, m, 3 + dias, 16));
  return (!futuro && f > new Date() ? new Date(Date.now() - (2 - dias) * 36e5) : f).toISOString();
};

const kpisDe = async (q, E) => (await q.selectFrom("documentos").selectAll().where("empresa_id", "=", E).where("modulo", "=", "kpis").execute()).map(r => docOut(r));

// Indicadores, plazas, colaboradores con 3 meses de evaluaciones, una acción y candidatos.
// Los puestos se buscan por nombre, así sirve tanto al crear la empresa como al actualizar una base existente.
export async function sembrarTalento(tx, E) {
  const ps = await tx.selectFrom("puestos").selectAll().where("empresa_id", "=", E).execute();
  const porNombre = new Map(ps.map(p => [p.nombre, p]));
  if (!porNombre.has("Director General")) return; // solo la plantilla "demo"
  for (const [nombre, est] of Object.entries(ESTRUCTURA_DEMO)) {
    const p = porNombre.get(nombre);
    if (!p) continue;
    await tx.updateTable("puestos").set({ indicadores: JSON.stringify(est.indicadores), plazas: est.plazas }).where("id", "=", p.id).execute();
    p.indicadores = JSON.stringify(est.indicadores);
  }
  const kpis = await kpisDe(tx, E);
  const periodos = ultimosPeriodos(3);
  for (const c of COLABORADORES_DEMO) {
    const p = porNombre.get(c.puesto);
    if (!p) continue;
    const puesto = puestoOut(p);
    const cid = await insertar(tx, "colaboradores", { empresa_id: E, puesto_id: p.id, nombre: c.nombre, email: null, ingreso: c.ingreso, activo: 1, creado_el: ahora() });
    let ultima = null;
    for (let i = 0; i < c.f.length; i++) {
      const f = c.f[i];
      const resultados = {};
      puesto.indicadores.forEach((ind, j) => {
        const g = j === c.debil ? f - 0.1 * i : f + 0.03;
        let v = ind.sentido === "menor" ? ind.meta / Math.max(g, 0.2) : ind.meta * g;
        v = ind.unidad === "eventos" ? Math.round(v) : Math.round(v * 10) / 10;
        resultados[ind.nombre] = v;
      });
      const competencias = Object.fromEntries(puesto.comp.map((n, j) => [n, Math.max(1, Math.min(4, Math.round(f * 4 + (j % 2 ? -0.4 : 0.1))))]));
      const cal = calificar(puesto, resultados, competencias, kpis.filter(k => Number(k.responsable) === puesto.id));
      ultima = fechaDePeriodo(periodos[i]);
      await tx.insertInto("evaluaciones").values({
        empresa_id: E, colaborador_id: cid, periodo: periodos[i], resultados: JSON.stringify(resultados), competencias: JSON.stringify(competencias),
        puntaje: cal.puntaje, desglose: JSON.stringify(cal), comentario: null, evaluador: "Datos de ejemplo", fecha: ultima,
      }).execute();
    }
    if (c.accion && ultima) {
      await tx.insertInto("acciones").values({
        empresa_id: E, colaborador_id: cid, tipo: "Plan de mejora", descripcion: "Revisar semanalmente el cumplimiento del plan de producción del turno y acordar mejoras con el Gerente de Operaciones.",
        responsable: "Gerente de Operaciones", fecha_limite: fechaDePeriodo(periodos[2], 30, true).slice(0, 10), estado: "Abierta", ia: 0, creado_por: "Datos de ejemplo", creado_el: fechaDePeriodo(periodos[2], 1), cerrado_el: null,
      }).execute();
    }
  }
  for (const c of CANDIDATOS_DEMO) {
    const p = porNombre.get(c.puesto);
    if (!p) continue;
    const comp = puestoOut(p).comp;
    const { comp: niveles, puesto: _p, nombre, decision, justificacion = "", ...resto } = c;
    const datos = { ...resto, competencias: Object.fromEntries(comp.map((n, j) => [n, niveles[j] ?? null])) };
    const ev = evaluarCandidato(datos, comp);
    await insertar(tx, "candidatos", {
      empresa_id: E, puesto_id: p.id, nombre, datos: JSON.stringify(datos), puntaje: ev.puntaje, recomendacion: ev.recomendacion,
      decision, justificacion, evaluador: "Datos de ejemplo", creado_el: ahora(), actualizado_el: ahora(),
    });
  }
}

// Bases que ya existían antes del módulo de talento: se les agregan los datos de ejemplo una sola vez.
async function migrarTalento(k) {
  const hecho = await k.selectFrom("config").select("valor").where("clave", "=", "talento_v1").executeTakeFirst();
  if (hecho) return;
  try {
    await k.transaction().execute(async tx => {
      await tx.insertInto("config").values({ clave: "talento_v1", valor: ahora() }).execute();
      const empresas = await tx.selectFrom("empresas").select(["id", "plantilla"]).where("plantilla", "=", "demo").execute();
      for (const e of empresas) {
        const n = await tx.selectFrom("colaboradores").select(tx.fn.countAll().as("n")).where("empresa_id", "=", e.id).executeTakeFirst();
        if (Number(n?.n) === 0) await sembrarTalento(tx, Number(e.id));
      }
    });
  } catch (e) {
    const ya = await k.selectFrom("config").select("valor").where("clave", "=", "talento_v1").executeTakeFirst();
    if (!ya) throw e; // si otra instancia hizo la migración al mismo tiempo, no pasa nada
  }
}

/* ---------- lectura en el formato que usa la página ---------- */
const parse = (s, d) => { try { return JSON.parse(s) ?? d; } catch { return d; } };

export const puestoOut = r => ({
  id: Number(r.id), parent: r.parent_id == null ? null : Number(r.parent_id), name: r.nombre, dept: r.dept,
  resp: r.resp || "", obj: r.obj || "", comp: parse(r.comp, []), perfil: r.perfil || "", status: r.estado,
  indicadores: parse(r.indicadores, []), plazas: r.plazas == null ? 1 : Number(r.plazas),
});

export const colabOut = r => ({ id: Number(r.id), puesto: Number(r.puesto_id), nombre: r.nombre, email: r.email || "", ingreso: r.ingreso || "", activo: Number(r.activo) === 1 });
export const evalOut = r => {
  const desglose = parse(r.desglose, {});
  return {
    id: Number(r.id), colaborador: Number(r.colaborador_id), periodo: r.periodo, fecha: r.fecha, puntaje: r.puntaje == null ? null : Number(r.puntaje),
    nivel: desglose.nivel || "Sin evaluar", desglose, resultados: parse(r.resultados, {}), competencias: parse(r.competencias, {}), comentario: r.comentario || "", evaluador: r.evaluador || "",
  };
};
export const accionOut = r => ({
  id: Number(r.id), colaborador: Number(r.colaborador_id), tipo: r.tipo, descripcion: r.descripcion, responsable: r.responsable || "", fechaLimite: r.fecha_limite || "",
  estado: r.estado, ia: Number(r.ia) === 1, creadoPor: r.creado_por || "", creado: r.creado_el, cerradoEl: r.cerrado_el || "",
});
export const candOut = (r, comp = []) => {
  const datos = parse(r.datos, {});
  return { ...datos, id: Number(r.id), puesto: Number(r.puesto_id), nombre: r.nombre, puntaje: r.puntaje == null ? null : Number(r.puntaje), recomendacion: r.recomendacion || "",
    ...(({ partes, filtros }) => ({ partes, filtros }))(evaluarCandidato(datos, comp)), decision: r.decision, justificacion: r.justificacion || "", evaluador: r.evaluador || "", creado: r.creado_el || "" };
};

export const docOut = (r, hist = []) => ({
  ...parse(r.datos, {}),
  id: Number(r.id), codigo: r.codigo, estado: r.estado, version: Number(r.version),
  aprobadoPor: r.aprobado_por || "", aprobadoEl: r.aprobado_el || "",
  historial: hist.map(h => ({ v: Number(h.version), fecha: h.fecha, autor: h.autor, nota: h.nota })),
});

export async function historialDe(k, empresa_id, mod, id) {
  return k.selectFrom("historial").selectAll().where("empresa_id", "=", empresa_id).where("modulo", "=", mod).where("registro_id", "=", id).orderBy("id").execute();
}

export const VACIO = () => Object.fromEntries([["puestos", []], ...MODULOS_DOC.map(m => [m, []]),
  ...["colaboradores", "evaluaciones", "acciones", "candidatos", "desempeno", "alertas", "duplicados"].map(m => [m, []])]);

export async function cargarTodo(k, empresa_id) {
  const [ps, docs, hist] = await Promise.all([
    k.selectFrom("puestos").selectAll().where("empresa_id", "=", empresa_id).orderBy("id").execute(),
    k.selectFrom("documentos").selectAll().where("empresa_id", "=", empresa_id).orderBy("id").execute(),
    k.selectFrom("historial").selectAll().where("empresa_id", "=", empresa_id).orderBy("id").execute(),
  ]);
  const porDoc = new Map();
  for (const h of hist) {
    const key = `${h.modulo}:${h.registro_id}`;
    if (!porDoc.has(key)) porDoc.set(key, []);
    porDoc.get(key).push(h);
  }
  const out = { puestos: ps.map(puestoOut) };
  for (const m of MODULOS_DOC) out[m] = docs.filter(d => d.modulo === m).map(d => docOut(d, porDoc.get(`${m}:${d.id}`)));
  Object.assign(out, await cargarTalento(k, empresa_id, out.puestos));
  return out;
}

// Colaboradores, evaluaciones, acciones y candidatos, más lo que se calcula con ellos:
// desempeño de cada persona (nivel, tendencia, en qué baja, recomendaciones), alertas y funciones repetidas.
export async function cargarTalento(k, E, puestos) {
  puestos ??= (await k.selectFrom("puestos").selectAll().where("empresa_id", "=", E).orderBy("id").execute()).map(puestoOut);
  const [cs, evs, acs, cands] = await Promise.all(["colaboradores", "evaluaciones", "acciones", "candidatos"].map(t => k.selectFrom(t).selectAll().where("empresa_id", "=", E).orderBy("id").execute()));
  const colaboradores = cs.map(colabOut), evaluaciones = evs.map(evalOut), acciones = acs.map(accionOut);
  const compDe = id => puestos.find(p => p.id === id)?.comp || [];
  const candidatos = cands.map(r => candOut(r, compDe(Number(r.puesto_id))));
  const desempeno = colaboradores.map(c => {
    const mias = evaluaciones.filter(e => e.colaborador === c.id).sort((a, b) => a.periodo.localeCompare(b.periodo));
    const ult = mias.at(-1), ant = mias.at(-2), d = diagnostico(ult, ant);
    const puesto = puestos.find(p => p.id === c.puesto), jefe = puestos.find(p => p.id === puesto?.parent)?.name;
    return {
      colaborador: c.id, puntaje: ult?.puntaje ?? null, nivel: ult?.nivel || "Sin evaluar", periodo: ult?.periodo || "", cambio: d.cambio,
      tendencia: mias.map(e => ({ periodo: e.periodo, puntaje: e.puntaje })), bajando: d.bajando, debajo: d.debajo, recomendaciones: ult ? recomendaciones(d, jefe) : [],
    };
  });
  return {
    colaboradores, evaluaciones, acciones, candidatos, desempeno,
    alertas: alertas(colaboradores, evaluaciones, acciones, puestos, periodoActual()),
    duplicados: funcionesRepetidas(puestos),
    periodoActual: periodoActual(),
  };
}
