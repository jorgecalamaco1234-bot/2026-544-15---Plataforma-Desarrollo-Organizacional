/* Multiempresa y multiusuario:
   - Marca de la empresa del usuario (logo y nombre) y foto de perfil.
   - "Mi perfil": foto y cambio de contraseña.
   - "Usuarios y empresa" (Administrador): logo y nombre de la empresa, alta y gestión de usuarios.
   - "Empresas" (Súper administrador de IOT): alta de empresas con su primer administrador, logo y activación.
   Toda la seguridad la valida el servidor; aquí solo se muestra lo que corresponde a cada usuario. */

const ROLES = ["Administrador", "Recursos Humanos", "Calidad", "Dirección"];
titles.usuarios = "Usuarios y empresa";
titles.empresas = "Empresas";
const esSuperUsr = () => !!usuario?.permisos?.super;

/* ---------- imágenes: se reducen en el navegador antes de subirlas ---------- */
// logo: cabe en 480×160 y conserva transparencia (PNG); foto: cuadrada de 256×256 (JPG)
function leerImagen(file, tipo) {
  return new Promise((ok, mal) => {
    if (!file) return mal(new Error("Selecciona una imagen."));
    if (!/^image\/(png|jpeg|webp|gif)$/.test(file.type)) return mal(new Error("El archivo debe ser una imagen PNG, JPG o WebP."));
    if (file.size > 8e6) return mal(new Error("La imagen pesa más de 8 MB."));
    const url = URL.createObjectURL(file), img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const c = document.createElement("canvas"), g = c.getContext("2d");
      if (tipo === "foto") {
        const lado = Math.min(img.naturalWidth, img.naturalHeight), t = Math.min(256, lado);
        c.width = c.height = t;
        g.fillStyle = "#fff"; g.fillRect(0, 0, t, t);
        g.drawImage(img, (img.naturalWidth - lado) / 2, (img.naturalHeight - lado) / 2, lado, lado, 0, 0, t, t);
        return ok(c.toDataURL("image/jpeg", 0.86));
      }
      const r = Math.min(1, 480 / img.naturalWidth, 160 / img.naturalHeight);
      c.width = Math.max(1, Math.round(img.naturalWidth * r)); c.height = Math.max(1, Math.round(img.naturalHeight * r));
      g.drawImage(img, 0, 0, c.width, c.height);
      let d = c.toDataURL("image/png");
      if (d.length > 380 * 1365) d = c.toDataURL("image/webp", 0.9);
      ok(d);
    };
    img.onerror = () => { URL.revokeObjectURL(url); mal(new Error("No se pudo leer la imagen.")); };
    img.src = url;
  });
}
// Abre el selector de archivos y devuelve la imagen ya reducida
function elegirImagen(tipo) {
  return new Promise((ok, mal) => {
    const inp = document.createElement("input");
    inp.type = "file"; inp.accept = "image/png,image/jpeg,image/webp";
    inp.onchange = () => leerImagen(inp.files[0], tipo).then(ok, mal);
    inp.click();
  });
}

// Iniciales de una empresa sin logo: ignora palabras cortas ("Textiles de Occidente" → "TO")
const inicialesEmp = n => (String(n).split(/\s+/).filter(w => w.length > 2).map(w => w[0]).join("") || String(n)[0] || "?").slice(0, 2).toUpperCase();
const avatar = (nombre, foto, extra = "") => `<span class="av ${extra}">${foto ? `<img src="${esc(foto)}" alt="">` : esc(initials(nombre || "?"))}</span>`;
const logoHTML = (e, cls = "logo-mini") => `<span class="${cls}">${e.logo ? `<img src="${esc(e.logo)}" alt="Logo de ${esc(e.nombre)}">` : `<span class="emp-ini">${esc(inicialesEmp(e.nombre))}</span>`}</span>`;

