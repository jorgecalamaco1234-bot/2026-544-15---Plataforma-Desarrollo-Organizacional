/* Módulos: Procesos ISO, Competencias, Políticas corporativas y KPIs.
   Usa las utilidades globales de index.html ($, esc, puestos, byId, depts, toast, api, can, go...).
   Los datos se leen y guardan en el servidor (/api/data y /api/items); aquí solo se muestran y editan. */

const ESTADOS = ["Borrador", "En revisión", "Aprobado"];
const NIVELES = ["Básico", "Intermedio", "Avanzado", "Experto"];
const tagCls = s => (s === "Aprobado" ? "" : s === "En revisión" ? "warn" : "draft");
const arr = a => (Array.isArray(a) ? a : []);
const pName = id => byId(+id)?.name || "";
const pIdByName = n => puestos.find(p => p.name.toLowerCase() === String(n || "").trim().toLowerCase())?.id || "";
const bullets = a => (arr(a).length ? `<ul class="ul">${arr(a).map(x => `<li>${esc(x)}</li>`).join("")}</ul>` : "<em>Sin registrar.</em>");

/* ---------- KPIs: cálculo ---------- */
const kpiLast = k => (arr(k.valores).length ? +k.valores[k.valores.length - 1] : null);
const kpiOk = k => { const v = kpiLast(k); if (v == null || k.meta === "" || k.meta == null) return null; return k.sentido === "menor" ? v <= +k.meta : v >= +k.meta; };
const fmt = (v, u) => (v == null || v === "" ? "—" : `${+(+v).toFixed(2)}${u === "%" ? "%" : u ? " " + u : ""}`);
function periodos(n, frec) {
  const step = { Mensual: 1, Trimestral: 3, Semestral: 6, Anual: 12 }[frec] || 1, out = [], d = new Date();
  d.setDate(1);
  for (let i = n; i >= 1; i--) { const x = new Date(d.getFullYear(), d.getMonth() - i * step, 1); out.push(x.toLocaleDateString("es-MX", { month: "short", year: "2-digit" })); }
  return out;
}
function kpiChart(k) {
  const vals = arr(k.valores).map(Number);
  if (!vals.length) return "<em>Sin mediciones registradas.</em>";
  const W = 600, Hh = 180, P = 28, PR = 84, max = Math.max(...vals, +k.meta || 0) * 1.12 || 1, bw = (W - P - PR) / vals.length, labels = periodos(vals.length, k.frecuencia);
  const y = v => Hh - P - (v / max) * (Hh - P * 2), my = y(+k.meta);
  const ok = v => (k.sentido === "menor" ? v <= +k.meta : v >= +k.meta);
  const bars = vals.map((v, i) => `<rect x="${P + i * bw + bw * 0.2}" y="${y(v)}" width="${bw * 0.6}" height="${Hh - P - y(v)}" rx="4" fill="${ok(v) ? "#1D7EAE" : "#FF661B"}"><title>${esc(labels[i])}: ${fmt(v, k.unidad)}</title></rect>
    ${Hh - P - y(v) > 24 ? `<text x="${P + i * bw + bw / 2}" y="${y(v) + 16}" text-anchor="middle" class="kv in">${fmt(v, k.unidad)}</text>` : `<text x="${P + i * bw + bw / 2}" y="${y(v) - 6}" text-anchor="middle" class="kv">${fmt(v, k.unidad)}</text>`}
    <text x="${P + i * bw + bw / 2}" y="${Hh - 8}" text-anchor="middle" class="kl">${esc(labels[i])}</text>`).join("");
  return `<svg class="kchart" viewBox="0 0 ${W} ${Hh}" role="img" aria-label="Mediciones de ${esc(k.nombre)}">${bars}
    <line x1="${P}" x2="${W - PR + 6}" y1="${my}" y2="${my}" stroke="#231F20" stroke-dasharray="5 4"/><text x="${W - PR + 12}" y="${my + 4}" class="kl km">Meta ${fmt(k.meta, k.unidad)}</text></svg>
    <p class="note" style="margin:6px 0 0"><i class="dot" style="background:#1D7EAE"></i>En meta <i class="dot" style="background:#FF661B;margin-left:10px"></i>Fuera de meta</p>`;
}

