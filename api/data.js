// GET: todos los datos de la empresa (puestos, procesos, competencias, políticas y KPIs).
import { db, cargarTodo } from "../lib/db.js";
import { fail } from "../lib/http.js";
import { requireUser } from "../lib/auth.js";

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Método no permitido." });
  try {
    await requireUser(req);
    res.setHeader("Cache-Control", "no-store");
    res.status(200).json(await cargarTodo(await db()));
  } catch (err) {
    fail(res, err);
  }
}