/* ---------- marca de la empresa y avatar ---------- */
function pintarMarca() {
  if (!usuario) return;
  const e = usuario.empresa;
  $("empBrand").innerHTML = e
    ? (e.logo ? `<img src="${esc(e.logo)}" alt="${esc(e.nombre)}" title="${esc(e.nombre)}">` : `<span class="emp-ini">${esc(inicialesEmp(e.nombre))}</span><b>${esc(e.nombre)}</b>`)
    : `<span class="emp-ini">IOT</span><b>Administración de la plataforma</b>`;
  $("uAv").innerHTML = usuario.foto ? `<img src="${esc(usuario.foto)}" alt="">` : esc(initials(usuario.n));
  $("orgTitle").textContent = "Organigrama de " + (e?.nombre || "la empresa");
  document.body.classList.toggle("super-mode", esSuperUsr());
  document.title = (e ? e.nombre + " · " : "") + "Plataforma de Desarrollo Organizacional IA | IOT Technologies";
}

// El súper administrador no tiene datos de empresa: entra directo a "Empresas".
function entrarSuper(u) {
  usuario = u;
  $("login").hidden = true; $("app").hidden = false;
  $("uName").textContent = u.n; $("uRole").textContent = u.r;
  applyPerms(); pintarMarca(); go("empresas");
}
startSession = (orig => async u => {
  if (u?.permisos?.super) return entrarSuper(u);
  await orig(u); pintarMarca();
})(startSession);
endSession = (orig => msg => {
  orig(msg);
  document.body.classList.remove("super-mode");
  $("empBrand").innerHTML = ""; document.title = "Plataforma de Desarrollo Organizacional IA | IOT Technologies";
})(endSession);
showWelcome = (orig => () => { if (!esSuperUsr()) orig(); })(showWelcome);
go = (orig => page => {
  if (esSuperUsr() && page !== "empresas") page = "empresas";
  orig(page);
  if (page === "usuarios") cargarUsuarios();
  if (page === "empresas") cargarEmpresas();
})(go);

/* ---------- Mi perfil ---------- */
document.body.insertAdjacentHTML("beforeend", `
<div class="modal" id="perfilModal"><div class="mc" style="width:min(560px,100%)">
  <div class="mh"><h3>Mi perfil</h3><button class="close" onclick="closeModal('perfilModal')" aria-label="Cerrar">×</button></div>
  <div class="perfil-head"><span id="pfAv"></span><div><b id="pfName" style="font-size:17px"></b><div class="note" id="pfInfo"></div>
    <div class="toolbar" style="margin-top:10px"><button class="btn small" onclick="cambiarFoto()">Cambiar foto</button><button class="btn small" id="pfQuitar" onclick="quitarFoto()">Quitar foto</button></div></div></div>
  <h4 style="margin:22px 0 10px">Cambiar contraseña</h4>
  <div class="fg"><div class="field s2"><label for="pfActual">Contraseña actual</label><input class="input" id="pfActual" type="password" autocomplete="current-password"></div>
    <div class="field"><label for="pfNueva">Nueva contraseña (mínimo 8 caracteres)</label><input class="input" id="pfNueva" type="password" autocomplete="new-password"></div>
    <div class="field"><label for="pfNueva2">Repite la nueva contraseña</label><input class="input" id="pfNueva2" type="password" autocomplete="new-password"></div></div>
  <div class="toolbar" style="margin-top:16px;justify-content:space-between"><button class="btn" id="pfPermisos" onclick="closeModal('perfilModal');showWelcome()">Ver lo que puedo hacer</button><button class="btn primary" id="pfSave" onclick="cambiarPassword()">Cambiar contraseña</button></div>
</div></div>
<div class="modal" id="usrModal"><div class="mc" style="width:min(600px,100%)">
  <div class="mh"><h3 id="umTitle"></h3><button class="close" onclick="closeModal('usrModal')" aria-label="Cerrar">×</button></div>
  <div id="umBody"></div>
  <div class="toolbar" style="margin-top:16px;justify-content:flex-end"><button class="btn" onclick="closeModal('usrModal')">Cancelar</button><button class="btn primary" id="umSave" onclick="guardarUsuario()">Guardar</button></div>
</div></div>
<div class="modal" id="empModal"><div class="mc" style="width:min(640px,100%)">
  <div class="mh"><h3 id="emTitle"></h3><button class="close" onclick="closeModal('empModal')" aria-label="Cerrar">×</button></div>
  <div id="emBody"></div>
  <div class="toolbar" style="margin-top:16px;justify-content:flex-end"><button class="btn" onclick="closeModal('empModal')">Cancelar</button><button class="btn primary" id="emSave" onclick="guardarEmpresa()">Guardar</button></div>
</div></div>`);