/* ---------- procesos: diagrama de flujo ---------- */
function flowHtml(pasos) {
  const ps = arr(pasos).filter(p => p && p.actividad);
  if (!ps.length) return "<em>Sin actividades registradas.</em>";
  return `<div class="flow"><div class="fl-term">Inicio</div>${ps.map((p, i) => `<div class="fl-arrow"></div><div class="fl-step"><span class="fl-n">${i + 1}</span><div><b>${esc(p.actividad)}</b>${p.responsable ? `<small>${esc(p.responsable)}</small>` : ""}</div></div>`).join("")}<div class="fl-arrow"></div><div class="fl-term">Fin</div></div>`;
}

/* ---------- configuración de cada módulo ---------- */
const MODS = {
  procesos: {
    title: "Procesos ISO", resumen: "Procesos con diagrama de flujo y control de versiones.", singular: "proceso", nuevo: "+ Nuevo proceso", pre: "PR",
    intro: "Procesos documentados con la estructura de ISO 9001: objetivo, alcance, entradas, salidas, actividades y responsables, con diagrama de flujo y control de versiones.",
    name: it => it.nombre,
    cols: [["Código", it => `<b>${esc(it.codigo)}</b>`], ["Proceso", it => esc(it.nombre)], ["Departamento", it => esc(it.dept)], ["Responsable", it => esc(pName(it.responsable) || "—")], ["Actividades", it => arr(it.pasos).length], ["Versión", it => "v" + it.version]],
    fields: [
      { k: "nombre", l: "Nombre del proceso", t: "text", req: 1 }, { k: "dept", l: "Departamento dueño", t: "dept", req: 1 },
      { k: "responsable", l: "Responsable del proceso", t: "puesto" }, { k: "objetivo", l: "Objetivo", t: "textarea", s2: 1 }, { k: "alcance", l: "Alcance", t: "textarea", s2: 1 },
      { k: "entradas", l: "Entradas (una por línea)", t: "list" }, { k: "salidas", l: "Salidas (una por línea)", t: "list" },
      { k: "pasos", l: "Actividades en orden (una por línea: Actividad | Responsable)", t: "steps", s2: 1, req: 1 }, { k: "indicadores", l: "Indicadores (uno por línea)", t: "list", s2: 1 },
    ],
    detail: it => `<div class="d"><b>Departamento y responsable</b>${esc(it.dept)} · ${esc(pName(it.responsable) || "Sin responsable asignado")}</div>
      <div class="d"><b>Objetivo</b>${esc(it.objetivo) || "<em>Sin registrar.</em>"}</div><div class="d"><b>Alcance</b>${esc(it.alcance) || "<em>Sin registrar.</em>"}</div>
      <div class="grid g2" style="gap:10px"><div class="d" style="margin:0"><b>Entradas</b>${bullets(it.entradas)}</div><div class="d" style="margin:0"><b>Salidas</b>${bullets(it.salidas)}</div></div>
      <div class="d" style="margin-top:10px"><b>Diagrama de flujo</b>${flowHtml(it.pasos)}</div><div class="d"><b>Indicadores</b>${bullets(it.indicadores)}</div>`,
    ai: {
      hint: "Escribe el nombre y el departamento (y si quieres, notas del proceso). La IA propone objetivo, alcance, entradas, salidas, actividades con responsables e indicadores.",
      need: f => f.nombre,
      body: (f, notas) => ({ tipo: "proceso", nombre: f.nombre, departamento: f.dept, descripcion: notas, puestos: puestos.map(p => p.name) }),
      apply: d => ({ objetivo: d.objetivo, alcance: d.alcance, entradas: d.entradas, salidas: d.salidas, pasos: arr(d.pasos), indicadores: d.indicadores }),
    },
  },
  competencias: {
    title: "Competencias", resumen: "Catálogo con niveles de dominio ligado a puestos.", singular: "competencia", nuevo: "+ Nueva competencia", pre: "CMP", noDept: 1,
    intro: "Catálogo de competencias con niveles de dominio, vinculado a los puestos del organigrama.",
    name: it => it.nombre,
    cols: [["Código", it => `<b>${esc(it.codigo)}</b>`], ["Competencia", it => esc(it.nombre)], ["Tipo", it => esc(it.tipo)], ["Puestos que la requieren", it => compPuestos(it).length], ["Versión", it => "v" + it.version]],
    fields: [
      { k: "nombre", l: "Nombre de la competencia", t: "text", req: 1 }, { k: "tipo", l: "Tipo", t: "select", opts: ["Técnica", "Conductual", "Directiva"] },
      { k: "descripcion", l: "Descripción", t: "textarea", s2: 1, req: 1 }, { k: "niveles", l: "Niveles de dominio", t: "niveles", s2: 1 },
      { k: "comportamientos", l: "Comportamientos observables (uno por línea)", t: "list", s2: 1 }, { k: "puestos", l: "Puestos que la requieren", t: "puestosMulti", s2: 1 },
    ],
    detail: it => `<div class="d"><b>Tipo</b>${esc(it.tipo)}</div><div class="d"><b>Descripción</b>${esc(it.descripcion)}</div>
      <div class="d"><b>Niveles de dominio</b><table class="mini"><tbody>${NIVELES.map((n, i) => `<tr><th>${n}</th><td>${esc(arr(it.niveles)[i]) || "<em>Sin definir</em>"}</td></tr>`).join("")}</tbody></table></div>
      <div class="d"><b>Comportamientos observables</b>${bullets(it.comportamientos)}</div>
      <div class="d"><b>Puestos que la requieren</b>${compPuestos(it).map(p => `<span class="tag" style="margin:3px 4px 0 0">${esc(p.name)}</span>`).join("") || "<em>Ningún puesto vinculado.</em>"}
        <p class="note" style="margin:8px 0 0">Incluye los puestos seleccionados aquí y los que tienen esta competencia en su descripción de puesto.</p></div>`,
    ai: {
      hint: "Escribe el nombre y el tipo de competencia. La IA propone la descripción, los 4 niveles de dominio, comportamientos y los puestos que la requieren.",
      need: f => f.nombre,
      body: (f, notas) => ({ tipo: "competencia", nombre: f.nombre, tipo_competencia: f.tipo, contexto: notas, puestos: puestos.map(p => p.name) }),
      apply: d => ({ descripcion: d.descripcion, niveles: arr(d.niveles).slice(0, 4), comportamientos: d.comportamientos, puestos: arr(d.puestos_sugeridos).map(pIdByName).filter(Boolean) }),
    },
  },
  politicas: {
    title: "Políticas corporativas", resumen: "Políticas con flujo de aprobación y versiones.", singular: "política", nuevo: "+ Nueva política", pre: "POL",
    intro: "Políticas con flujo de aprobación (Borrador → En revisión → Aprobado), registro de quién aprueba y control de versiones.",
    name: it => it.titulo,
    cols: [["Código", it => `<b>${esc(it.codigo)}</b>`], ["Política", it => esc(it.titulo)], ["Categoría", it => esc(it.categoria)], ["Aplica a", it => esc(arr(it.aplica).join(", ") || "—")], ["Versión", it => "v" + it.version]],
    fields: [
      { k: "titulo", l: "Título de la política", t: "text", req: 1 }, { k: "categoria", l: "Categoría", t: "select", opts: ["Calidad", "Recursos Humanos", "Seguridad e higiene", "Operación", "Ética y cumplimiento", "Tecnología"] },
      { k: "dept", l: "Departamento responsable", t: "dept", req: 1 }, { k: "aplica", l: "Aplica a", t: "deptsMulti" },
      { k: "objetivo", l: "Objetivo", t: "textarea", s2: 1 }, { k: "alcance", l: "Alcance", t: "textarea", s2: 1 },
      { k: "lineamientos", l: "Lineamientos (uno por línea)", t: "list", s2: 1, req: 1 }, { k: "responsabilidades", l: "Responsabilidades (una por línea)", t: "list", s2: 1 },
    ],
    detail: it => `<div class="d"><b>Categoría y responsable</b>${esc(it.categoria)} · ${esc(it.dept)}</div><div class="d"><b>Aplica a</b>${esc(arr(it.aplica).join(", ") || "Sin definir")}</div>
      <div class="d"><b>Objetivo</b>${esc(it.objetivo) || "<em>Sin registrar.</em>"}</div><div class="d"><b>Alcance</b>${esc(it.alcance) || "<em>Sin registrar.</em>"}</div>
      <div class="d"><b>Lineamientos</b>${bullets(it.lineamientos)}</div><div class="d"><b>Responsabilidades</b>${bullets(it.responsabilidades)}</div>`,
    ai: {
      hint: "Escribe el título, la categoría y el departamento (y si quieres, puntos clave). La IA redacta objetivo, alcance, lineamientos y responsabilidades.",
      need: f => f.titulo,
      body: (f, notas) => ({ tipo: "politica", titulo: f.titulo, categoria: f.categoria, departamento: f.dept, puntos: notas }),
      apply: d => ({ objetivo: d.objetivo, alcance: d.alcance, lineamientos: d.lineamientos, responsabilidades: d.responsabilidades }),
    },
  },
  kpis: {
    title: "KPIs y desempeño", resumen: "Indicadores por área con meta y semáforo.", singular: "KPI", nuevo: "+ Nuevo KPI", pre: "KPI",
    intro: "Indicadores por área con fórmula, meta, responsable y mediciones por periodo. El semáforo compara la última medición contra la meta.",
    name: it => it.nombre,
    cols: [["Código", it => `<b>${esc(it.codigo)}</b>`], ["KPI", it => esc(it.nombre)], ["Departamento", it => esc(it.dept)], ["Meta", it => (it.sentido === "menor" ? "≤ " : "≥ ") + fmt(it.meta, it.unidad)],
      ["Última medición", it => { const ok = kpiOk(it); return `<i class="dot" style="background:${ok == null ? "#BDC6C3" : ok ? "#1D7EAE" : "#FF661B"}"></i>${fmt(kpiLast(it), it.unidad)}`; }], ["Frecuencia", it => esc(it.frecuencia)]],
    fields: [
      { k: "nombre", l: "Nombre del KPI", t: "text", req: 1 }, { k: "dept", l: "Departamento", t: "dept", req: 1 },
      { k: "responsable", l: "Responsable", t: "puesto" }, { k: "frecuencia", l: "Frecuencia de medición", t: "select", opts: ["Mensual", "Trimestral", "Semestral", "Anual"] },
      { k: "descripcion", l: "Descripción", t: "textarea", s2: 1 }, { k: "formula", l: "Fórmula", t: "text", s2: 1, req: 1 },
      { k: "unidad", l: "Unidad (%, días, piezas...)", t: "text" }, { k: "meta", l: "Meta", t: "number", req: 1 },
      { k: "sentido", l: "¿Qué es mejor?", t: "select", opts: [["mayor", "Mayor o igual a la meta"], ["menor", "Menor o igual a la meta"]] },
      { k: "valores", l: "Mediciones por periodo, de la más antigua a la más reciente (separadas por coma)", t: "nums", s2: 1 },
    ],
    detail: it => { const ok = kpiOk(it); return `<div class="d"><b>Departamento y responsable</b>${esc(it.dept)} · ${esc(pName(it.responsable) || "Sin responsable asignado")}</div>
      ${it.descripcion ? `<div class="d"><b>Descripción</b>${esc(it.descripcion)}</div>` : ""}<div class="d"><b>Fórmula</b>${esc(it.formula)}</div>
      <div class="grid g2" style="gap:10px"><div class="d" style="margin:0"><b>Meta (${it.sentido === "menor" ? "menor es mejor" : "mayor es mejor"})</b>${fmt(it.meta, it.unidad)} · ${esc(it.frecuencia)}</div>
      <div class="d" style="margin:0"><b>Última medición</b>${fmt(kpiLast(it), it.unidad)} ${ok == null ? "" : `<span class="tag ${ok ? "" : "warn"}" style="margin-left:6px">${ok ? "En meta" : "Fuera de meta"}</span>`}</div></div>
      <div class="d" style="margin-top:10px"><b>Mediciones</b>${kpiChart(it)}</div>`; },
    ai: {
      hint: "Escribe el departamento (y si quieres, qué necesitas medir). La IA propone de 3 a 5 KPIs; elige uno para llenar el formulario.",
      need: f => f.dept,
      body: (f, notas) => ({ tipo: "kpi", departamento: f.dept, enfoque: notas, existentes: data.kpis.map(k => k.nombre), puestos: puestos.map(p => p.name) }),
      list: d => arr(d.kpis),
      apply: k => ({ nombre: k.nombre, descripcion: k.descripcion, formula: k.formula, unidad: k.unidad, meta: k.meta, sentido: k.sentido, frecuencia: k.frecuencia, responsable: pIdByName(k.responsable) }),
    },
  },
};

