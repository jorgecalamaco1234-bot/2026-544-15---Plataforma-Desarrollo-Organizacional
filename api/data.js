// GET: todos los datos de la empresa del usuario (puestos, procesos, competencias, políticas y KPIs).
import { db, cargarTodo, VACIO } from "../lib/db.js";
import { fail } from "../lib/http.js";
import { requireUser, esSuper } from "../lib/auth.js";

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Método no permitido." });
  try {
    const u = await requireUser(req);
    res.setHeader("Cache-Control", "no-store");
    // El súper administrador no pertenece a ninguna empresa: administra empresas, no sus datos.
    if (esSuper(u)) return res.status(200).json(VACIO());
    res.status(200).json(await cargarTodo(await db(), u.empresa_id));
  } catch (err) {
    fail(res, err);
  }
}