function abrirPerfil() {
  if (!usuario) return;
  $("pfAv").innerHTML = avatar(usuario.n, usuario.foto, "av-lg");
  $("pfName").textContent = usuario.n;
  $("pfInfo").textContent = `${usuario.r} · ${usuario.email}${usuario.empresa ? " · " + usuario.empresa.nombre : ""}`;
  $("pfQuitar").hidden = !usuario.foto;
  $("pfPermisos").hidden = esSuperUsr();
  ["pfActual", "pfNueva", "pfNueva2"].forEach(i => ($(i).value = ""));
  openModal("perfilModal");
}
$("userChip").onclick = abrirPerfil;
$("userChip").onkeydown = e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); abrirPerfil(); } };

async function guardarFoto(foto) {
  try {
    const d = await api("/api/perfil", { op: "foto", foto });
    usuario = { ...usuario, foto: d.user.foto };
    pintarMarca(); abrirPerfil();
    toast(foto ? "Foto de perfil actualizada." : "Foto de perfil eliminada.");
  } catch (e) { toast(e.message); }
}
async function cambiarFoto() { try { await guardarFoto(await elegirImagen("foto")); } catch (e) { toast(e.message); } }
function quitarFoto() { guardarFoto(""); }
async function cambiarPassword() {
  const actual = $("pfActual").value, nueva = $("pfNueva").value;
  if (!actual || !nueva) return toast("Escribe tu contraseña actual y la nueva.");
  if (nueva !== $("pfNueva2").value) return toast("Las contraseñas nuevas no coinciden.");
  const b = $("pfSave"); b.disabled = true;
  try { await api("/api/perfil", { op: "password", actual, nueva }); closeModal("perfilModal"); toast("Contraseña actualizada."); }
  catch (e) { toast(e.message); }
  finally { b.disabled = false; }
}

/* ---------- Usuarios y empresa (Administrador) ---------- */
let usuariosEmp = [];
let logoNuevo; // undefined = sin cambios, "" = quitar, data URL = nuevo

$("usuarios").innerHTML = `<div class="sh"><h3>Usuarios y empresa</h3></div>
  <p class="intro">Administra la identidad de tu empresa y las cuentas de tu equipo. Cada empresa solo ve su propia información; los usuarios que crees aquí entran directamente a tu empresa.</p>
  <div class="card" style="margin-bottom:18px"><h3 style="margin:0 0 14px">Mi empresa</h3>
    <div style="display:flex;gap:22px;flex-wrap:wrap;align-items:flex-start">
      <div><div class="logo-box" id="meLogo"></div>
        <div class="toolbar" style="margin-top:10px"><button class="btn small" onclick="cambiarLogoPropio()">Cambiar logo</button><button class="btn small" onclick="logoNuevo='';pintarMiEmpresa()">Quitar logo</button></div></div>
      <div style="flex:1;min-width:240px"><div class="field"><label for="meNombre">Nombre de la empresa</label><input class="input" id="meNombre" maxlength="150"></div>
        <p class="note" style="margin:8px 0 0">El logo aparece en el menú de todos los usuarios de tu empresa. Se recomienda PNG con fondo transparente.</p>
        <button class="btn primary" style="margin-top:14px" id="meSave" onclick="guardarMiEmpresa()">Guardar empresa</button></div></div></div>
  <div class="card"><div class="sh"><h3>Usuarios</h3><button class="btn primary" onclick="abrirUsuario()">+ Nuevo usuario</button></div>
    <div class="tw"><table><thead><tr><th>Usuario</th><th>Rol</th><th>Estado</th><th>Acciones</th></tr></thead><tbody id="usrBody"></tbody></table></div></div>`;