const compPuestos = it => puestos.filter(p => arr(it.puestos).includes(p.id) || arr(p.comp).some(c => c.toLowerCase() === String(it.nombre).toLowerCase()));

/* ---------- datos y guardado ---------- */
const data = {};
for (const k in MODS) data[k] = [];
// Recibe la respuesta de /api/data (o de un restablecimiento) y refresca la vista actual
function setModData(d) {
  for (const k in MODS) data[k] = Array.isArray(d?.[k]) ? d[k] : [];
  for (const k in MODS) if ($(k).classList.contains("active")) renderMod(k);
  updateStats();
}
const replaceIt = (k, item) => { data[k] = data[k].some(x => x.id === item.id) ? data[k].map(x => (x.id === item.id ? item : x)) : [...data[k], item]; };
const findIt = (k, id) => data[k].find(x => x.id === id);
const filtros = {};

/* ---------- interfaz: página de cada módulo ---------- */
for (const k in MODS) {
  const m = MODS[k];
  titles[k] = m.title;
  filtros[k] = { q: "", estado: "" };
  $(k).innerHTML = `<div class="sh"><h3>${esc(m.title)}</h3>
      <div class="toolbar"><input class="input" placeholder="Buscar..." style="width:200px" oninput="filtros.${k}.q=this.value;renderMod('${k}')">
        <select class="select" style="width:150px" onchange="filtros.${k}.estado=this.value;renderMod('${k}')"><option value="">Todos los estados</option>${ESTADOS.map(s => `<option>${s}</option>`).join("")}</select>
        <button class="btn" data-perm="admin" onclick="resetOrg()">Restablecer</button><button class="btn primary" data-perm="editar:${k}" onclick="openForm('${k}')">${esc(m.nuevo)}</button></div></div>
    <p class="intro">${esc(m.intro)}</p>
    <div class="chips-row" id="${k}Counts"></div>
    <div class="card"><div class="tw"><table><thead><tr>${m.cols.map(c => `<th>${c[0]}</th>`).join("")}<th>Estado</th><th>Acciones</th></tr></thead><tbody id="${k}Body"></tbody></table></div></div>`;
}

