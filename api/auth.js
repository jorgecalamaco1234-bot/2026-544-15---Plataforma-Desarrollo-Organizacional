// GET: usuario de la sesión actual. POST {action:"login", email, password} | {action:"logout"}.
import { db } from "../lib/db.js";
import { clip, readBody, fail, HttpError, requireSameOrigin } from "../lib/http.js";
import { verifyPassword } from "../lib/password.js";
import { crearToken, ponerCookie, usuarioActual, usuarioPublico } from "../lib/auth.js";

export default async function handler(req, res) {
  try {
    if (req.method === "GET") {
      const u = await usuarioActual(req);
      if (!u) return res.status(401).json({ error: "Sin sesión." });
      return res.status(200).json({ user: usuarioPublico(u) });
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

    ponerCookie(res, await crearToken(u));
    res.status(200).json({ user: usuarioPublico(u) });
  } catch (err) {
    fail(res, err);
  }
}
