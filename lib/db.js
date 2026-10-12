// Acceso a la base de datos con Kysely: el mismo código funciona con PostgreSQL y con MySQL.
// - PostgreSQL (Neon en Vercel): DATABASE_URL=postgres://...
// - MySQL: DATABASE_URL=mysql://...  (o DB_DIALECT=mysql)
// Las tablas se crean solas la primera vez y se cargan los datos de ejemplo si la base está vacía.
// Para mantenerlo portable se evitan funciones exclusivas de un motor: los campos con listas se guardan como JSON en texto.
import { Kysely, PostgresDialect, MysqlDialect } from "kysely";
import { HttpError } from "./http.js";
import { hashPassword } from "./password.js";
import { USUARIOS, PASSWORD_DEMO, PUESTOS, MODULOS } from "./seed.js";

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
  return k;
}

/* ---------- esquema ---------- */
const NN = c => c.notNull();
const FECHA = "varchar(40)";

async function migrar(k) {
  const tabla = nombre => {
    const t = k.schema.createTable(nombre).ifNotExists();
    return dialecto === "mysql" ? t.addColumn("id", "integer", c => c.primaryKey().autoIncrement()) : t.addColumn("id", "serial", c => c.primaryKey());
  };
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

async function sembrarSiVacia(k) {
  const r = await k.selectFrom("usuarios").select(k.fn.countAll().as("n")).executeTakeFirst();
  if (Number(r?.n) > 0) return;
  await k.transaction().execute(async tx => {
    for (const u of USUARIOS) {
      await tx.insertInto("usuarios").values({ ...u, pass_hash: await hashPassword(PASSWORD_DEMO), activo: 1, creado_el: ahora() }).execute();
    }
    await sembrarDatos(tx);
  });
}

// Carga puestos y documentos de ejemplo (no toca usuarios). Los ids del archivo de ejemplo se traducen a los reales.
export async function sembrarDatos(tx) {
  const ids = new Map();
  for (const p of PUESTOS) {
    const id = await insertar(tx, "puestos", {
      parent_id: p.parent == null ? null : ids.get(p.parent), nombre: p.name, dept: p.dept, resp: p.resp, obj: p.obj,
      comp: JSON.stringify(p.comp || []), perfil: p.perfil, estado: p.status, creado_por: "Datos de ejemplo", actualizado_el: ahora(),
    });
    ids.set(p.id, id);
  }
  for (const mod of MODULOS_DOC) {
    for (const it of MODULOS[mod]) {
      const { id: _id, codigo, estado, version, aprobadoPor, aprobadoEl, historial = [], ...datos } = it;
      if (datos.responsable) datos.responsable = ids.get(datos.responsable) ?? "";
      if (Array.isArray(datos.puestos)) datos.puestos = datos.puestos.map(x => ids.get(x)).filter(Boolean);
      const nid = await insertar(tx, "documentos", {
        modulo: mod, codigo, nombre: nombreDe(mod, datos), estado, version, datos: JSON.stringify(datos),
        aprobado_por: aprobadoPor || null, aprobado_el: aprobadoEl || null, creado_por: "Datos de ejemplo", actualizado_el: ahora(),
      });
      for (const h of historial) {
        await tx.insertInto("historial").values({ modulo: mod, registro_id: nid, version: h.v, fecha: h.fecha, autor: h.autor, nota: h.nota }).execute();
      }
    }
  }
}

export async function restablecer(k) {
  await k.transaction().execute(async tx => {
    await tx.deleteFrom("historial").execute();
    await tx.deleteFrom("documentos").execute();
    await tx.deleteFrom("puestos").execute();
    await sembrarDatos(tx);
  });
}

/* ---------- lectura en el formato que usa la página ---------- */
const parse = (s, d) => { try { return JSON.parse(s) ?? d; } catch { return d; } };

export const puestoOut = r => ({
  id: Number(r.id), parent: r.parent_id == null ? null : Number(r.parent_id), name: r.nombre, dept: r.dept,
  resp: r.resp || "", obj: r.obj || "", comp: parse(r.comp, []), perfil: r.perfil || "", status: r.estado,
});

export const docOut = (r, hist = []) => ({
  ...parse(r.datos, {}),
  id: Number(r.id), codigo: r.codigo, estado: r.estado, version: Number(r.version),
  aprobadoPor: r.aprobado_por || "", aprobadoEl: r.aprobado_el || "",
  historial: hist.map(h => ({ v: Number(h.version), fecha: h.fecha, autor: h.autor, nota: h.nota })),
});

export async function historialDe(k, mod, id) {
  return k.selectFrom("historial").selectAll().where("modulo", "=", mod).where("registro_id", "=", id).orderBy("id").execute();
}

export async function cargarTodo(k) {
  const [ps, docs, hist] = await Promise.all([
    k.selectFrom("puestos").selectAll().orderBy("id").execute(),
    k.selectFrom("documentos").selectAll().orderBy("id").execute(),
    k.selectFrom("historial").selectAll().orderBy("id").execute(),
  ]);
  const porDoc = new Map();
  for (const h of hist) {
    const key = `${h.modulo}:${h.registro_id}`;
    if (!porDoc.has(key)) porDoc.set(key, []);
    porDoc.get(key).push(h);
  }
  const out = { puestos: ps.map(puestoOut) };
  for (const m of MODULOS_DOC) out[m] = docs.filter(d => d.modulo === m).map(d => docOut(d, porDoc.get(`${m}:${d.id}`)));
  return out;
}
