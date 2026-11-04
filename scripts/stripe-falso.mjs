// Stripe simulado SOLO para el servidor de desarrollo (STRIPE_FALSO=1 npm run dev): permite probar la prueba gratis
// sin cuenta de Stripe. "Checkout" regresa de inmediato como si la tarjeta se hubiera registrado.
// Para simular el fin de la prueba o un cargo fallido, el servidor de desarrollo acepta GET /__stripe?sub=sub_falso_1&status=past_due.
let n = 0;
const sesiones = new Map(), subs = new Map();
const ahora = () => Math.floor(Date.now() / 1000);

export const stripeFalso = {
  checkout: {
    sessions: {
      async create(p) {
        n++;
        const dias = p.subscription_data?.trial_period_days || 7;
        const sub = { id: `sub_falso_${n}`, status: "trialing", customer: `cus_falso_${n}`, trial_end: ahora() + dias * 86400,
          cancel_at_period_end: false, items: { data: [{ current_period_end: ahora() + dias * 86400 }] } };
        subs.set(sub.id, sub);
        const id = `cs_falso_${n}`;
        sesiones.set(id, { id, status: "complete", metadata: p.metadata, subscription: sub });
        return { id, url: p.success_url.replace("{CHECKOUT_SESSION_ID}", id) };
      },
      async retrieve(id) {
        const s = sesiones.get(id);
        if (!s) throw new Error("No existe la sesión.");
        return { ...s, subscription: subs.get(s.subscription.id) };
      },
    },
  },
  subscriptions: { async retrieve(id) { const s = subs.get(id); if (!s) throw new Error("No existe la suscripción."); return { ...s }; } },
  billingPortal: { sessions: { async create(p) { return { url: p.return_url }; } } },
  // Cambia el estado de una suscripción simulada: "trialing", "active", "past_due", "canceled"...
  _estado(id, status) { const s = subs.get(id); if (s) s.status = status; return s; },
};
