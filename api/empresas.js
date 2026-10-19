// Empresas de la plataforma.
//   Súper administrador:
//     GET: todas las empresas con sus conteos.
//     POST {op:"create", nombre, logo, ejemplo, admin:{nombre, email, password}} | {op:"update", id, nombre, logo?, activa}
//   Administrador de una empresa:
//     POST {op:"mi-empresa", nombre, logo?}  (solo su propia empresa)
// logo: data URL PNG/JPG/WebP; "" lo quita; si no se envía, se conserva.
import { db, insertar, ahora, sembrarDatos } from "../lib/db.js";
import { readBody, fail, HttpError, requireSameOrigin } from "../lib/http.js";
import { requireUser, esSuper, esAdmin } from "../lib/auth.js";
import { hashPassword } from "../lib/password.js";
import { limpiarEmail, limpiarNombre, limpiarPassword, limpiarImagen } from "../lib/validar.js";

const LOGO_KB = 400;

async function listar(k) {
  const [es, us, ps] = await Promise.all([
    k.selectFrom("empresas").selectAll().orderBy("id").execute(),
    k.selectFrom("usuarios").select(["empresa_id", "activo"]).execute(),
    k.selectFrom("puestos").select("empresa_id").execute(),
  ]);
  return es.map(e => ({
    id: Number(e.id), nombre: e.nombre, logo: e.logo || "", activa: Number(e.activa) === 1, creado: e.creado_el || "",
    usuarios: us.filter(x => Number(x.empresa_id) === Number(e.id) && Number(x.activo) === 1).length,
    puestos: ps.filter(x => Number(x.empresa_id) === Number(e.id)).length,
  }));
}

export default async function handler(req, res) {
  try {
    const u = await requireUser(req);
    const k = await db();

    if (req.method === "GET") {
      if (!esSuper(u)) throw new HttpError(403, "Solo el súper administrador puede ver todas las empresas.");
      return res.status(200).json({ empresas: await listar(k) });
    }
    if (req.method !== "POST") return res.status(405).json({ error: "Método no permitido." });
    requireSameOrigin(req);
    const b = readBody(req, 700000);

    if (b.op === "mi-empresa") {
      if (!esAdmin(u) || u.empresa_id == null) throw new HttpError(403, "Solo el Administrador puede cambiar los datos de su empresa.");
      const cambios = { nombre: limpiarNombre(b.nombre, "Nombre de la empresa", 150) };
      const logo = limpiarImagen(b.logo, "Logo", LOGO_KB);
      if (logo !== undefined) cambios.logo = logo;
      await k.updateTable("empresas").set(cambios).where("id", "=", u.empresa_id).execute();
      const e = await k.selectFrom("empresas").select(["id", "nombre", "logo"]).where("id", "=", u.empresa_id).executeTakeFirst();
      return res.status(200).json({ empresa: { id: Number(e.id), nombre: e.nombre, logo: e.logo || "" } });
    }

    if (!esSuper(u)) throw new HttpError(403, "Solo el súper administrador puede administrar empresas.");

    if (b.op === "create") {
      const nombre = limpiarNombre(b.nombre, "Nombre de la empresa", 150);
      const logo = limpiarImagen(b.logo, "Logo", LOGO_KB) ?? null;
      const admin = {
        nombre: limpiarNombre(b.admin?.nombre, "Nombre del administrador"), email: limpiarEmail(b.admin?.email),
        pass_hash: await hashPassword(limpiarPassword(b.admin?.password)),
      };
      if (await k.selectFrom("usuarios").select("id").where("email", "=", admin.email).executeTakeFirst()) throw new HttpError(409, "Ya existe una cuenta con el correo del administrador.");
      if (await k.selectFrom("empresas").select("id").where("nombre", "=", nombre).executeTakeFirst()) throw new HttpError(409, "Ya existe una empresa con ese nombre.");
      const plantilla = b.ejemplo ? "demo" : "vacia";
      await k.transaction().execute(async tx => {
        const eid = await insertar(tx, "empresas", { nombre, logo, plantilla, activa: 1, creado_el: ahora() });
        await insertar(tx, "usuarios", { ...admin, rol: "Administrador", empresa_id: eid, activo: 1, creado_el: ahora() });
        await sembrarDatos(tx, eid, plantilla);
      });
      return res.status(200).json({ empresas: await listar(k) });
    }

    if (b.op === "update") {
      const id = Number(b.id);
      const actual = Number.isInteger(id) && id > 0 ? await k.selectFrom("empresas").select("id").where("id", "=", id).executeTakeFirst() : null;
      if (!actual) throw new HttpError(404, "La empresa no existe.");
      const cambios = { nombre: limpiarNombre(b.nombre, "Nombre de la empresa", 150), activa: b.activa === false ? 0 : 1 };
      const logo = limpiarImagen(b.logo, "Logo", LOGO_KB);
      if (logo !== undefined) cambios.logo = logo;
      await k.updateTable("empresas").set(cambios).where("id", "=", id).execute();
      return res.status(200).json({ empresas: await listar(k) });
    }
    throw new HttpError(400, "Operación no válida.");
  } catch (err) {
    fail(res, err);
  }
}