function renderMod(k) {
  const m = MODS[k], f = filtros[k], q = f.q.trim().toLowerCase();
  const list = data[k].filter(it => (!f.estado || it.estado === f.estado) && (!q || JSON.stringify([m.name(it), it.codigo, it.dept, it.tipo, it.categoria]).toLowerCase().includes(q)));
  $(k + "Body").innerHTML = list.map(it => `<tr>${m.cols.map(c => `<td>${c[1](it)}</td>`).join("")}<td><span class="tag ${tagCls(it.estado)}">${esc(it.estado)}</span></td><td><button class="btn small" onclick="showItem('${k}',${it.id})">Ver</button></td></tr>`).join("")
    || `<tr><td colspan="${m.cols.length + 2}" class="empty">No hay registros con esos filtros.</td></tr>`;
  $(k + "Counts").innerHTML = ESTADOS.map(s => `<span class="tag ${tagCls(s)}">${s}: ${data[k].filter(x => x.estado === s).length}</span>`).join("");
}

/* ---------- detalle, flujo de aprobación y versiones ---------- */
function showItem(k, id) {
  const m = MODS[k], it = findIt(k, id);
  if (!it) return;
  const ed = can("editar", k);
  const next = ({ Borrador: ed && ["enviar", "Enviar a revisión"], "En revisión": can("aprobar", k) && ["aprobar", "Aprobar"] })[it.estado];
  $("mdTitle").textContent = m.name(it);
  $("mdBody").innerHTML = `<div class="toolbar" style="margin-bottom:12px"><span class="tag">${esc(it.codigo)}</span><span class="tag">Versión ${it.version}</span><span class="tag ${tagCls(it.estado)}">${esc(it.estado)}</span></div>
    <div class="details">${m.detail(it)}
      <div class="d"><b>Aprobación</b>${it.estado === "Aprobado" && it.aprobadoPor ? `Aprobado por ${esc(it.aprobadoPor)} el ${esc(it.aprobadoEl)}. <span class="note">Registro simulado; no equivale a una firma electrónica.</span>` : "Pendiente de aprobación."}</div>
      <div class="d"><b>Historial de versiones</b><ul class="ul hist">${arr(it.historial).slice().reverse().map(h => `<li><b>v${h.v}</b> · ${esc(h.fecha)} · ${esc(h.autor)} — ${esc(h.nota)}</li>`).join("")}</ul></div></div>
    <div class="toolbar" style="margin-top:14px;justify-content:flex-end">
      ${ed ? `<button class="btn danger" onclick="delItem('${k}',${id})">Eliminar</button>` : ""}
      ${ed && it.estado === "En revisión" ? `<button class="btn" onclick="cambiarEstado('${k}',${id},'regresar')">Regresar a borrador</button>` : ""}
      ${ed ? `<button class="btn" onclick="openForm('${k}',${id})">${it.estado === "Aprobado" ? "Crear nueva versión" : "Editar"}</button>` : ""}
      ${next ? `<button class="btn primary" onclick="cambiarEstado('${k}',${id},'${next[0]}')">${next[1]}</button>` : ""}
      ${!ed && !next ? '<span class="note">Tu rol solo puede consultar este registro.</span>' : ""}</div>`;
  openModal("modDetail");
}

