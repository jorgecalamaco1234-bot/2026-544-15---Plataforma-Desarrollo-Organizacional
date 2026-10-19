// Usuarios de la empresa (solo su Administrador).
//   GET: lista de usuarios de la empresa.
//   POST {op:"create", nombre, email, rol, password} | {op:"update", id, nombre, rol, activo} | {op:"password", id, password}
import { db, insertar, ahora, ROLES_EMPRESA } from "../lib/db.js";
import { readBody, fail, HttpError, requireSameOrigin } from "../lib/http.js";
import { requireEmpresa, esAdmin } from "../lib/auth.js";
import { hashPassword } from "../lib/password.js";
import { limpiarEmail, limpiarNombre, limpiarPassword, limpiarRol } from "../lib/validar.js";

const salida = r => ({ id: Number(r.id), nombre: r.nombre, email: r.email, rol: r.rol, activo: Number(r.activo) === 1, foto: r.foto || "", creado: r.creado_el || "" });

export default async function handler(req, res) {
  try {
    const u = await requireEmpresa(req);
    if (!esAdmin(u)) throw new HttpError(403, "Solo el Administrador de la empresa puede gestionar usuarios.");
    const k = await db();
    const E = u.empresa_id;
    const lista = async () => (await k.selectFrom("usuarios").selectAll().where("empresa_id", "=", E).orderBy("id").execute()).map(salida);

    if (req.method === "GET") return res.status(200).json({ usuarios: await lista() });
    if (req.method !== "POST") return res.status(405).json({ error: "Método no permitido." });
    requireSameOrigin(req);
    const b = readBody(req);

    if (b.op === "create") {
      const v = {
        nombre: limpiarNombre(b.nombre), email: limpiarEmail(b.email), rol: limpiarRol(b.rol, ROLES_EMPRESA),
        pass_hash: await hashPassword(limpiarPassword(b.password)),
      };
      const existe = await k.selectFrom("usuarios").select("id").where("email", "=", v.email).executeTakeFirst();
      if (existe) throw new HttpError(409, "Ya existe una cuenta con ese correo.");
      await insertar(k, "usuarios", { ...v, empresa_id: E, activo: 1, creado_el: ahora() });
      return res.status(200).json({ usuarios: await lista() });
    }

    // Las demás operaciones solo sobre usuarios de la misma empresa
    const id = Number(b.id);
    const actual = Number.isInteger(id) && id > 0
      ? await k.selectFrom("usuarios").selectAll().where("id", "=", id).where("empresa_id", "=", E).executeTakeFirst() : null;
    if (!actual) throw new HttpError(404, "El usuario no existe en tu empresa.");
    const propio = Number(actual.id) === Number(u.id);

    if (b.op === "update") {
      const cambios = { nombre: limpiarNombre(b.nombre), rol: limpiarRol(b.rol, ROLES_EMPRESA), activo: b.activo === false ? 0 : 1 };
      // Evita que la empresa se quede sin administrador por accidente.
      if (propio && (cambios.rol !== "Administrador" || !cambios.activo)) throw new HttpError(400, "No puedes quitarte el rol de Administrador ni desactivar tu propia cuenta.");
      await k.updateTable("usuarios").set(cambios).where("id", "=", id).where("empresa_id", "=", E).execute();
      return res.status(200).json({ usuarios: await lista() });
    }
    if (b.op === "password") {
      const pass_hash = await hashPassword(limpiarPassword(b.password));
      await k.updateTable("usuarios").set({ pass_hash }).where("id", "=", id).where("empresa_id", "=", E).execute();
      return res.status(200).json({ ok: true });
    }
    throw new HttpError(400, "Operación no válida.");
  } catch (err) {
    fail(res, err);
  }
}
