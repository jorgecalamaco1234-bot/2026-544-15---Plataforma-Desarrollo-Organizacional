/* Prueba gratis de 7 días y suscripción (Stripe).
   - Inicio de sesión: botón "Prueba gratis" con el formulario de registro de la empresa; la tarjeta se registra en Stripe Checkout.
   - Regreso de Stripe (?pago=ok | cancelado | portal): activa la cuenta o informa.
   - Aviso en la parte superior con los días de prueba que quedan o el modo solo lectura.
   - "Usuarios y empresa": tarjeta de suscripción con el botón para administrar el pago (portal de Stripe).
   La tarjeta nunca pasa por esta página ni por nuestro servidor. */

let planInfo = { precio: 1, diasPrueba: 7, habilitado: false };
api("/api/suscripcion", null, "GET").then(d => { planInfo = d; pintarBotonPrueba(); }).catch(() => {});

const fechaLarga = f => (f ? new Date(f).toLocaleDateString("es-MX", { day: "numeric", month: "long", year: "numeric" }) : "");
const usd = n => `${n} USD`;
const diasRestantes = f => Math.max(0, Math.ceil((Date.parse(f) - Date.now()) / 864e5));

/* ---------- inicio de sesión: prueba gratis ---------- */
document.querySelector(".l-box .demo").insertAdjacentHTML("beforebegin", `<div class="trial-box" id="trialBox">
  <div><b>¿Tu empresa quiere probarla?</b><span id="trialTxt">Prueba gratis por 7 días.</span></div>
  <button type="button" class="btn primary" onclick="abrirRegistro()">Prueba gratis</button></div>`);
function pintarBotonPrueba() {
  $("trialTxt").textContent = `${planInfo.diasPrueba} días gratis; después ${usd(planInfo.precio)} al mes. Cancela cuando quieras.`;
}

document.body.insertAdjacentHTML("beforeend", `
<div class="modal" id="regModal"><div class="mc" style="width:min(560px,100%)">
  <div class="mh"><h3>Prueba gratis</h3><button class="close" onclick="closeModal('regModal')" aria-label="Cerrar">×</button></div>
  <div class="trial-steps"><span><b>1</b>Datos de tu empresa</span><span><b>2</b>Registra tu tarjeta en Stripe</span><span><b>3</b>Configura tu empresa</span></div>
  <div class="fg">
    <div class="field s2"><label for="rgEmpresa">Nombre de la empresa *</label><input class="input" id="rgEmpresa" maxlength="150" autocomplete="organization"></div>
    <div class="field s2"><label for="rgNombre">Tu nombre *</label><input class="input" id="rgNombre" maxlength="120" autocomplete="name"></div>
    <div class="field"><label for="rgEmail">Correo *</label><input class="input" id="rgEmail" type="email" maxlength="190" autocomplete="email"></div>
    <div class="field"><label for="rgPass">Contraseña * (mínimo 8)</label><input class="input" id="rgPass" type="password" autocomplete="new-password"></div>
    <div class="field s2"><label class="chk"><input type="checkbox" id="rgEjemplo"> Empezar con datos de ejemplo para explorar (puedes borrarlos después)</label></div>
  </div>
  <div class="trial-note" id="rgNota"></div>
  <p class="err" id="rgErr" role="alert"></p>
  <div class="toolbar" style="justify-content:flex-end"><button class="btn" onclick="closeModal('regModal')">Cancelar</button><button class="btn primary" id="rgBtn" onclick="registrarPrueba()">Continuar al registro de tarjeta</button></div>
</div></div>`);

function abrirRegistro() {
  const fin = new Date(Date.now() + planInfo.diasPrueba * 864e5);
  $("rgNota").innerHTML = `🔒 <b>Hoy no se cobra nada.</b> Registrarás tu tarjeta en la página segura de Stripe; nosotros nunca vemos sus datos.
    Al terminar la prueba, el <b>${fechaLarga(fin)}</b>, se cobrará <b>${usd(planInfo.precio)}</b> por el primer mes del paquete, salvo que canceles antes desde «Usuarios y empresa».`;
  $("rgErr").textContent = planInfo.habilitado ? "" : "Los pagos todavía no están configurados en este sitio.";
  openModal("regModal"); $("rgEmpresa").focus();
}
async function registrarPrueba() {
  const btn = $("rgBtn");
  btn.disabled = true; btn.textContent = "Abriendo Stripe...";
  try {
    const d = await api("/api/suscripcion", { accion: "registro", empresa: $("rgEmpresa").value.trim(), nombre: $("rgNombre").value.trim(), email: $("rgEmail").value.trim(), password: $("rgPass").value, ejemplo: $("rgEjemplo").checked });
    location.href = d.url; // página de pago de Stripe
  } catch (e) {
    $("rgErr").textContent = e.message;
    btn.disabled = false; btn.textContent = "Continuar al registro de tarjeta";
  }
}