async function cambiarEstado(k, id, accion) {
  try {
    const d = await api("/api/items", { mod: k, op: "estado", id, accion });
    replaceIt(k, d.item); renderMod(k); updateStats(); showItem(k, id);
    toast({ enviar: "Enviado a revisión.", regresar: "Regresado a borrador.", aprobar: "Aprobado tras revisión humana." }[accion]);
  } catch (e) { toast(e.message); }
}

async function delItem(k, id) {
  if (!confirm(`¿Eliminar este registro de ${MODS[k].title}?`)) return;
  try {
    await api("/api/items", { mod: k, op: "delete", id });
    data[k] = data[k].filter(x => x.id !== id); closeModal("modDetail"); renderMod(k); updateStats(); toast("Registro eliminado.");
  } catch (e) { toast(e.message); }
}

/* ---------- formulario de alta / edición con IA ---------- */
let formCtx = null;
const fid = k => "mf_" + k;

function fieldHtml(f) {
  const id = fid(f.k), lab = `<label for="${id}">${esc(f.l)}${f.req ? " *" : ""}</label>`;
  const wrap = h => `<div class="field${f.s2 ? " s2" : ""}">${h}</div>`;
  switch (f.t) {
    case "textarea": case "list": case "steps": return wrap(lab + `<textarea class="textarea" id="${id}" style="min-height:${f.t === "steps" ? 150 : 70}px"></textarea>`);
    case "select": return wrap(lab + `<select class="select" id="${id}">${f.opts.map(o => (Array.isArray(o) ? `<option value="${o[0]}">${esc(o[1])}</option>` : `<option>${esc(o)}</option>`)).join("")}</select>`);
    case "puesto": return wrap(lab + `<select class="select" id="${id}"><option value="">— Sin asignar —</option>${puestos.map(p => `<option value="${p.id}">${esc(p.name)} (${esc(p.dept)})</option>`).join("")}</select>`);
    case "dept": return wrap(lab + `<input class="input" id="${id}" list="deptList">`);
    case "number": return wrap(lab + `<input class="input" id="${id}" type="number" step="any">`);
    case "niveles": return wrap(`<label>${esc(f.l)}</label><div class="fg">${NIVELES.map((n, i) => `<div class="field"><label for="${id}_${i}">${n}</label><textarea class="textarea" id="${id}_${i}" style="min-height:60px"></textarea></div>`).join("")}</div>`);
    case "puestosMulti": return wrap(`<label>${esc(f.l)}</label><div class="checks" id="${id}">${puestos.map(p => `<label><input type="checkbox" value="${p.id}"> ${esc(p.name)}</label>`).join("")}</div>`);
    case "deptsMulti": return wrap(`<label>${esc(f.l)}</label><div class="checks" id="${id}">${depts().map(d => `<label><input type="checkbox" value="${esc(d)}"> ${esc(d)}</label>`).join("")}</div>`);
    default: return wrap(lab + `<input class="input" id="${id}">`); // text, nums
  }
}

