// GET: usuario de la sesión actual. POST {action:"login", email, password} | {action:"logout"}.
import { db } from "../lib/db.js";
import { clip, readBody, fail, HttpError, requireSameOrigin } from "../lib/http.js";
import { verifyPassword } from "../lib/password.js";
import { crearToken, ponerCookie, usuarioActual, perfilPublico, esSuper } from "../lib/auth.js";

export default async function handler(req, res) {
  try {
    if (req.method === "GET") {
      const u = await usuarioActual(req);
      if (!u) return res.status(401).json({ error: "Sin sesión." });
      return res.status(200).json({ user: await perfilPublico(u.id) });
    }
    if (req.method !== "POST") return res.status(405).json({ error: "Método no permitido." });
    requireSameOrigin(req);
    const { action, email, password } = readBody(req);

    if (action === "logout") {
      ponerCookie(res, "");
      return res.status(200).json({ ok: true });
    }
    if (action !== "login") throw new HttpError(400, "Acción no válida.");

    const k = await db();
    const u = await k.selectFrom("usuarios").selectAll().where("email", "=", clip(email, 190).trim().toLowerCase()).executeTakeFirst();
    const ok = u && Number(u.activo) === 1 && (await verifyPassword(clip(password, 200), u.pass_hash));
    if (!ok) throw new HttpError(401, "Correo o contraseña incorrectos.");
    if (!esSuper(u)) {
      const e = u.empresa_id == null ? null : await k.selectFrom("empresas").select("activa").where("id", "=", u.empresa_id).executeTakeFirst();
      if (!e || Number(e.activa) !== 1) throw new HttpError(403, "Tu empresa está desactivada. Contacta al administrador de la plataforma.");
    }

    ponerCookie(res, await crearToken(u));
    res.status(200).json({ user: await perfilPublico(u.id) });
  } catch (err) {
    fail(res, err);
  }
}
