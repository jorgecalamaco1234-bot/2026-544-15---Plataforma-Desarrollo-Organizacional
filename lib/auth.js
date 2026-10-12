// Sesiones con cookie firmada (HttpOnly) y permisos por rol.
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { db } from "./db.js";
import { HttpError } from "./http.js";

const COOKIE = "do_sesion";
const HORAS = 8;

// Qué rol puede editar (crear, modificar, enviar a revisión, eliminar) y aprobar en cada módulo.
export const PERMISOS = {
  editar: {
    puestos: ["Administrador", "Recursos Humanos"],
    procesos: ["Administrador", "Calidad"],
    competencias: ["Administrador", "Recursos Humanos"],
    politicas: ["Administrador", "Recursos Humanos", "Calidad"],
    kpis: ["Administrador", "Recursos Humanos", "Calidad"],
  },
  aprobar: {
    puestos: ["Administrador", "Calidad"],
    procesos: ["Administrador", "Calidad"],
    competencias: ["Administrador", "Recursos Humanos"],
    politicas: ["Administrador", "Dirección"],
    kpis: ["Administrador", "Calidad", "Dirección"],
  },
};

export const puede = (u, accion, mod) => !!u && (PERMISOS[accion]?.[mod] || []).includes(u.rol);
export const esAdmin = u => u?.rol === "Administrador";
export const permisosDe = u => ({
  editar: Object.keys(PERMISOS.editar).filter(m => puede(u, "editar", m)),
  aprobar: Object.keys(PERMISOS.aprobar).filter(m => puede(u, "aprobar", m)),
  admin: esAdmin(u),
});
export const usuarioPublico = u => ({ id: Number(u.id), email: u.email, n: u.nombre, r: u.rol, permisos: permisosDe(u) });

// Clave para firmar las sesiones: SESSION_SECRET si existe; si no, una clave aleatoria guardada en la base de datos.
let secretoCache = null;
async function secreto() {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  if (secretoCache) return secretoCache;
  const k = await db();
  const leer = () => k.selectFrom("config").select("valor").where("clave", "=", "session_secret").executeTakeFirst();
  let r = await leer();
  if (!r) {
    try { await k.insertInto("config").values({ clave: "session_secret", valor: randomBytes(32).toString("hex") }).execute(); } catch { /* otra instancia la creó al mismo tiempo */ }
    r = await leer();
  }
  return (secretoCache = r.valor);
}

const firmar = async payload => createHmac("sha256", await secreto()).update(payload).digest("base64url");

export async function crearToken(u) {
  const payload = Buffer.from(JSON.stringify({ uid: Number(u.id), exp: Date.now() + HORAS * 3600e3 })).toString("base64url");
  return `${payload}.${await firmar(payload)}`;
}

async function leerToken(token) {
  const [payload, firma] = String(token || "").split(".");
  if (!payload || !firma) return null;
  const esperada = Buffer.from(await firmar(payload));
  const recibida = Buffer.from(firma);
  if (esperada.length !== recibida.length || !timingSafeEqual(esperada, recibida)) return null;
  try {
    const d = JSON.parse(Buffer.from(payload, "base64url").toString());
    return d.exp > Date.now() ? d : null;
  } catch { return null; }
}

function leerCookie(req) {
  const par = String(req.headers.cookie || "").split(/;\s*/).find(c => c.startsWith(COOKIE + "="));
  return par ? decodeURIComponent(par.slice(COOKIE.length + 1)) : null;
}

export function ponerCookie(res, token) {
  const seguro = process.env.VERCEL ? "; Secure" : ""; // en local (http) el navegador rechazaría una cookie Secure
  res.setHeader("Set-Cookie", `${COOKIE}=${token || ""}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${token ? HORAS * 3600 : 0}${seguro}`);
}

export async function usuarioActual(req) {
  const d = await leerToken(leerCookie(req));
  if (!d) return null;
  const k = await db();
  const u = await k.selectFrom("usuarios").select(["id", "email", "nombre", "rol", "activo"]).where("id", "=", d.uid).executeTakeFirst();
  return u && Number(u.activo) === 1 ? u : null;
}

// Exige sesión; si se indica acción y módulo, exige además el permiso del rol.
export async function requireUser(req, accion, mod) {
  const u = await usuarioActual(req);
  if (!u) throw new HttpError(401, "Tu sesión expiró. Inicia sesión de nuevo.");
  if (accion && !puede(u, accion, mod)) throw new HttpError(403, `Tu rol (${u.rol}) no tiene permiso para esta acción.`);
  return u;
}