function setField(f, v) {
  const el = $(fid(f.k));
  switch (f.t) {
    case "list": el.value = arr(v).join("\n"); break;
    case "steps": el.value = arr(v).map(p => (p.responsable ? `${p.actividad} | ${p.responsable}` : p.actividad)).join("\n"); break;
    case "nums": el.value = arr(v).join(", "); break;
    case "niveles": NIVELES.forEach((_, i) => ($(fid(f.k) + "_" + i).value = arr(v)[i] || "")); break;
    case "puestosMulti": case "deptsMulti": el.querySelectorAll("input").forEach(c => (c.checked = arr(v).map(String).includes(c.value))); break;
    default: el.value = v ?? "";
  }
}

function getField(f) {
  const el = $(fid(f.k)), lines = () => el.value.split("\n").map(s => s.trim()).filter(Boolean);
  switch (f.t) {
    case "list": return lines();
    case "steps": return lines().map(l => { const [a, ...r] = l.split("|"); return { actividad: a.trim(), responsable: r.join("|").trim() }; });
    case "nums": return el.value.split(/[,;\s]+/).map(s => s.trim()).filter(s => s !== "" && !isNaN(+s)).map(Number);
    case "number": return el.value === "" ? "" : +el.value;
    case "puesto": return el.value ? +el.value : "";
    case "niveles": return NIVELES.map((_, i) => $(fid(f.k) + "_" + i).value.trim());
    case "puestosMulti": return [...el.querySelectorAll("input:checked")].map(c => +c.value);
    case "deptsMulti": return [...el.querySelectorAll("input:checked")].map(c => c.value);
    default: return el.value.trim();
  }
}