function pintarMiEmpresa() {
  const e = usuario?.empresa || { nombre: "", logo: "" };
  const logo = logoNuevo === undefined ? e.logo : logoNuevo;
  $("meLogo").innerHTML = logo ? `<img src="${esc(logo)}" alt="Logo">` : "Sin logo";
}
async function cargarUsuarios() {
  if (!can("admin")) return;
  logoNuevo = undefined; $("meNombre").value = usuario.empresa?.nombre || ""; pintarMiEmpresa();
  $("usrBody").innerHTML = `<tr><td colspan="4" class="empty">Cargando...</td></tr>`;
  try { usuariosEmp = (await api("/api/usuarios", null, "GET")).usuarios; pintarUsuarios(); }
  catch (e) { $("usrBody").innerHTML = `<tr><td colspan="4" class="empty err-box">${esc(e.message)}</td></tr>`; }
}
function pintarUsuarios() {
  $("usrBody").innerHTML = usuariosEmp.map(x => {
    const yo = x.id === usuario.id;
    return `<tr><td><div class="u-cell">${avatar(x.nombre, x.foto)}<div><b>${esc(x.nombre)}${yo ? " (tú)" : ""}</b><small>${esc(x.email)}</small></div></div></td>
      <td>${esc(x.rol)}</td><td><span class="tag ${x.activo ? "" : "off"}">${x.activo ? "Activo" : "Inactivo"}</span></td>
      <td><div class="toolbar" style="gap:6px;flex-wrap:nowrap"><button class="btn small" onclick="abrirUsuario(${x.id})">Editar</button><button class="btn small" onclick="abrirPassword(${x.id})">Contraseña</button>${yo ? "" : `<button class="btn small${x.activo ? " danger" : ""}" onclick="activarUsuario(${x.id},${!x.activo})">${x.activo ? "Desactivar" : "Activar"}</button>`}</div></td></tr>`;
  }).join("") || `<tr><td colspan="4" class="empty">No hay usuarios.</td></tr>`;
}
async function cambiarLogoPropio() { try { logoNuevo = await elegirImagen("logo"); pintarMiEmpresa(); toast("Logo listo: pulsa Guardar empresa."); } catch (e) { toast(e.message); } }
async function guardarMiEmpresa() {
  const b = $("meSave"); b.disabled = true;
  try {
    const d = await api("/api/empresas", { op: "mi-empresa", nombre: $("meNombre").value.trim(), ...(logoNuevo !== undefined && { logo: logoNuevo }) });
    usuario = { ...usuario, empresa: d.empresa }; logoNuevo = undefined;
    pintarMarca(); pintarMiEmpresa(); toast("Datos de la empresa guardados.");
  } catch (e) { toast(e.message); }
  finally { b.disabled = false; }
}

