// Prueba gratis y suscripción con Stripe.
//   GET: precio, días de prueba y si los pagos están configurados (público, para la página de inicio).
//   POST {accion:"registro", empresa, nombre, email, password, ejemplo}: crea la empresa (pendiente) y su Administrador
//        y devuelve la URL de Stripe Checkout para registrar la tarjeta. Hoy no se cobra nada.
//   POST {accion:"confirmar", session_id}: al volver de Stripe, verifica el registro de la tarjeta y activa la cuenta.
//   POST {accion:"portal"}: (Administrador) URL del portal de Stripe para cambiar la tarjeta, ver facturas o cancelar.
// Stripe hace el cargo del primer mes al terminar la prueba; la plataforma lee el estado al iniciar sesión.
import { db, insertar, ahora, sembrarDatos } from "../lib/db.js";
import { readBody, fail, HttpError, requireSameOrigin } from "../lib/http.js";
import { requireEmpresa, esAdmin, perfilPublico } from "../lib/auth.js";
import { hashPassword } from "../lib/password.js";
import { limpiarEmail, limpiarNombre, limpiarPassword } from "../lib/validar.js";
import { stripe, camposDeSuscripcion, PRECIO_USD, DIAS_PRUEBA, PAQUETE } from "../lib/suscripcion.js";

// Dirección de la página para volver de Stripe: APP_URL si está definida; si no, la del propio sitio.
const origen = req => process.env.APP_URL?.replace(/\/$/, "") || `${req.headers["x-forwarded-proto"] || "http"}://${req.headers["x-forwarded-host"] || req.headers.host}`;

export default async function handler(req, res) {
  try {
    if (req.method === "GET") {
      return res.status(200).json({ precio: PRECIO_USD, diasPrueba: DIAS_PRUEBA, habilitado: !!(process.env.STRIPE_SECRET_KEY || globalThis.__stripe) });
    }
    if (req.method !== "POST") return res.status(405).json({ error: "Método no permitido." });
    requireSameOrigin(req);
    const b = readBody(req);
    const k = await db();
    if (b.accion === "registro") return res.status(200).json(await registro(k, b, origen(req)));
    if (b.accion === "confirmar") return res.status(200).json(await confirmar(k, b.session_id));
    if (b.accion === "portal") return res.status(200).json(await portal(k, req));
    if (b.accion === "revisar") {
      // Al volver del portal de Stripe: leer el estado ya, sin esperar la revisión periódica.
      const u = await requireEmpresa(req);
      await k.updateTable("empresas").set({ suscripcion_revisada: null }).where("id", "=", u.empresa_id).execute();
      return res.status(200).json({ user: await perfilPublico(u.id) });
    }
    throw new HttpError(400, "Acción no válida.");
  } catch (err) {
    fail(res, err);
  }
}