/* ---------- regreso de Stripe ---------- */
$("lErr").insertAdjacentHTML("beforebegin", '<div class="login-ok" id="loginOk" hidden></div>');
(async () => {
  const q = new URLSearchParams(location.search), pago = q.get("pago");
  if (!pago) return;
  history.replaceState(null, "", location.pathname); // quitar los parámetros de la dirección
  if (pago === "cancelado") { $("lErr").textContent = "No se completó el registro de la tarjeta. Puedes intentarlo de nuevo con «Prueba gratis»."; return; }
  if (pago === "portal") { setTimeout(revisarSuscripcion, 800); return; }
  if (pago !== "ok") return;
  try {
    const d = await api("/api/suscripcion", { accion: "confirmar", session_id: q.get("session_id") });
    $("lEmail").value = d.email; $("lPass").value = ""; $("lPass").focus();
    $("loginOk").hidden = false;
    $("loginOk").innerHTML = `<b>¡Listo! Tu prueba gratis de ${esc(d.empresa)} empezó.</b> Inicia sesión con la contraseña que elegiste.
      ${d.pruebaFin ? `El ${fechaLarga(d.pruebaFin)} se cobrará ${usd(d.precio)} por el primer mes.` : ""}`;
  } catch (e) { $("lErr").textContent = e.message; }
})();

async function revisarSuscripcion() {
  if (!usuario || !usuario.empresa) return;
  try { const d = await api("/api/suscripcion", { accion: "revisar" }); usuario = d.user; applyPerms(); pintarSuscripcion(); toast("Estado de la suscripción actualizado."); } catch {}
}

/* ---------- aviso superior y tarjeta de suscripción ---------- */
document.querySelector(".topbar").insertAdjacentHTML("afterend", '<div class="sub-banner" id="subBanner" hidden></div>');
$("usuarios").insertAdjacentHTML("afterbegin", '<div class="card" id="subCard" style="margin-bottom:18px" hidden></div>');

function textoSuscripcion(s) {
  if (s.estado === "prueba") { const n = diasRestantes(s.pruebaFin); return { cls: "info", txt: `Prueba gratis: ${n === 1 ? "queda 1 día" : `quedan ${n} días`}. El ${fechaLarga(s.pruebaFin)} se cobrará ${usd(s.precio)} por el primer mes${s.cancelaAlFinal ? " (cancelada: no se cobrará y la cuenta pasará a solo lectura)" : ""}.` }; }
  if (s.estado === "activa") return { cls: s.cancelaAlFinal ? "warn" : "ok", txt: s.cancelaAlFinal ? `Suscripción cancelada: tienes acceso completo hasta el ${fechaLarga(s.periodoFin)}.` : `Suscripción activa: ${usd(s.precio)} al mes. Próximo cargo: ${fechaLarga(s.periodoFin)}.` };
  return { cls: "warn", txt: "Modo solo lectura: el pago de la suscripción no está al día. Puedes consultar tu información, pero no modificarla hasta actualizar el método de pago." };
}

function pintarSuscripcion() {
  const s = usuario?.empresa?.suscripcion, admin = can("admin");
  const ban = $("subBanner"), card = $("subCard");
  if (!s) { ban.hidden = true; card.hidden = !admin; card.innerHTML = '<div class="sh"><h3>Suscripción</h3></div><p class="note" style="margin:0">Cuenta de demostración de IOT Technologies: sin cobro.</p>'; return; }
  const t = textoSuscripcion(s);
  // El aviso superior se muestra durante la prueba, en solo lectura o si se canceló; con la suscripción al corriente basta la tarjeta.
  ban.hidden = s.estado === "activa" && !s.cancelaAlFinal;
  ban.className = "sub-banner " + t.cls;
  ban.innerHTML = `<span>${esc(t.txt)}</span>${admin ? '<button class="btn small" onclick="abrirPortal()">Administrar pago</button>' : s.estado === "solo_lectura" ? '<span class="note">Pide al Administrador que actualice el pago.</span>' : ""}`;
  card.hidden = !admin;
  card.innerHTML = `<div class="sh"><h3>Suscripción</h3>${admin ? '<button class="btn primary" onclick="abrirPortal()">Administrar pago</button>' : ""}</div>
    <div class="sub-grid"><div><span class="note">Estado</span><b>${{ prueba: "Prueba gratis", activa: "Activa", solo_lectura: "Solo lectura" }[s.estado] || esc(s.estado)}</b></div>
      <div><span class="note">Paquete</span><b>${usd(s.precio)} / mes</b></div>
      <div><span class="note">${s.estado === "prueba" ? "Fin de la prueba" : "Fin del periodo"}</span><b>${fechaLarga(s.estado === "prueba" ? s.pruebaFin : s.periodoFin) || "—"}</b></div></div>
    <p class="note" style="margin:10px 0 0">${esc(t.txt)} En «Administrar pago» (Stripe) puedes cambiar la tarjeta, ver tus facturas o cancelar.</p>`;
}

async function abrirPortal() {
  try { const d = await api("/api/suscripcion", { accion: "portal" }); location.href = d.url; }
  catch (e) { toast(e.message); }
}

startSession = (orig => async u => {
  await orig(u);
  pintarSuscripcion();
  if (usuario?.permisos?.soloLectura) toast("Cuenta en modo solo lectura: el pago de la suscripción no está al día.");
})(startSession);
endSession = (orig => msg => { orig(msg); $("subBanner").hidden = true; })(endSession);
if (usuario) pintarSuscripcion();