let usrEdit = null; // {modo:"nuevo"|"editar"|"password", id}
const rolOpts = sel => ROLES.map(r => `<option${r === sel ? " selected" : ""}>${r}</option>`).join("");
function abrirUsuario(id) {
  const x = usuariosEmp.find(u => u.id === id);
  usrEdit = { modo: x ? "editar" : "nuevo", id };
  $("umTitle").textContent = x ? "Editar usuario" : "Nuevo usuario";
  $("umBody").innerHTML = `<div class="fg">
    <div class="field"><label for="umNombre">Nombre completo *</label><input class="input" id="umNombre" maxlength="120" value="${esc(x?.nombre || "")}"></div>
    <div class="field"><label for="umRol">Rol *</label><select class="select" id="umRol">${rolOpts(x?.rol || "Recursos Humanos")}</select></div>
    ${x ? `<div class="field s2"><label>Correo</label><input class="input" value="${esc(x.email)}" disabled></div>`
      : `<div class="field"><label for="umEmail">Correo *</label><input class="input" id="umEmail" type="email" maxlength="190" placeholder="nombre@empresa.com"></div>
         <div class="field"><label for="umPass">Contraseña inicial * (mínimo 8)</label><input class="input" id="umPass" type="text" autocomplete="off"></div>`}</div>
    <p class="note" style="margin:12px 0 0">${x ? "El rol define qué puede editar y aprobar en cada módulo." : "Comparte la contraseña inicial con la persona; podrá cambiarla en «Mi perfil»."}</p>`;
  openModal("usrModal"); $("umNombre").focus();
}
function abrirPassword(id) {
  const x = usuariosEmp.find(u => u.id === id); if (!x) return;
  usrEdit = { modo: "password", id };
  $("umTitle").textContent = "Restablecer contraseña de " + x.nombre;
  $("umBody").innerHTML = `<div class="field"><label for="umPass">Nueva contraseña (mínimo 8 caracteres)</label><input class="input" id="umPass" type="text" autocomplete="off"></div>
    <p class="note" style="margin:10px 0 0">La persona podrá cambiarla después en «Mi perfil».</p>`;
  openModal("usrModal"); $("umPass").focus();
}
async function guardarUsuario() {
  const b = $("umSave"); b.disabled = true;
  try {
    let d;
    if (usrEdit.modo === "nuevo") d = await api("/api/usuarios", { op: "create", nombre: $("umNombre").value.trim(), email: $("umEmail").value.trim(), rol: $("umRol").value, password: $("umPass").value });
    else if (usrEdit.modo === "editar") {
      const x = usuariosEmp.find(u => u.id === usrEdit.id);
      d = await api("/api/usuarios", { op: "update", id: usrEdit.id, nombre: $("umNombre").value.trim(), rol: $("umRol").value, activo: x.activo });
    } else await api("/api/usuarios", { op: "password", id: usrEdit.id, password: $("umPass").value });
    if (d) { usuariosEmp = d.usuarios; pintarUsuarios(); }
    closeModal("usrModal");
    toast(usrEdit.modo === "nuevo" ? "Usuario creado." : usrEdit.modo === "editar" ? "Usuario actualizado." : "Contraseña restablecida.");
  } catch (e) { toast(e.message); }
  finally { b.disabled = false; }
}
async function activarUsuario(id, activo) {
  const x = usuariosEmp.find(u => u.id === id); if (!x) return;
  if (!activo && !confirm(`¿Desactivar a ${x.nombre}? Ya no podrá iniciar sesión.`)) return;
  try { usuariosEmp = (await api("/api/usuarios", { op: "update", id, nombre: x.nombre, rol: x.rol, activo })).usuarios; pintarUsuarios(); toast(activo ? "Usuario activado." : "Usuario desactivado."); }
  catch (e) { toast(e.message); }
}

/* ---------- Empresas (Súper administrador) ---------- */
let empresas = [];
$("empresas").innerHTML = `<div class="sh"><h3>Empresas de la plataforma</h3><button class="btn primary" onclick="abrirEmpresa()">+ Nueva empresa</button></div>
  <p class="intro">Cada empresa tiene su propio organigrama, módulos, usuarios y logo, y nunca ve la información de las demás. Al crear una empresa se crea también su primer Administrador, que después da de alta a su equipo.</p>
  <div class="card"><div class="tw"><table><thead><tr><th>Logo</th><th>Empresa</th><th>Usuarios activos</th><th>Puestos</th><th>Estado</th><th>Acciones</th></tr></thead><tbody id="empBody"></tbody></table></div></div>`;

