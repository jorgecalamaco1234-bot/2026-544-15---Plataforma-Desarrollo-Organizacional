// Utilidades HTTP comunes para las funciones de /api.

export const clip = (s, n = 2000) => String(s ?? "").slice(0, n);

export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

// max: tamaño máximo en caracteres (más grande en las rutas que reciben imágenes).
export function readBody(req, max = 100000) {
  let b;
  try { b = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {}; }
  catch { throw new HttpError(400, "El cuerpo de la solicitud no es JSON válido."); }
  if (JSON.stringify(b).length > max) throw new HttpError(413, "Solicitud demasiado grande.");
  return b;
}

export function fail(res, err) {
  if (!(err instanceof HttpError)) console.error(err);
  res.status(err.status || 500).json({ error: err instanceof HttpError ? err.message : "Error interno del servidor." });
}

// Las peticiones que modifican datos deben venir de la propia página (fetch con este encabezado).
// Un formulario de otro sitio no puede agregarlo, lo que protege contra CSRF junto con la cookie SameSite.
export function requireSameOrigin(req) {
  if (req.method !== "GET" && req.headers["x-requested-with"] !== "fetch") throw new HttpError(403, "Solicitud no permitida.");
}