function openForm(k, id) {
  const m = MODS[k], it = id ? findIt(k, id) : null;
  formCtx = { k, id: it?.id, ia: false };
  fillParents();
  $("mfTitle").textContent = it ? (it.estado === "Aprobado" ? `Nueva versión de ${m.name(it)}` : `Editar ${m.singular}`) : m.nuevo.replace("+ ", "");
  $("mfBody").innerHTML = `<div class="ai-panel"><div><b>✦ Asistente IA</b><p class="note" style="margin:4px 0 8px">${esc(m.ai.hint)}</p>
      <textarea class="textarea" id="mfNotas" style="min-height:54px" placeholder="Notas opcionales para la IA..."></textarea></div>
      <div class="toolbar" style="margin-top:8px"><button class="btn primary" id="mfAiBtn" onclick="aiForm()">✦ Generar con IA</button><span class="note" id="mfAiMsg"></span></div><div id="mfAiList"></div></div>
    <div class="fg" style="margin-top:14px">${m.fields.map(fieldHtml).join("")}</div>
    ${it && it.estado === "Aprobado" ? `<p class="note" style="margin-top:12px">Al guardar se creará la versión ${it.version + 1} en estado "En revisión"; la versión ${it.version} queda en el historial.</p>` : ""}`;
  m.fields.forEach(f => setField(f, it ? it[f.k] : f.t === "select" ? (Array.isArray(f.opts[0]) ? f.opts[0][0] : f.opts[0]) : ""));
  closeModal("modDetail");
  openModal("modForm");
}

async function aiForm() {
  const { k } = formCtx, m = MODS[k], cur = {};
  m.fields.forEach(f => (cur[f.k] = getField(f)));
  if (!m.ai.need(cur)) { toast(k === "kpis" ? "Escribe el departamento para que la IA proponga KPIs." : "Escribe el nombre o título antes de usar la IA."); return; }
  const btn = $("mfAiBtn");
  btn.disabled = true; btn.textContent = "Generando..."; $("mfAiList").innerHTML = "";
  const t0 = Date.now(), tick = () => ($("mfAiMsg").textContent = `La IA está redactando... ${Math.round((Date.now() - t0) / 1000)} s`);
  tick(); const timer = setInterval(tick, 1000);
  try {
    const d = await api("/api/draft", m.ai.body(cur, $("mfNotas").value.trim()));
    if (m.ai.list) {
      const items = m.ai.list(d);
      formCtx.sugerencias = items;
      $("mfAiList").innerHTML = items.length ? `<div class="sug">${items.map((s, i) => `<div class="li"><div><strong>${esc(s.nombre)}</strong><span class="s">${esc(s.formula)} · meta ${s.sentido === "menor" ? "≤" : "≥"} ${fmt(s.meta, s.unidad)} · ${esc(s.frecuencia)}</span></div><button class="btn small" onclick="useSug(${i})">Usar</button></div>`).join("")}</div>` : "";
      $("mfAiMsg").textContent = items.length ? "Elige una propuesta para llenar el formulario." : "La IA no devolvió propuestas.";
    } else {
      fillFromAi(m.ai.apply(d));
      $("mfAiMsg").textContent = "Borrador generado. Revísalo y edítalo antes de guardar.";
    }
  } catch (e) {
    $("mfAiMsg").innerHTML = `<span class="err-box">${esc(e.message)}</span>`;
  } finally {
    clearInterval(timer); btn.disabled = false; btn.textContent = "✦ Generar con IA";
  }
}

function fillFromAi(vals) {
  const m = MODS[formCtx.k];
  m.fields.forEach(f => { if (vals[f.k] !== undefined && vals[f.k] !== null && vals[f.k] !== "") setField(f, vals[f.k]); });
  formCtx.ia = true;
}
function useSug(i) { fillFromAi(MODS.kpis.ai.apply(formCtx.sugerencias[i])); $("mfAiMsg").textContent = "Propuesta aplicada. Revísala y agrega mediciones si las tienes."; }

