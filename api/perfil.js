// Perfil del usuario que inició sesión.
//   POST {op:"foto", foto}  (data URL PNG/JPG/WebP; "" la quita)
//   POST {op:"password", actual, nueva}
import { db } from "../lib/db.js";
import { readBody, fail, HttpError, requireSameOrigin } from "../lib/http.js";
import { requireUser, perfilPublico } from "../lib/auth.js";
import { hashPassword, verifyPassword } from "../lib/password.js";
import { limpiarImagen, limpiarPassword } from "../lib/validar.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Método no permitido." });
  try {
    requireSameOrigin(req);
    const u = await requireUser(req);
    const k = await db();
    const b = readBody(req, 300000);

    if (b.op === "foto") {
      const foto = limpiarImagen(b.foto ?? "", "Foto de perfil", 200);
      await k.updateTable("usuarios").set({ foto }).where("id", "=", u.id).execute();
      return res.status(200).json({ user: await perfilPublico(u.id) });
    }
    if (b.op === "password") {
      const r = await k.selectFrom("usuarios").select("pass_hash").where("id", "=", u.id).executeTakeFirstOrThrow();
      if (!(await verifyPassword(String(b.actual ?? "").slice(0, 200), r.pass_hash))) throw new HttpError(400, "La contraseña actual no es correcta.");
      const pass_hash = await hashPassword(limpiarPassword(b.nueva));
      await k.updateTable("usuarios").set({ pass_hash }).where("id", "=", u.id).execute();
      return res.status(200).json({ ok: true });
    }
    throw new HttpError(400, "Operación no válida.");
  } catch (err) {
    fail(res, err);
  }
}
