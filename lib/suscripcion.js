// Suscripciones con Stripe: prueba gratis de 7 días con tarjeta registrada y cargo automático del primer mes al terminar.
// Los datos de la tarjeta nunca pasan por este servidor: los captura Stripe Checkout y Stripe hace los cargos.
// Variables de entorno: STRIPE_SECRET_KEY (sk_test_... en pruebas). Opcionales: PRECIO_MENSUAL_USD (por defecto 1), DIAS_PRUEBA (por defecto 7).
import { HttpError } from "./http.js";

export const PRECIO_USD = Number(process.env.PRECIO_MENSUAL_USD) || 1;
export const DIAS_PRUEBA = Number(process.env.DIAS_PRUEBA) || 7;
export const PAQUETE = "Plataforma de Desarrollo Organizacional IA · Paquete mensual";

// Estado guardado en empresas.suscripcion:
//   null        → empresa de demostración o creada por IOT, sin cobro
//   "pendiente" → se registró pero no terminó de dar de alta su tarjeta
//   "prueba"    → prueba gratis en curso (tarjeta registrada)
//   "activa"    → pagó el periodo actual
//   "solo_lectura" → el cargo falló, se canceló o terminó: puede consultar pero no modificar
export function estadoDeStripe(status) {
  if (status === "trialing") return "prueba";
  if (status === "active") return "activa";
  return "solo_lectura"; // past_due, unpaid, canceled, incomplete, incomplete_expired, paused
}

let cliente = null;
export async function stripe() {
  if (globalThis.__stripe) return globalThis.__stripe; // pruebas locales
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new HttpError(503, "Los pagos todavía no están configurados: falta STRIPE_SECRET_KEY en Vercel.");
  if (!cliente) {
    const { default: Stripe } = await import("stripe");
    cliente = new Stripe(key);
  }
  return cliente;
}

const fecha = unix => (unix ? new Date(unix * 1000).toISOString() : null);

// Campos de la empresa a partir de una suscripción de Stripe.
export function camposDeSuscripcion(sub) {
  return {
    suscripcion: estadoDeStripe(sub.status),
    stripe_suscripcion: sub.id,
    stripe_cliente: typeof sub.customer === "string" ? sub.customer : sub.customer?.id,
    prueba_fin: fecha(sub.trial_end),
    periodo_fin: fecha(sub.items?.data?.[0]?.current_period_end ?? sub.current_period_end),
    cancela_al_final: sub.cancel_at_period_end ? 1 : 0,
    suscripcion_revisada: new Date().toISOString(),
  };
}

// Vuelve a leer el estado en Stripe si la última revisión tiene más de 30 minutos (al iniciar sesión o recargar la página).
// Si Stripe no responde, se conserva el último estado conocido.
const MINUTOS = 30;
export async function sincronizar(k, empresa) {
  if (!empresa?.stripe_suscripcion) return empresa;
  const revisada = empresa.suscripcion_revisada ? Date.parse(empresa.suscripcion_revisada) : 0;
  if (Date.now() - revisada < MINUTOS * 60e3) return empresa;
  try {
    const sub = await (await stripe()).subscriptions.retrieve(empresa.stripe_suscripcion);
    const campos = camposDeSuscripcion(sub);
    await k.updateTable("empresas").set(campos).where("id", "=", empresa.id).execute();
    return { ...empresa, ...campos };
  } catch (e) {
    console.error("No se pudo revisar la suscripción en Stripe:", e.message);
    return empresa;
  }
}

export const soloLectura = estado => estado === "solo_lectura";

// Para la página: estado legible de la suscripción de la empresa.
export function resumen(e) {
  if (!e?.suscripcion || e.suscripcion === "pendiente") return null;
  return {
    estado: e.suscripcion, pruebaFin: e.prueba_fin || "", periodoFin: e.periodo_fin || "", cancelaAlFinal: Number(e.cancela_al_final) === 1,
    precio: PRECIO_USD, diasPrueba: DIAS_PRUEBA,
  };
}

// Bloquea cualquier cambio (y la IA, que tiene costo) cuando la cuenta está en solo lectura.
export function exigirEscritura(u) {
  if (u?.soloLectura) throw new HttpError(402, "Tu cuenta está en modo solo lectura porque la suscripción no está al día. El Administrador puede actualizar el método de pago en «Usuarios y empresa».");
}