async function saveForm() {
  const { k, id, ia } = formCtx, m = MODS[k], vals = {};
  for (const f of m.fields) {
    vals[f.k] = getField(f);
    const empty = Array.isArray(vals[f.k]) ? !vals[f.k].length : vals[f.k] === "";
    if (f.req && empty) { toast(`Completa el campo "${f.l.replace(/\s*\(.*\)$/, "")}".`); $(fid(f.k))?.focus(); return; }
  }
  const btn = $("mfSave");
  btn.disabled = true; btn.textContent = "Guardando...";
  try {
    const d = await api("/api/items", { mod: k, op: id ? "update" : "create", id, datos: vals, ia });
    replaceIt(k, d.item); closeModal("modForm"); renderMod(k); updateStats();
    toast(id ? (d.item.estado === "En revisión" && d.item.historial.at(-1)?.nota.startsWith("Nueva versión") ? `Se creó la versión ${d.item.version} en revisión.` : "Cambios guardados.") : `Registro ${d.item.codigo} guardado como borrador.`);
  } catch (e) {
    toast(e.message);
  } finally {
    btn.disabled = false; btn.textContent = "Guardar";
  }
}

/* ---------- modales ---------- */
document.body.insertAdjacentHTML("beforeend", `
<div class="modal" id="modDetail"><div class="mc mc-wide"><div class="mh"><h3 id="mdTitle"></h3><button class="close" onclick="closeModal('modDetail')" aria-label="Cerrar">×</button></div><div id="mdBody"></div></div></div>
<div class="modal" id="modForm"><div class="mc mc-wide"><div class="mh"><h3 id="mfTitle"></h3><button class="close" onclick="closeModal('modForm')" aria-label="Cerrar">×</button></div><div id="mfBody"></div>
  <div class="toolbar" style="margin-top:16px;justify-content:flex-end"><button class="btn" onclick="closeModal('modForm')">Cancelar</button><button class="btn primary" id="mfSave" onclick="saveForm()">Guardar</button></div></div></div>`);

/* ---------- integración con navegación, dashboard y chat ---------- */
go = (orig => page => { orig(page); if (MODS[page]) renderMod(page); })(go);

updateStats = (orig => () => {
  orig();
  const ap = k => data[k].filter(x => x.estado === "Aprobado").length;
  if ($("statProc")) {
    $("statProc").textContent = `${ap("procesos")}/${data.procesos.length}`;
    $("statComp").textContent = data.competencias.length;
    $("statPol").textContent = `${ap("politicas")}/${data.politicas.length}`;
    const med = data.kpis.filter(x => kpiOk(x) != null);
    $("statKpi").textContent = `${med.filter(kpiOk).length}/${med.length}`;
  }
  if ($("modList")) {
    const row = (t, s, n, page) => `<div class="li"><div><strong>${t}</strong><span class="s">${s}</span></div><button class="btn small" onclick="go('${page}')">${n}</button></div>`;
    $("modList").innerHTML = row("Gestión Organizacional", "Organigrama por niveles de mando.", `${puestos.length} puestos`, "organigrama")
      + row("Descripciones de Puesto", "Perfiles con generación asistida por IA.", `${puestos.filter(p => p.status === "Completa").length} completas`, "puestos")
      + Object.keys(MODS).map(k => row(MODS[k].title, MODS[k].resumen, `${data[k].length} registros`, k)).join("");
  }
})(updateStats);

// Resumen de los módulos para el chat
function modSummary() {
  const L = [];
  data.procesos.forEach(p => L.push(`Proceso ${p.codigo} "${p.nombre}" (${p.dept}, v${p.version}, ${p.estado}); responsable: ${pName(p.responsable) || "sin asignar"}; actividades: ${arr(p.pasos).map(s => s.actividad).join(" > ")}`));
  data.competencias.forEach(c => L.push(`Competencia ${c.codigo} "${c.nombre}" (${c.tipo}, ${c.estado}); puestos: ${compPuestos(c).map(p => p.name).join(", ") || "ninguno"}`));
  data.politicas.forEach(p => L.push(`Política ${p.codigo} "${p.titulo}" (${p.categoria}, v${p.version}, ${p.estado}); aplica a: ${arr(p.aplica).join(", ")}`));
  data.kpis.forEach(k => { const ok = kpiOk(k); L.push(`KPI ${k.codigo} "${k.nombre}" (${k.dept}, ${k.estado}); meta ${k.sentido === "menor" ? "≤" : "≥"} ${fmt(k.meta, k.unidad)}; última medición ${fmt(kpiLast(k), k.unidad)}${ok == null ? "" : ok ? " (en meta)" : " (fuera de meta)"}`); });
  return L.join("\n");
}

updateStats();
applyPerms();