async function registro(k, b, base) {
  const s = await stripe(); // si los pagos no están configurados, avisa antes de crear nada
  const empresa = limpiarNombre(b.empresa, "Nombre de la empresa", 150);
  const admin = { nombre: limpiarNombre(b.nombre, "Tu nombre"), email: limpiarEmail(b.email), pass_hash: await hashPassword(limpiarPassword(b.password)) };

  // Un registro anterior con el mismo correo que nunca terminó de dar de alta la tarjeta se reemplaza.
  const previo = await k.selectFrom("usuarios").select(["id", "empresa_id"]).where("email", "=", admin.email).executeTakeFirst();
  if (previo) {
    const e = previo.empresa_id == null ? null : await k.selectFrom("empresas").select(["id", "suscripcion"]).where("id", "=", previo.empresa_id).executeTakeFirst();
    if (e?.suscripcion !== "pendiente") throw new HttpError(409, "Ya existe una cuenta con ese correo. Inicia sesión o usa otro correo.");
    await k.transaction().execute(async tx => {
      await tx.deleteFrom("usuarios").where("empresa_id", "=", e.id).execute();
      await tx.deleteFrom("empresas").where("id", "=", e.id).execute();
    });
  }
  const mismoNombre = await k.selectFrom("empresas").select(["id", "suscripcion"]).where("nombre", "=", empresa).executeTakeFirst();
  if (mismoNombre) throw new HttpError(409, "Ya existe una empresa con ese nombre en la plataforma.");

  // La empresa queda desactivada y "pendiente" hasta que Stripe confirme el registro de la tarjeta.
  const eid = await k.transaction().execute(async tx => {
    const id = await insertar(tx, "empresas", { nombre: empresa, logo: null, plantilla: b.ejemplo ? "demo" : "vacia", activa: 0, suscripcion: "pendiente", registro_email: admin.email, creado_el: ahora() });
    await insertar(tx, "usuarios", { ...admin, rol: "Administrador", empresa_id: id, activo: 1, creado_el: ahora() });
    return id;
  });

  try {
    const sesion = await s.checkout.sessions.create({
      mode: "subscription",
      customer_email: admin.email,
      client_reference_id: String(eid),
      metadata: { empresa_id: String(eid) },
      line_items: [{ quantity: 1, price_data: { currency: "usd", unit_amount: Math.round(PRECIO_USD * 100), recurring: { interval: "month" }, product_data: { name: PAQUETE } } }],
      subscription_data: { trial_period_days: DIAS_PRUEBA, metadata: { empresa_id: String(eid), empresa } },
      payment_method_collection: "always",
      success_url: `${base}/?pago=ok&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${base}/?pago=cancelado`,
      locale: "es",
    });
    return { url: sesion.url };
  } catch (e) {
    console.error("Stripe Checkout:", e.message);
    await k.deleteFrom("usuarios").where("empresa_id", "=", eid).execute();
    await k.deleteFrom("empresas").where("id", "=", eid).execute();
    throw new HttpError(502, "No se pudo abrir el registro de pago. Intenta de nuevo en unos minutos.");
  }
}

async function confirmar(k, sessionId) {
  if (!/^cs_[A-Za-z0-9_]+$/.test(String(sessionId || ""))) throw new HttpError(400, "Registro de pago no válido.");
  let sesion;
  try { sesion = await (await stripe()).checkout.sessions.retrieve(sessionId, { expand: ["subscription"] }); }
  catch { throw new HttpError(404, "No se encontró el registro de pago."); }
  if (sesion.status !== "complete" || !sesion.subscription) throw new HttpError(409, "El registro de la tarjeta no se completó.");
  const eid = Number(sesion.metadata?.empresa_id);
  const e = await k.selectFrom("empresas").selectAll().where("id", "=", eid).executeTakeFirst();
  if (!e) throw new HttpError(404, "La empresa de este registro ya no existe.");
  // Idempotente: si ya se activó (por ejemplo, al recargar la página), solo se informa.
  if (e.suscripcion === "pendiente") {
    await k.transaction().execute(async tx => {
      await tx.updateTable("empresas").set({ activa: 1, ...camposDeSuscripcion(sesion.subscription) }).where("id", "=", eid).execute();
      await sembrarDatos(tx, eid, e.plantilla);
    });
  }
  const pruebaFin = sesion.subscription.trial_end ? new Date(sesion.subscription.trial_end * 1000).toISOString() : "";
  return { empresa: e.nombre, email: e.registro_email, pruebaFin, precio: PRECIO_USD };
}

async function portal(k, req) {
  const u = await requireEmpresa(req);
  if (!esAdmin(u)) throw new HttpError(403, "Solo el Administrador puede administrar el pago de la empresa.");
  const e = await k.selectFrom("empresas").select(["stripe_cliente"]).where("id", "=", u.empresa_id).executeTakeFirst();
  if (!e?.stripe_cliente) throw new HttpError(400, "Esta empresa no tiene una suscripción con pago (es una cuenta de demostración).");
  try {
    const s = await (await stripe()).billingPortal.sessions.create({ customer: e.stripe_cliente, return_url: `${origen(req)}/?pago=portal` });
    return { url: s.url };
  } catch (err) {
    console.error("Stripe portal:", err.message);
    throw new HttpError(502, "No se pudo abrir el portal de pagos. Revisa que el portal de clientes esté activado en Stripe.");
  }
}