async function cargarEmpresas() {
  if (!esSuperUsr()) return;
  $("empBody").innerHTML = `<tr><td colspan="6" class="empty">Cargando...</td></tr>`;
  try { empresas = (await api("/api/empresas", null, "GET")).empresas; pintarEmpresas(); }
  catch (e) { $("empBody").innerHTML = `<tr><td colspan="6" class="empty err-box">${esc(e.message)}</td></tr>`; }
}
function pintarEmpresas() {
  $("empBody").innerHTML = empresas.map(e => `<tr><td>${logoHTML(e)}</td><td><b>${esc(e.nombre)}</b></td><td>${e.usuarios}</td><td>${e.puestos}</td>
    <td><span class="tag ${e.activa ? "" : "off"}">${e.activa ? "Activa" : "Desactivada"}</span></td>
    <td><div class="toolbar" style="gap:6px;flex-wrap:nowrap"><button class="btn small" onclick="abrirEmpresa(${e.id})">Editar</button><button class="btn small${e.activa ? " danger" : ""}" onclick="activarEmpresa(${e.id},${!e.activa})">${e.activa ? "Desactivar" : "Activar"}</button></div></td></tr>`).join("")
    || `<tr><td colspan="6" class="empty">Todavía no hay empresas.</td></tr>`;
}
let empEdit = null, empLogo;
function pintarEmpLogo() { $("emLogo").innerHTML = empLogo ? `<img src="${esc(empLogo)}" alt="Logo">` : "Sin logo"; }
function abrirEmpresa(id) {
  const e = empresas.find(x => x.id === id);
  empEdit = e ? id : null; empLogo = e?.logo || "";
  $("emTitle").textContent = e ? "Editar empresa" : "Nueva empresa";
  $("emBody").innerHTML = `<div class="fg">
    <div class="field s2"><label for="emNombre">Nombre de la empresa *</label><input class="input" id="emNombre" maxlength="150" value="${esc(e?.nombre || "")}"></div>
    <div class="field s2"><label>Logo</label><div class="logo-box" id="emLogo"></div>
      <div class="toolbar" style="margin-top:8px"><button type="button" class="btn small" onclick="elegirImagen('logo').then(d=>{empLogo=d;pintarEmpLogo()},x=>toast(x.message))">Subir logo</button><button type="button" class="btn small" onclick="empLogo='';pintarEmpLogo()">Quitar logo</button></div></div>
    ${e ? "" : `<div class="field s2"><label class="checks" style="display:flex;border:0;padding:0;max-height:none"><input type="checkbox" id="emEjemplo"> Cargar datos de ejemplo (organigrama, procesos, políticas y KPIs) para hacer una demostración</label></div>
      <div class="field s2" style="margin-top:4px"><b>Primer administrador de la empresa</b></div>
      <div class="field"><label for="emAdmNombre">Nombre *</label><input class="input" id="emAdmNombre" maxlength="120"></div>
      <div class="field"><label for="emAdmEmail">Correo *</label><input class="input" id="emAdmEmail" type="email" maxlength="190"></div>
      <div class="field s2"><label for="emAdmPass">Contraseña inicial * (mínimo 8)</label><input class="input" id="emAdmPass" type="text" autocomplete="off"></div>`}</div>`;
  pintarEmpLogo(); openModal("empModal"); $("emNombre").focus();
}
async function guardarEmpresa() {
  const b = $("emSave"); b.disabled = true;
  try {
    const nombre = $("emNombre").value.trim(), actual = empresas.find(x => x.id === empEdit);
    const logo = actual && empLogo === actual.logo ? undefined : empLogo;
    const d = actual
      ? await api("/api/empresas", { op: "update", id: empEdit, nombre, activa: actual.activa, ...(logo !== undefined && { logo }) })
      : await api("/api/empresas", { op: "create", nombre, logo: empLogo, ejemplo: $("emEjemplo").checked, admin: { nombre: $("emAdmNombre").value.trim(), email: $("emAdmEmail").value.trim(), password: $("emAdmPass").value } });
    empresas = d.empresas; pintarEmpresas(); closeModal("empModal");
    toast(actual ? "Empresa actualizada." : `Empresa creada. Su administrador ya puede iniciar sesión.`);
  } catch (e) { toast(e.message); }
  finally { b.disabled = false; }
}
async function activarEmpresa(id, activa) {
  const e = empresas.find(x => x.id === id); if (!e) return;
  if (!activa && !confirm(`¿Desactivar ${e.nombre}? Ninguno de sus usuarios podrá iniciar sesión hasta que la actives de nuevo.`)) return;
  try { empresas = (await api("/api/empresas", { op: "update", id, nombre: e.nombre, activa })).empresas; pintarEmpresas(); toast(activa ? "Empresa activada." : "Empresa desactivada."); }
  catch (x) { toast(x.message); }
}

// Si la sesión se abrió antes de que cargara este archivo, aplicar la marca ahora
if (usuario) { if (esSuperUsr()) entrarSuper(usuario); else pintarMarca(); }
