/* Talento y estructura:
   - Análisis de estructura: funciones repetidas, puestos incompletos (propósito, funciones, indicadores) y tramo de control.
   - Desempeño: calificación de cada persona con color por nivel, en qué está bajando y cómo mejorar (con IA).
   - Alertas de acción inmediata y acciones de mejora.
   - Contratación: formulario de evaluación de candidatos con puntaje, recomendación y decisión humana.
   - Dashboard: índice de salud organizacional y reporte ejecutivo (el valor que ve la empresa cliente).
   Los cálculos (calificaciones, alertas, funciones repetidas, puntaje de candidatos) los hace el servidor; aquí solo se muestran.
   Usa las utilidades globales de index.html y modulos.js ($, esc, puestos, byId, api, can, go, toast, data, fmt...). */

const T = { colaboradores: [], evaluaciones: [], acciones: [], candidatos: [], desempeno: [], alertas: [], duplicados: [], periodoActual: "" };
Object.assign(titles, { estructura: "Análisis de estructura", desempeno: "Desempeño del personal", alertas: "Alertas de acción inmediata", contratacion: "Contratación" });

/* ---------- niveles de desempeño (mismos rangos que el servidor) ---------- */
const NIV = {
  "Sobresaliente": { c: "#0032A0", cls: "sob", rango: "90 a 100" },
  "Cumple": { c: "#1D7EAE", cls: "cum", rango: "75 a 89" },
  "En riesgo": { c: "#FFA26B", cls: "rie", rango: "60 a 74" },
  "Bajo desempeño": { c: "#FF661B", cls: "baj", rango: "menos de 60" },
  "Sin evaluar": { c: "#BDC6C3", cls: "sin", rango: "" },
};
const NIV_ORDEN = Object.keys(NIV);
const nivelDe = p => (p == null ? "Sin evaluar" : p >= 90 ? "Sobresaliente" : p >= 75 ? "Cumple" : p >= 60 ? "En riesgo" : "Bajo desempeño");
const NIVEL_COMP = ["", "Básico", "Intermedio", "Avanzado", "Experto"];
const REC_CLS = { "Contratar": "cum", "Segunda entrevista": "rie", "No recomendable": "baj", "Faltan datos": "sin" };
const DEC_CLS = { "Contratado": "", "En evaluación": "draft", "En espera": "warn", "Descartado": "off" };

/* ---------- datos ---------- */
function setTalento(d) {
  for (const k of ["colaboradores", "evaluaciones", "acciones", "candidatos", "desempeno", "alertas", "duplicados"]) T[k] = Array.isArray(d?.[k]) ? d[k] : [];
  T.periodoActual = d?.periodoActual || "";
  refrescarTalento();
}
setModData = (orig => d => { orig(d); setTalento(d); })(setModData);

// Ejecuta una operación de /api/talento; el servidor responde con todos los datos de talento recalculados.
async function talento(body, ok) {
  const d = await api("/api/talento", body);
  setTalento(d);
  toast(d.aviso || ok || "Guardado.");
  return d;
}

const colab = id => T.colaboradores.find(c => c.id === id);
const perf = id => T.desempeno.find(d => d.colaborador === id) || { nivel: "Sin evaluar", puntaje: null, tendencia: [], bajando: [], debajo: [], recomendaciones: [], cambio: null };
const activos = () => T.colaboradores.filter(c => c.activo);
const genteDe = pid => activos().filter(c => c.puesto === pid);
const jefeDe = pid => byId(byId(pid)?.parent);
const evalsDe = id => T.evaluaciones.filter(e => e.colaborador === id).sort((a, b) => a.periodo.localeCompare(b.periodo));
const mesTxt = p => (p ? new Date(p + "-15T12:00:00").toLocaleDateString("es-MX", { month: "short", year: "numeric" }) : "—");
const fechaTxt = f => (f ? new Date(f.length === 10 ? f + "T12:00:00" : f).toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" }) : "—");
const hoyISO = () => new Date().toISOString().slice(0, 10);
const masDias = n => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
const prom = a => (a.length ? Math.round(a.reduce((s, x) => s + x, 0) / a.length) : null);

const nivelChip = (nivel, puntaje) => `<span class="lvl ${NIV[nivel]?.cls || "sin"}">${puntaje != null ? `<b>${puntaje}</b> · ` : ""}${esc(nivel)}</span>`;
const barra = (v, color) => `<span class="sbar"><i style="width:${Math.max(0, Math.min(100, v ?? 0))}%;background:${color || NIV[nivelDe(v)].c}"></i></span>`;
const cambioTxt = c => (c == null ? '<span class="note">—</span>' : c > 0 ? `<span class="up">▲ ${c}</span>` : c < 0 ? `<span class="down">▼ ${-c}</span>` : '<span class="note">= 0</span>');

// Mini gráfica de la tendencia de calificaciones
function spark(tend, w = 110, h = 30) {
  const pts = tend.filter(t => t.puntaje != null);
  if (!pts.length) return '<span class="note">Sin datos</span>';
  if (pts.length === 1) return `<svg class="spark" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><circle cx="${w / 2}" cy="${h / 2}" r="4" fill="${NIV[nivelDe(pts[0].puntaje)].c}"/></svg>`;
  const x = i => 5 + (i * (w - 10)) / (pts.length - 1), y = v => h - 4 - (v / 100) * (h - 8);
  const ult = pts.at(-1);
  return `<svg class="spark" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="Tendencia: ${pts.map(p => p.puntaje).join(", ")}">
    <polyline points="${pts.map((p, i) => `${x(i)},${y(p.puntaje)}`).join(" ")}" fill="none" stroke="#1D7EAE" stroke-width="2" stroke-linejoin="round"/>
    ${pts.map((p, i) => `<circle cx="${x(i)}" cy="${y(p.puntaje)}" r="${i === pts.length - 1 ? 4 : 2.5}" fill="${i === pts.length - 1 ? NIV[nivelDe(ult.puntaje)].c : "#1D7EAE"}"><title>${mesTxt(p.periodo)}: ${p.puntaje}</title></circle>`).join("")}</svg>`;
}

/* ---------- integración con puestos y organigrama (los usa index.html) ---------- */
function plazasTxt(p) {
  const n = genteDe(p.id).length, v = p.plazas - n;
  return `${n}/${p.plazas}${v > 0 ? ` <span class="tag warn">${v} vacante${v > 1 ? "s" : ""}</span>` : v < 0 ? ` <span class="tag warn">${-v} de más</span>` : ""}`;
}
// Puntos en cada puesto del organigrama: uno por persona (color de su nivel) y uno punteado por plaza vacante
function puntosPuesto(p) {
  const g = genteDe(p.id), vac = Math.max(0, p.plazas - g.length);
  if (!g.length && !vac) return "";
  return `<span class="pdots" title="${g.length} de ${p.plazas} plazas ocupadas">${g.slice(0, 8).map(c => `<i style="background:${NIV[perf(c.id).nivel].c}"></i>`).join("")}${'<i class="vac"></i>'.repeat(Math.min(vac, 4))}</span>`;
}
// Color del puesto en modo desempeño: el nivel del promedio de las personas que lo ocupan
function colorPuesto(pid) {
  return NIV[nivelDe(prom(genteDe(pid).map(c => perf(c.id).puntaje).filter(x => x != null)))].c;
}
// Pie del puesto en modo desempeño: promedio y nivel de quienes lo ocupan
function resumenPuesto(p) {
  const g = genteDe(p.id), pr = prom(g.map(c => perf(c.id).puntaje).filter(x => x != null));
  return `<span>${!g.length ? "Sin personas" : pr == null ? "Sin evaluar" : `<b style="color:var(--ink)">${pr}</b> · ${nivelDe(pr)}`}</span>`;
}
function leyendaNiveles() {
  return NIV_ORDEN.map(n => `<span class="chip"><i style="background:${NIV[n].c}"></i>${n}${NIV[n].rango ? ` <small class="note">${NIV[n].rango}</small>` : ""}</span>`).join("")
    + '<span class="note" style="align-self:center">Barra = promedio del puesto · puntos = cada persona · punteado = plaza vacante</span>';
}
// Puesto con el que se repite una función (o "")
function repetidaEn(pid, f) {
  const d = T.duplicados.find(x => (x.a === pid && x.funcionA === f) || (x.b === pid && x.funcionB === f));
  return d ? (d.a === pid ? d.puestoB : d.puestoA) : "";
}
function personasPuestoHTML(p) {
  const g = genteDe(p.id);
  return `<div class="d"><b>Personas en el puesto (${g.length} de ${p.plazas} plazas)</b>
    ${g.length ? `<div class="plist">${g.map(c => `<button class="pbtn" onclick="closeModal('detailModal');verPersona(${c.id})">${esc(c.nombre)} ${nivelChip(perf(c.id).nivel, perf(c.id).puntaje)}</button>`).join("")}</div>` : "<em>Nadie ocupa este puesto todavía.</em>"}
    ${p.plazas > g.length && can("editar", "contratacion") ? `<div style="margin-top:8px"><button class="btn small" onclick="closeModal('detailModal');abrirCandidato(null,${p.id})">+ Evaluar candidato para la vacante</button></div>` : ""}</div>`;
}

/* ---------- análisis de estructura ---------- */
const faltaDe = p => [!p.obj && "propósito", !lineas(p.resp).length && "funciones", !(p.indicadores || []).length && "indicadores"].filter(Boolean);

function renderEstructura() {
  const completos = puestos.filter(p => !faltaDe(p).length).length;
  const incompletos = puestos.filter(p => faltaDe(p).length);
  const jefes = puestos.map(p => ({ p, n: puestos.filter(q => q.parent === p.id).length })).filter(x => x.n);
  const tramo = jefes.filter(x => x.n > 8 || x.n === 1);
  const plazas = puestos.reduce((s, p) => s + p.plazas, 0), ocup = activos().length;
  const ed = can("editar", "puestos");
  $("estructura").innerHTML = `<div class="sh"><h3>Análisis de estructura</h3><div class="toolbar"><button class="btn" onclick="go('organigrama')">Ver organigrama</button></div></div>
    <p class="intro">Revisa que cada puesto tenga un propósito claro, funciones propias (sin repetirse con otros puestos) e indicadores de estándar para medir a quien lo ocupa. Una estructura sin duplicidades evita que dos personas hagan lo mismo y que nadie sea responsable.</p>
    <div class="grid g4">
      <div class="card stat"><div class="label">Puestos completos</div><div class="value">${completos}/${puestos.length}</div><div class="note">Con propósito, funciones e indicadores</div></div>
      <div class="card stat"><div class="label">Funciones repetidas</div><div class="value">${T.duplicados.length}</div><div class="note">${T.duplicados.length ? "Pares de funciones entre puestos" : "Cada función tiene un solo dueño"}</div></div>
      <div class="card stat"><div class="label">Plazas ocupadas</div><div class="value">${ocup}/${plazas}</div><div class="note">${plazas - ocup > 0 ? `${plazas - ocup} vacantes` : "Sin vacantes"}</div></div>
      <div class="card stat"><div class="label">Tramo de control</div><div class="value">${jefes.length ? (puestos.length - 1 > 0 ? ((puestos.length - 1) / jefes.length).toFixed(1) : "—") : "—"}</div><div class="note">Subordinados directos por jefe (promedio)</div></div>
    </div>
    <div class="card" style="margin-top:18px"><div class="sh"><h3>Funciones repetidas</h3></div>
      ${T.duplicados.length ? T.duplicados.map(x => `<div class="dup">
        <div><b>${esc(x.puestoA)}</b><span>«${esc(x.funcionA)}»</span></div><div class="dup-eq" title="Similitud">${x.similitud}%</div><div><b>${esc(x.puestoB)}</b><span>«${esc(x.funcionB)}»</span></div>
        ${ed ? `<div class="toolbar"><button class="btn small" onclick="openEditPuesto(${x.a})">Editar ${esc(x.puestoA)}</button><button class="btn small" onclick="openEditPuesto(${x.b})">Editar ${esc(x.puestoB)}</button></div>` : ""}</div>`).join("")
        + '<p class="note" style="margin:10px 0 0">Sugerencia: deja la función en un solo puesto. Si es jefe y subordinado, el jefe normalmente <b>supervisa</b> y el subordinado <b>ejecuta</b>: redacta cada función con ese verbo.</p>'
        : '<div class="empty">No se encontraron funciones repetidas entre puestos.</div>'}</div>
    <div class="grid g2" style="margin-top:18px">
      <div class="card"><div class="sh"><h3>Puestos incompletos</h3></div>
        ${incompletos.length ? `<div class="tw"><table><thead><tr><th>Puesto</th><th>Le falta</th><th></th></tr></thead><tbody>${incompletos.map(p => `<tr><td><b>${esc(p.name)}</b><br><span class="note">${esc(p.dept)}</span></td><td>${faltaDe(p).map(f => `<span class="tag warn" style="margin:2px 4px 2px 0">${f}</span>`).join("")}</td><td>${ed ? `<button class="btn small" onclick="openEditPuesto(${p.id})">Completar</button>` : ""}</td></tr>`).join("")}</tbody></table></div>`
          : '<div class="empty">Todos los puestos tienen propósito, funciones e indicadores.</div>'}</div>
      <div class="card"><div class="sh"><h3>Niveles y tramo de control</h3></div>
        <div class="lvl-legend">${(N => N.nom.map((n, i) => `<span><i style="background:${N.col[i]}"></i>Nivel ${i + 1}${i === N.nom.length - 1 ? " o más" : ""} · ${n}</span>`).join(""))(nivelesOrg())}</div>
        ${tramo.length ? tramo.map(x => `<div class="li"><div><strong>${esc(x.p.name)}</strong><span class="s">${x.n > 8 ? `${x.n} subordinados directos: tramo amplio, considera un nivel de coordinación.` : "Solo 1 subordinado directo: revisa si este nivel es necesario o si puede absorber más equipo."}</span></div><span class="tag warn">${x.n}</span></div>`).join("")
          : '<p class="note">Ningún jefe tiene demasiados subordinados directos (más de 8) ni uno solo.</p>'}</div>
    </div>`;
  applyPerms();
}

/* ---------- desempeño ---------- */
const fD = { q: "", nivel: "", dept: "", bajas: false };

function filasDesempeno() {
  const lista = (fD.bajas ? T.colaboradores : activos()).filter(c => {
    const p = byId(c.puesto), d = perf(c.id);
    return (!fD.q || (c.nombre + " " + (p?.name || "")).toLowerCase().includes(fD.q.toLowerCase())) && (!fD.nivel || d.nivel === fD.nivel) && (!fD.dept || p?.dept === fD.dept);
  }).sort((a, b) => (perf(a.id).puntaje ?? 999) - (perf(b.id).puntaje ?? 999));
  $("dBody").innerHTML = lista.map(c => { const p = byId(c.puesto), d = perf(c.id); return `<tr class="${c.activo ? "" : "baja"}"><td><b>${esc(c.nombre)}</b>${c.activo ? "" : ' <span class="tag off">Baja</span>'}<br><span class="note">Ingreso: ${fechaTxt(c.ingreso)}</span></td>
    <td>${esc(p?.name || "—")}<br><span class="note">${esc(p?.dept || "")}</span></td><td>${esc(jefeDe(c.puesto)?.name || "—")}</td>
    <td>${nivelChip(d.nivel, d.puntaje)}${d.puntaje != null ? barra(d.puntaje) : ""}</td><td>${spark(d.tendencia)}</td><td>${cambioTxt(d.cambio)}</td>
    <td><button class="btn small" onclick="verPersona(${c.id})">Ver</button></td></tr>`; }).join("")
    || `<tr><td colspan="7" class="empty">${T.colaboradores.length ? "Nadie coincide con los filtros." : "Todavía no hay personas registradas. Agrégalas con “+ Persona” o al contratar un candidato."}</td></tr>`;
}

function renderDesempeno() {
  const cuenta = n => activos().filter(c => perf(c.id).nivel === n).length, total = activos().length || 1;
  const promedio = prom(activos().map(c => perf(c.id).puntaje).filter(x => x != null));
  $("desempeno").innerHTML = `<div class="sh"><h3>Desempeño del personal</h3>
      <div class="toolbar"><input class="input" placeholder="Buscar persona o puesto..." style="width:210px" value="${esc(fD.q)}" oninput="fD.q=this.value;filasDesempeno()">
        <select class="select" style="width:170px" onchange="fD.dept=this.value;renderDesempeno()"><option value="">Todos los departamentos</option>${depts().map(d => `<option${fD.dept === d ? " selected" : ""}>${esc(d)}</option>`).join("")}</select>
        <button class="btn" data-perm="editar:talento" onclick="abrirPersona()">+ Persona</button><button class="btn primary" data-perm="aprobar:talento" onclick="abrirEvaluacion()">Registrar evaluación</button></div></div>
    <p class="intro">La calificación (0 a 100) combina los <b>indicadores de estándar del puesto</b> (50%), la <b>evaluación de competencias</b> que hace el jefe (30%) y los <b>KPIs del área</b> a cargo del puesto (20%). Si falta una parte, su peso se reparte entre las demás. Haz clic en una persona para ver en qué está bajando y cómo mejorar.</p>
    <div class="lvl-cards">${NIV_ORDEN.map(n => `<button class="lvl-card ${fD.nivel === n ? "on" : ""}" style="--c:${NIV[n].c}" onclick="fD.nivel=fD.nivel==='${n}'?'':'${n}';renderDesempeno()"><b>${cuenta(n)}</b><span>${n}</span><small>${NIV[n].rango || "sin calificación"}</small></button>`).join("")}
      <div class="lvl-card prom"><b>${promedio ?? "—"}</b><span>Promedio</span><small>${mesTxt(T.periodoActual)}</small></div></div>
    <div class="dist">${NIV_ORDEN.map(n => `<i style="width:${(cuenta(n) / total) * 100}%;background:${NIV[n].c}" title="${n}: ${cuenta(n)}"></i>`).join("")}</div>
    <div class="card"><div class="tw"><table><thead><tr><th>Persona</th><th>Puesto</th><th>Jefe inmediato</th><th style="min-width:190px">Calificación</th><th>Tendencia</th><th>Cambio</th><th></th></tr></thead><tbody id="dBody"></tbody></table></div>
    <label class="note" style="display:inline-flex;gap:6px;margin-top:10px;cursor:pointer"><input type="checkbox" ${fD.bajas ? "checked" : ""} onchange="fD.bajas=this.checked;filasDesempeno()"> Mostrar personas dadas de baja</label></div>`;
  filasDesempeno();
  applyPerms();
}

function verPersona(id) {
  const c = colab(id);
  if (!c) return;
  const p = byId(c.puesto), d = perf(id), evs = evalsDe(id), ult = evs.at(-1), ant = evs.at(-2), jefe = jefeDe(c.puesto);
  const acs = T.acciones.filter(a => a.colaborador === id).slice().reverse();
  const antDe = new Map(ant ? [...ant.desglose.indicadores, ...ant.desglose.competencias].map(x => [x.nombre, x.cumplimiento]) : []);
  const vs = x => (antDe.get(x.nombre) == null || x.cumplimiento == null ? '<span class="note">—</span>' : cambioTxt(x.cumplimiento - antDe.get(x.nombre)));
  const ev = can("aprobar", "talento"), ed = can("editar", "talento");
  const g = ult?.desglose;
  $("tdTitle").textContent = c.nombre;
  $("tdBody").innerHTML = `<div class="persona-head" style="--c:${NIV[d.nivel].c}">
      <div><div class="note">${esc(p?.name || "Puesto eliminado")} · ${esc(p?.dept || "")}</div><div class="note">Jefe inmediato: ${esc(jefe?.name || "—")} · Ingreso: ${fechaTxt(c.ingreso)}</div>${c.activo ? "" : '<span class="tag off">Dada de baja</span>'}</div>
      <div class="big-score"><b>${d.puntaje ?? "—"}</b><span>${esc(d.nivel)}</span>${d.periodo ? `<small>${mesTxt(d.periodo)} ${d.cambio != null ? `· ${d.cambio > 0 ? "+" : ""}${d.cambio} vs. anterior` : ""}</small>` : ""}</div>
      <div>${spark(d.tendencia, 180, 54)}</div></div>
    ${g ? `<div class="details">
      <div class="d"><b>Cómo se calcula</b>${[["indicadores", "Indicadores del puesto", 50], ["competencias", "Competencias", 30], ["kpis", "KPIs del área", 20]].map(([k, n, w]) => `<div class="part"><span>${n} <small class="note">(${w}%)</small></span>${g.partes[k] != null ? barra(g.partes[k]) + `<b>${g.partes[k]}</b>` : '<span class="note">sin datos: su peso se reparte</span>'}</div>`).join("")}</div>
      ${g.indicadores.length ? `<div class="d"><b>Indicadores de estándar · ${mesTxt(ult.periodo)}</b><table class="mini wide"><thead><tr><th>Indicador</th><th>Meta</th><th>Resultado</th><th>Cumplimiento</th><th>vs. anterior</th></tr></thead><tbody>
        ${g.indicadores.map(x => `<tr><td>${esc(x.nombre)}</td><td>${x.sentido === "menor" ? "≤" : "≥"} ${fmt(x.meta, x.unidad)}</td><td>${x.valor == null ? "—" : fmt(x.valor, x.unidad)}</td><td>${x.cumplimiento == null ? "—" : barra(x.cumplimiento) + ` ${x.cumplimiento}%`}</td><td>${vs(x)}</td></tr>`).join("")}</tbody></table></div>` : ""}
      ${g.competencias.length ? `<div class="d"><b>Competencias (evaluación del jefe)</b><table class="mini wide"><thead><tr><th>Competencia</th><th>Nivel</th><th>vs. anterior</th></tr></thead><tbody>
        ${g.competencias.map(x => `<tr><td>${esc(x.nombre)}</td><td>${x.nivel ? `${barra(x.cumplimiento)} ${NIVEL_COMP[x.nivel]} (${x.nivel} de 4)` : "—"}</td><td>${vs(x)}</td></tr>`).join("")}</tbody></table></div>` : ""}
      ${g.kpis.length ? `<div class="d"><b>KPIs del área a cargo del puesto</b>${g.kpis.map(x => `<div class="part"><span>${esc(x.codigo)} ${esc(x.nombre)} <small class="note">meta ${x.sentido === "menor" ? "≤" : "≥"} ${fmt(x.meta, x.unidad)} · último ${fmt(x.valor, x.unidad)}</small></span>${x.cumplimiento != null ? barra(x.cumplimiento) + `<b>${x.cumplimiento}%</b>` : ""}</div>`).join("")}</div>` : ""}
      ${ult.comentario ? `<div class="d"><b>Comentario del evaluador</b>${esc(ult.comentario)} <span class="note">— ${esc(ult.evaluador)}</span></div>` : ""}
    </div>
    <div class="details grid g2" style="gap:12px;margin-top:4px">
      <div class="d bajando"><b>En qué está bajando</b>
        ${d.bajando.length ? `<ul class="ul">${d.bajando.map(x => `<li><b style="display:inline;color:var(--ink)">${esc(x.nombre)}</b>: de ${x.antes}% a ${x.ahora}% <span class="down">▼ ${-x.cambio}</span></li>`).join("")}</ul>` : '<p class="note" style="margin:0">Nada bajó respecto al periodo anterior.</p>'}
        ${d.debajo.length ? `<p class="note" style="margin:8px 0 4px"><b style="display:inline">Por debajo del estándar:</b></p><ul class="ul">${d.debajo.map(x => `<li>${esc(x.nombre)}: ${x.tipo === "indicador" ? `${fmt(x.valor, x.unidad)} contra meta ${fmt(x.meta, x.unidad)} (${x.cumplimiento}%)` : `nivel ${NIVEL_COMP[x.nivel]}`}</li>`).join("")}</ul>` : ""}</div>
      <div class="d mejora"><b>Cómo mejorar</b><ul class="ul">${d.recomendaciones.map(r => `<li>${esc(r)}</li>`).join("")}</ul>
        ${ev && (d.debajo.length || d.bajando.length) ? `<div class="toolbar" style="margin-top:8px"><button class="btn small primary" id="planBtn" onclick="planIA(${id})">✦ Plan de mejora con IA</button><span class="note" id="planMsg"></span></div><div id="planIA"></div>` : ""}</div>
    </div>` : `<div class="empty">Todavía no tiene evaluaciones.${ev && c.activo ? `<br><br><button class="btn primary" onclick="abrirEvaluacion(${id})">Registrar su primera evaluación</button>` : ""}</div>`}
    <div class="details" style="margin-top:12px"><div class="d"><b>Acciones de mejora</b>
      ${acs.length ? acs.map(a => `<div class="accion ${a.estado === "Cerrada" ? "cerrada" : ""}"><div><span class="tag ${a.estado === "Cerrada" ? "off" : ""}">${esc(a.tipo)}</span> ${a.ia ? '<span class="tag">✦ IA</span>' : ""} ${esc(a.descripcion)}
          <div class="note">Responsable: ${esc(a.responsable || "—")} · Fecha límite: ${fechaTxt(a.fechaLimite)} · Registró ${esc(a.creadoPor)} el ${fechaTxt(a.creado)}${a.estado === "Cerrada" ? ` · Cerrada el ${fechaTxt(a.cerradoEl)}` : ""}</div></div>
          ${ev && a.estado !== "Cerrada" ? `<button class="btn small" onclick="cerrarAccion(${a.id},${id})">Cerrar</button>` : ""}</div>`).join("") : '<p class="note" style="margin:0">Sin acciones registradas.</p>'}
      ${ev && c.activo ? `<div style="margin-top:8px"><button class="btn small" onclick="abrirAccion(${id})">+ Registrar acción</button></div>` : ""}</div>
    ${evs.length ? `<div class="d"><b>Historial de evaluaciones</b>${evs.slice().reverse().map(e => `<div class="hist-ev"><span>${mesTxt(e.periodo)}</span>${nivelChip(e.nivel, e.puntaje)}<span class="note">${esc(e.evaluador)}</span>${ev && c.activo ? `<button class="btn small" onclick="abrirEvaluacion(${id},'${e.periodo}')">Editar</button>` : ""}</div>`).join("")}</div>` : ""}</div>
    <div class="toolbar" style="margin-top:14px;justify-content:flex-end">
      ${ed ? (c.activo ? `<button class="btn danger" onclick="bajaPersona(${id})">Dar de baja</button>` : `<button class="btn" onclick="reactivarPersona(${id})">Reactivar</button>`) : ""}
      ${ed ? `<button class="btn" onclick="abrirPersona(${id})">Editar datos</button>` : ""}
      ${ev && c.activo ? `<button class="btn primary" onclick="abrirEvaluacion(${id})">Evaluar</button>` : ""}</div>`;
  openModal("tDetail");
}

// Plan de mejora con IA: se envían el puesto y los resultados, nunca el nombre de la persona.
async function planIA(id) {
  const c = colab(id), p = byId(c.puesto), d = perf(id), ult = evalsDe(id).at(-1);
  const btn = $("planBtn"), t0 = Date.now(), tick = () => ($("planMsg").textContent = `La IA está preparando el plan... ${Math.round((Date.now() - t0) / 1000)} s`);
  btn.disabled = true; tick(); const timer = setInterval(tick, 1000);
  try {
    const r = await api("/api/draft", {
      tipo: "mejora", puesto: p?.name || "", departamento: p?.dept || "", jefe: jefeDe(c.puesto)?.name || "", proposito: p?.obj || "", funciones: lineas(p?.resp),
      puntaje: d.puntaje, cambio: d.cambio, comentario: ult?.comentario || "",
      debajo: d.debajo.map(x => `${x.nombre} (${x.tipo}): ${x.tipo === "indicador" ? `${x.valor} contra meta ${x.meta} ${x.unidad}, ${x.cumplimiento}%` : `nivel ${x.nivel} de 4`}`).join("; "),
      bajando: d.bajando.map(x => `${x.nombre}: de ${x.antes}% a ${x.ahora}%`).join("; "),
    });
    window.__plan = { id, acciones: Array.isArray(r.acciones) ? r.acciones : [] };
    $("planIA").innerHTML = `<div class="ai-panel" style="margin-top:10px"><b>✦ Diagnóstico</b><p style="margin:4px 0 8px">${esc(r.diagnostico)}</p>
      ${window.__plan.acciones.map((a, i) => `<div class="li" style="background:#fff"><div><strong>${esc(a.accion)}</strong><span class="s">${esc(a.tipo)} · ${esc(a.responsable)} · ${Math.round(a.plazo_dias) || 15} días</span></div><button class="btn small" onclick="usarPlan(${i})">Registrar</button></div>`).join("")}
      <p class="note" style="margin:6px 0 0">Propuesta de la IA: revísala antes de registrarla. Una persona decide.</p></div>`;
    $("planMsg").textContent = "";
  } catch (e) {
    $("planMsg").innerHTML = `<span class="err-box">${esc(e.message)}</span>`;
  } finally {
    clearInterval(timer); btn.disabled = false;
  }
}
function usarPlan(i) {
  const { id, acciones } = window.__plan, a = acciones[i];
  abrirAccion(id, { tipo: a.tipo, descripcion: a.accion, responsable: a.responsable, fechaLimite: masDias(Math.max(1, Math.round(a.plazo_dias) || 15)), ia: true });
}

/* ---------- formularios (un solo modal) ---------- */
let tSave = null;
function abrirForm(titulo, html, guardar, textoBoton = "Guardar") {
  $("tfTitle").textContent = titulo; $("tfBody").innerHTML = html; $("tfSave").textContent = textoBoton; tSave = guardar;
  openModal("tForm");
}
async function guardarForm() {
  const btn = $("tfSave"), txt = btn.textContent;
  btn.disabled = true; btn.textContent = "Guardando...";
  try { if (await tSave() !== false) closeModal("tForm"); }
  catch (e) { toast(e.message); }
  finally { btn.disabled = false; btn.textContent = txt; }
}
const campo = (label, html, s2) => `<div class="field${s2 ? " s2" : ""}"><label>${label}</label>${html}</div>`;
const opts = (lista, sel) => lista.map(o => (Array.isArray(o) ? `<option value="${esc(o[0])}"${String(o[0]) === String(sel) ? " selected" : ""}>${esc(o[1])}</option>` : `<option${o === sel ? " selected" : ""}>${esc(o)}</option>`)).join("");
const val = id => $(id).value.trim();

function abrirPersona(id) {
  const c = id ? colab(id) : null;
  abrirForm(c ? `Editar: ${c.nombre}` : "Nueva persona", `<div class="fg">
      ${campo("Nombre completo *", `<input class="input" id="tpNombre" value="${esc(c?.nombre || "")}">`)}
      ${campo("Puesto *", `<select class="select" id="tpPuesto">${puestos.map(p => `<option value="${p.id}"${p.id === c?.puesto ? " selected" : ""}>${esc(p.name)} (${genteDe(p.id).length}/${p.plazas})</option>`).join("")}</select>`)}
      ${campo("Correo (opcional)", `<input class="input" id="tpEmail" type="email" value="${esc(c?.email || "")}">`)}
      ${campo("Fecha de ingreso", `<input class="input" id="tpIngreso" type="date" value="${esc(c?.ingreso || hoyISO())}">`)}</div>
    <p class="note" style="margin:10px 0 0">Entre paréntesis: plazas ocupadas / plazas del puesto. Las personas no son usuarios de la plataforma: son el personal que se evalúa.</p>`,
  () => talento({ mod: "colaboradores", op: c ? "update" : "create", id, datos: { nombre: val("tpNombre"), puesto: +$("tpPuesto").value, email: val("tpEmail"), ingreso: $("tpIngreso").value } }, c ? "Datos actualizados." : "Persona registrada.").then(() => { if (c && $("tDetail").classList.contains("open")) verPersona(id); }));
}
async function bajaPersona(id) {
  if (!confirm(`¿Dar de baja a ${colab(id).nombre}? Se conserva su historial y deja de contar en el desempeño y las plazas.`)) return;
  try { await talento({ mod: "colaboradores", op: "baja", id }, "Persona dada de baja."); closeModal("tDetail"); } catch (e) { toast(e.message); }
}
async function reactivarPersona(id) { try { await talento({ mod: "colaboradores", op: "reactivar", id }, "Persona reactivada."); verPersona(id); } catch (e) { toast(e.message); } }

// Evaluación de un mes: resultados de los indicadores del puesto y nivel de cada competencia.
function abrirEvaluacion(id, periodo) {
  const lista = activos();
  if (!lista.length) { toast("Primero registra a las personas que ocupan los puestos."); return; }
  const cid = id || lista[0].id;
  abrirForm("Evaluación de desempeño", `<div class="fg">
      ${campo("Persona *", `<select class="select" id="teColab" onchange="camposEvaluacion()">${lista.map(c => `<option value="${c.id}"${c.id === cid ? " selected" : ""}>${esc(c.nombre)} · ${esc(byId(c.puesto)?.name || "")}</option>`).join("")}</select>`)}
      ${campo("Periodo (mes) *", `<input class="input" id="tePeriodo" type="month" max="${hoyISO().slice(0, 7)}" value="${esc(periodo || T.periodoActual)}" onchange="camposEvaluacion()">`)}</div>
    <div id="teCampos"></div>`, guardarEvaluacion, "Guardar evaluación");
  camposEvaluacion();
}
function camposEvaluacion() {
  const c = colab(+$("teColab").value), p = byId(c.puesto), per = $("tePeriodo").value;
  const previa = T.evaluaciones.find(e => e.colaborador === c.id && e.periodo === per);
  const ind = p?.indicadores || [], comp = p?.comp || [];
  $("teCampos").innerHTML = `${previa ? `<p class="perm-note" style="margin-top:12px">Ya existe la evaluación de ${mesTxt(per)} (${previa.puntaje} puntos). Al guardar se actualiza.</p>` : ""}
    <h4 class="sub-h">Indicadores de estándar del puesto</h4>
    ${ind.length ? `<div class="fg">${ind.map((i, n) => campo(`${esc(i.nombre)} <span class="note">(meta ${i.sentido === "menor" ? "≤" : "≥"} ${esc(i.meta)} ${esc(i.unidad)})</span>`, `<input class="input" type="number" step="any" id="teI${n}" value="${previa?.resultados[i.nombre] ?? ""}" placeholder="Resultado del mes">`)).join("")}</div>`
      : `<p class="note">El puesto no tiene indicadores de estándar. ${can("editar", "puestos") ? `<a href="#" onclick="closeModal('tForm');openEditPuesto(${p?.id});return false">Agrégalos al puesto</a>` : "Pide a RH que los agregue al puesto"} para medirlo con resultados.</p>`}
    <h4 class="sub-h">Competencias del puesto (evaluación del jefe)</h4>
    ${comp.length ? `<div class="fg">${comp.map((k, n) => campo(esc(k), `<select class="select" id="teC${n}"><option value="">Sin evaluar</option>${opts([1, 2, 3, 4].map(x => [x, `${x} · ${NIVEL_COMP[x]}`]), previa?.competencias[k] ?? "")}</select>`)).join("")}</div>`
      : '<p class="note">El puesto no tiene competencias registradas.</p>'}
    ${campo("Comentario del evaluador", `<textarea class="textarea" id="teComent" style="min-height:60px" placeholder="Hechos concretos del periodo...">${esc(previa?.comentario || "")}</textarea>`, 1)}
    <p class="note" style="margin:10px 0 0">El servidor calcula la calificación con los pesos 50% indicadores, 30% competencias y 20% KPIs del área.</p>`;
}
async function guardarEvaluacion() {
  const c = colab(+$("teColab").value), p = byId(c.puesto);
  const resultados = {}, competencias = {};
  (p?.indicadores || []).forEach((i, n) => { const v = $("teI" + n).value; if (v !== "") resultados[i.nombre] = +v; });
  (p?.comp || []).forEach((k, n) => { const v = $("teC" + n).value; if (v) competencias[k] = +v; });
  await talento({ mod: "evaluaciones", op: "guardar", datos: { colaborador: c.id, periodo: $("tePeriodo").value, resultados, competencias, comentario: val("teComent") } });
  if ($("tDetail").classList.contains("open")) verPersona(c.id);
}

function abrirAccion(id, pre = {}) {
  const c = colab(id), jefe = jefeDe(c.puesto);
  abrirForm(`Acción de mejora: ${c.nombre}`, `<div class="fg">
      ${campo("Tipo *", `<select class="select" id="taTipo">${opts(["Retroalimentación", "Plan de mejora", "Capacitación", "Seguimiento semanal", "Cambio de funciones", "Reconocimiento"], pre.tipo || "Retroalimentación")}</select>`)}
      ${campo("Fecha límite", `<input class="input" type="date" id="taFecha" value="${esc(pre.fechaLimite || masDias(14))}">`)}
      ${campo("Qué se va a hacer *", `<textarea class="textarea" id="taDesc" style="min-height:80px">${esc(pre.descripcion || "")}</textarea>`, 1)}
      ${campo("Responsable", `<input class="input" id="taResp" value="${esc(pre.responsable || jefe?.name || "")}">`, 1)}</div>
    <p class="note" style="margin:10px 0 0">Registrar una acción marca como atendida la alerta de esta persona.</p>`,
  async () => { await talento({ mod: "acciones", op: "create", datos: { colaborador: id, tipo: $("taTipo").value, descripcion: val("taDesc"), responsable: val("taResp"), fechaLimite: $("taFecha").value, ia: !!pre.ia } }); if ($("tDetail").classList.contains("open")) verPersona(id); }, "Registrar acción");
}
async function cerrarAccion(aid, id) { try { await talento({ mod: "acciones", op: "cerrar", id: aid }); verPersona(id); } catch (e) { toast(e.message); } }

/* ---------- alertas ---------- */
let verAtendidas = false;
const PRIO = { Alta: "baj", Media: "rie", Baja: "sin" };
const alertasAbiertas = () => T.alertas.filter(a => !a.atendida && a.prioridad !== "Baja");

function renderAlertas() {
  const lista = T.alertas.filter(a => verAtendidas || !a.atendida);
  const n = p => T.alertas.filter(a => a.prioridad === p && !a.atendida).length;
  const ev = can("aprobar", "talento");
  $("alertas").innerHTML = `<div class="sh"><h3>Alertas de acción inmediata</h3>
      <label class="note" style="display:inline-flex;gap:6px;cursor:pointer"><input type="checkbox" ${verAtendidas ? "checked" : ""} onchange="verAtendidas=this.checked;renderAlertas()"> Mostrar las ya atendidas</label></div>
    <p class="intro">Se generan solas con cada evaluación: <b>Alta</b> si la calificación es menor a 60 o cayó 15 puntos o más; <b>Media</b> si cayó 10 puntos, lleva dos periodos en riesgo o tiene un indicador por debajo del 70% de su estándar; <b>Baja</b> si le falta la evaluación del último mes. Una alerta queda atendida cuando se registra una acción de mejora.</p>
    <div class="chips-row">${["Alta", "Media", "Baja"].map(p => `<span class="lvl ${PRIO[p]}">${p}: ${n(p)} sin atender</span>`).join("")}</div>
    ${lista.length ? lista.map(a => `<div class="alerta ${PRIO[a.prioridad]} ${a.atendida ? "ok" : ""}">
      <div class="al-prio"><span class="lvl ${PRIO[a.prioridad]}">${a.prioridad}</span>${a.atendida ? '<span class="tag">✓ Atendida</span>' : ""}</div>
      <div class="al-body"><b>${esc(a.nombre)}</b> <span class="note">· ${esc(a.puesto)}${a.jefe ? ` · jefe: ${esc(a.jefe)}` : ""}${a.periodo ? ` · ${mesTxt(a.periodo)}` : ""}</span>
        <div>${esc(a.motivo)}</div><div class="note"><b style="display:inline">Acción sugerida:</b> ${esc(a.accion)}</div></div>
      <div class="toolbar al-act"><button class="btn small" onclick="verPersona(${a.colaborador})">Ver persona</button>
        ${ev && !a.atendida ? (a.tipo === "sin-evaluar" ? `<button class="btn small primary" onclick="abrirEvaluacion(${a.colaborador})">Evaluar</button>` : `<button class="btn small primary" onclick="abrirAccion(${a.colaborador})">Registrar acción</button>`) : ""}</div></div>`).join("")
      : '<div class="card empty">No hay alertas pendientes. 👍</div>'}`;
}

/* ---------- contratación ---------- */
let fC = { puesto: "" };
const vacantes = () => puestos.map(p => ({ p, n: p.plazas - genteDe(p.id).length })).filter(x => x.n > 0);

function renderContratacion() {
  const ed = can("editar", "contratacion");
  const lista = T.candidatos.filter(c => !fC.puesto || c.puesto === +fC.puesto).sort((a, b) => (b.puntaje ?? -1) - (a.puntaje ?? -1));
  $("contratacion").innerHTML = `<div class="sh"><h3>Contratación</h3><div class="toolbar">
      <select class="select" style="width:220px" onchange="fC.puesto=this.value;renderContratacion()"><option value="">Todos los puestos</option>${puestos.filter(p => T.candidatos.some(c => c.puesto === p.id) || vacantes().some(v => v.p.id === p.id)).map(p => `<option value="${p.id}"${String(p.id) === String(fC.puesto) ? " selected" : ""}>${esc(p.name)}</option>`).join("")}</select>
      <button class="btn primary" data-perm="editar:contratacion" onclick="abrirCandidato()">+ Evaluar candidato</button></div></div>
    <p class="intro">Formulario de decisión: cada candidato se compara contra el perfil del puesto. Puntaje = perfil (escolaridad y experiencia) 25% + competencias del puesto 35% + prueba técnica 20% + entrevista 10% + referencias 10%. <b>80 o más:</b> contratar · <b>65 a 79:</b> segunda entrevista · <b>menos de 65</b>, sin la escolaridad del perfil o con referencias negativas: no recomendable. La decisión final la toma una persona; si se aparta de la recomendación, debe justificarse.</p>
    <div class="vac-row">${vacantes().map(({ p, n }) => { const cs = T.candidatos.filter(c => c.puesto === p.id && c.decision !== "Descartado"); const mejor = cs.slice().sort((a, b) => (b.puntaje ?? -1) - (a.puntaje ?? -1))[0];
      return `<div class="card vac"><div class="note">${esc(p.dept)}</div><b>${esc(p.name)}</b><div><span class="tag warn">${n} vacante${n > 1 ? "s" : ""}</span> <span class="tag">${cs.length} candidato${cs.length === 1 ? "" : "s"}</span></div>
        ${mejor ? `<div class="note">Mejor evaluado: ${esc(mejor.nombre)} (${mejor.puntaje ?? "—"})</div>` : '<div class="note">Sin candidatos todavía.</div>'}
        <div class="toolbar"><button class="btn small" onclick="fC.puesto='${p.id}';renderContratacion()">Ver candidatos</button>${ed ? `<button class="btn small primary" onclick="abrirCandidato(null,${p.id})">Evaluar candidato</button>` : ""}</div></div>`; }).join("") || '<p class="note">No hay vacantes: todas las plazas de los puestos están ocupadas. Para abrir una, aumenta las plazas del puesto.</p>'}</div>
    <div class="card"><div class="tw"><table><thead><tr><th>#</th><th>Candidato</th><th>Puesto</th><th style="min-width:170px">Puntaje</th><th>Recomendación</th><th>Decisión</th><th>Evaluó</th><th></th></tr></thead><tbody>
      ${lista.map((c, i) => `<tr><td>${i + 1}</td><td><b>${esc(c.nombre)}</b><br><span class="note">${esc(c.fuente || "")}</span></td><td>${esc(byId(c.puesto)?.name || "—")}</td>
        <td>${c.puntaje != null ? `<b>${c.puntaje}</b> ${barra(c.puntaje, NIV[nivelDe(c.puntaje)].c)}` : "—"}</td><td><span class="lvl ${REC_CLS[c.recomendacion] || "sin"}">${esc(c.recomendacion)}</span></td>
        <td><span class="tag ${DEC_CLS[c.decision] ?? ""}">${esc(c.decision)}</span></td><td>${esc(c.evaluador)}</td><td><button class="btn small" onclick="verCandidato(${c.id})">Ver</button></td></tr>`).join("")
        || '<tr><td colspan="8" class="empty">No hay candidatos registrados.</td></tr>'}
    </tbody></table></div></div>`;
  applyPerms();
}

const PARTES_CAND = [["perfil", "Perfil (escolaridad y experiencia)", 25], ["competencias", "Competencias del puesto", 35], ["prueba", "Prueba técnica", 20], ["entrevista", "Entrevista", 10], ["referencias", "Referencias", 10]];

function verCandidato(id) {
  const c = T.candidatos.find(x => x.id === id);
  if (!c) return;
  const p = byId(c.puesto), rivales = T.candidatos.filter(x => x.puesto === c.puesto).sort((a, b) => (b.puntaje ?? -1) - (a.puntaje ?? -1));
  const ed = can("editar", "contratacion") && c.decision !== "Contratado";
  $("tdTitle").textContent = c.nombre;
  $("tdBody").innerHTML = `<div class="persona-head" style="--c:${NIV[nivelDe(c.puntaje)].c}">
      <div><div class="note">Candidato a ${esc(p?.name || "puesto eliminado")} · ${esc(p?.dept || "")}</div><div class="note">Fuente: ${esc(c.fuente || "—")} · Entrevista: ${fechaTxt(c.fechaEntrevista)} · Evaluó: ${esc(c.evaluador)}</div>
        <div style="margin-top:6px"><span class="tag ${DEC_CLS[c.decision] ?? ""}">${esc(c.decision)}</span> <span class="note">Lugar ${rivales.indexOf(c) + 1} de ${rivales.length} para este puesto</span></div></div>
      <div class="big-score"><b>${c.puntaje ?? "—"}</b><span class="lvl ${REC_CLS[c.recomendacion] || "sin"}">${esc(c.recomendacion)}</span></div></div>
    ${c.filtros?.length ? `<div class="perm-note err-box" style="margin-top:12px">${c.filtros.map(esc).join(" ")}</div>` : ""}
    <div class="details" style="margin-top:12px">
      <div class="d"><b>Desglose del puntaje</b>${PARTES_CAND.map(([k, n, w]) => `<div class="part"><span>${n} <small class="note">(${w}%)</small></span>${c.partes?.[k] != null ? barra(c.partes[k]) + `<b>${c.partes[k]}</b>` : '<span class="note">sin dato</span>'}</div>`).join("")}</div>
      <div class="grid g2" style="gap:10px">
        <div class="d" style="margin:0"><b>Requisitos del perfil</b>Escolaridad: ${esc(c.escolaridad)}<br>Experiencia: ${esc(c.experiencia)}<br>Referencias: ${esc(c.referencias)}</div>
        <div class="d" style="margin:0"><b>Condiciones</b>Disponibilidad: ${esc(c.disponibilidad)}<br>Expectativa económica: ${esc(c.salario)}<br>Prueba técnica: ${c.prueba === "" || c.prueba == null ? "—" : esc(c.prueba) + "/100"} · Entrevista: ${c.entrevista ? `${esc(c.entrevista)}/4` : "—"}</div></div>
      <div class="d" style="margin-top:10px"><b>Competencias del puesto</b>${(p?.comp || []).map(k => `<div class="part"><span>${esc(k)}</span>${c.competencias?.[k] ? barra(c.competencias[k] * 25) + `<b>${NIVEL_COMP[c.competencias[k]]}</b>` : '<span class="note">sin evaluar</span>'}</div>`).join("") || '<span class="note">El puesto no tiene competencias registradas.</span>'}</div>
      <div class="grid g2" style="gap:10px"><div class="d" style="margin:0"><b>Fortalezas</b>${esc(c.fortalezas) || "<em>Sin registrar.</em>"}</div><div class="d" style="margin:0"><b>Riesgos</b>${esc(c.riesgos) || "<em>Sin registrar.</em>"}</div></div>
      ${c.justificacion ? `<div class="d" style="margin-top:10px"><b>Justificación de la decisión</b>${esc(c.justificacion)}</div>` : ""}
      ${rivales.length > 1 ? `<div class="d" style="margin-top:10px"><b>Comparación con los demás candidatos</b>${rivales.map(r => `<div class="part${r.id === c.id ? " yo" : ""}"><span>${esc(r.nombre)} <small class="note">${esc(r.decision)}</small></span>${r.puntaje != null ? barra(r.puntaje, NIV[nivelDe(r.puntaje)].c) + `<b>${r.puntaje}</b>` : ""}</div>`).join("")}</div>` : ""}
    </div>
    <div class="toolbar" style="margin-top:14px;justify-content:flex-end">
      ${ed ? `<button class="btn danger" onclick="borrarCandidato(${id})">Eliminar</button><button class="btn primary" onclick="abrirCandidato(${id})">Editar o decidir</button>`
        : c.decision === "Contratado" ? '<span class="note">Contratado: ya aparece en Desempeño.</span>'
        : can("aprobar", "contratacion") ? `<button class="btn primary" onclick="abrirDecision(${id})">Decidir</button>` : '<span class="note">Tu rol solo puede consultar.</span>'}</div>`;
  openModal("tDetail");
}

// Para quien toma la decisión sin evaluar (Dirección): solo decisión y justificación.
function abrirDecision(id) {
  const c = T.candidatos.find(x => x.id === id);
  abrirForm(`Decisión: ${c.nombre}`, `<p class="note" style="margin:0 0 10px">Puntaje ${c.puntaje ?? "—"} · recomendación: <span class="lvl ${REC_CLS[c.recomendacion] || "sin"}">${esc(c.recomendacion)}</span></p><div class="fg">
      ${campo("Decisión", `<select class="select" id="tdDec">${opts(["En evaluación", "Contratado", "En espera", "Descartado"], c.decision)}</select>`)}
      ${campo("Justificación <span class='note'>(obligatoria si se aparta de la recomendación)</span>", `<textarea class="textarea" id="tdJust" style="min-height:70px">${esc(c.justificacion)}</textarea>`)}</div>`,
  async () => { await talento({ mod: "candidatos", op: "update", id, datos: { decision: $("tdDec").value, justificacion: val("tdJust") } }); verCandidato(id); }, "Guardar decisión");
}

// Formulario concreto de evaluación del candidato contra el perfil del puesto, con puntaje en vivo.
function abrirCandidato(id, puestoId) {
  const c = id ? T.candidatos.find(x => x.id === id) : null;
  const pid = c?.puesto || puestoId || vacantes()[0]?.p.id || puestos[0]?.id;
  if (!pid) { toast("Primero crea los puestos de la empresa."); return; }
  const S = ["Cumple", "Cumple parcialmente", "No cumple"];
  abrirForm(c ? `Candidato: ${c.nombre}` : "Evaluar candidato", `
    <div class="cand-score" id="tcScore"></div>
    <h4 class="sub-h">1. Datos del candidato</h4><div class="fg">
      ${campo("Puesto *", `<select class="select" id="tcPuesto" onchange="perfilCandidato()" ${c ? "disabled" : ""}>${puestos.map(p => `<option value="${p.id}"${p.id === pid ? " selected" : ""}>${esc(p.name)}${p.plazas - genteDe(p.id).length > 0 ? " · vacante" : ""}</option>`).join("")}</select>`)}
      ${campo("Nombre completo *", `<input class="input" id="tcNombre" value="${esc(c?.nombre || "")}">`)}
      ${campo("Fuente", `<select class="select" id="tcFuente">${opts(["Bolsa de trabajo", "Referido", "Interno", "Agencia", "Redes sociales", "Otro"], c?.fuente || "Bolsa de trabajo")}</select>`)}
      ${campo("Fecha de entrevista", `<input class="input" type="date" id="tcFecha" value="${esc(c?.fechaEntrevista || hoyISO())}">`)}</div>
    <div id="tcPerfil"></div>
    <h4 class="sub-h">2. Requisitos del perfil</h4><div class="fg">
      ${campo("Escolaridad *", `<select class="select tc" id="tcEsc"><option value="">Elige...</option>${opts(S, c?.escolaridad)}</select>`)}
      ${campo("Experiencia relacionada *", `<select class="select tc" id="tcExp"><option value="">Elige...</option>${opts(S, c?.experiencia)}</select>`)}</div>
    <h4 class="sub-h">3. Competencias del puesto <span class="note">(1 Básico a 4 Experto)</span></h4><div class="fg" id="tcComp"></div>
    <h4 class="sub-h">4. Pruebas y referencias</h4><div class="fg">
      ${campo("Prueba técnica (0 a 100)", `<input class="input tc" type="number" min="0" max="100" id="tcPrueba" value="${esc(c?.prueba ?? "")}">`)}
      ${campo("Entrevista", `<select class="select tc" id="tcEnt"><option value="">Sin calificar</option>${opts([1, 2, 3, 4].map(x => [x, `${x} · ${["", "Deficiente", "Regular", "Buena", "Excelente"][x]}`]), c?.entrevista ?? "")}</select>`)}
      ${campo("Referencias laborales", `<select class="select tc" id="tcRef">${opts(["Positivas", "Sin verificar", "Negativas"], c?.referencias || "Sin verificar")}</select>`)}
      ${campo("Disponibilidad", `<select class="select" id="tcDisp">${opts(["Inmediata", "En 15 días o menos", "Más de 15 días"], c?.disponibilidad || "Inmediata")}</select>`)}
      ${campo("Expectativa económica", `<select class="select" id="tcSal">${opts(["Dentro del presupuesto", "Negociable", "Fuera del presupuesto"], c?.salario || "Dentro del presupuesto")}</select>`)}</div>
    <h4 class="sub-h">5. Observaciones</h4><div class="fg">
      ${campo("Fortalezas", `<textarea class="textarea" id="tcFort" style="min-height:60px">${esc(c?.fortalezas || "")}</textarea>`)}
      ${campo("Riesgos", `<textarea class="textarea" id="tcRiesgo" style="min-height:60px">${esc(c?.riesgos || "")}</textarea>`)}</div>
    <h4 class="sub-h">6. Decisión</h4><div class="fg">
      ${campo("Decisión", `<select class="select" id="tcDec" ${can("aprobar", "contratacion") ? "" : "disabled"}>${opts(["En evaluación", "Contratado", "En espera", "Descartado"], c?.decision || "En evaluación")}</select>`)}
      ${campo("Justificación <span class='note'>(obligatoria si la decisión se aparta de la recomendación)</span>", `<textarea class="textarea" id="tcJust" style="min-height:60px">${esc(c?.justificacion || "")}</textarea>`)}</div>
    ${can("aprobar", "contratacion") ? '<p class="note" style="margin:10px 0 0">Si eliges "Contratado", la persona se da de alta automáticamente en el puesto.</p>' : '<p class="perm-note" style="margin-top:10px">Tu rol registra y evalúa candidatos; la decisión final la toman Administrador, Recursos Humanos o Dirección.</p>'}`,
  async () => {
    await talento({ mod: "candidatos", op: c ? "update" : "create", id, datos: datosCandidato() });
    if (c) verCandidato(id);
  }, c ? "Guardar" : "Guardar evaluación");
  perfilCandidato(c);
  $("tfBody").oninput = $("tfBody").onchange = e => { if (e.target.closest(".tc")) calcularCandidato(); };
}
function perfilCandidato(c) {
  const p = byId(+$("tcPuesto").value);
  $("tcPerfil").innerHTML = p ? `<div class="perfil-box"><b>Perfil del puesto</b>${p.obj ? `<div>${esc(p.obj)}</div>` : ""}<div class="note">${esc(p.perfil || "Sin perfil académico registrado.")}</div></div>` : "";
  $("tcComp").innerHTML = (p?.comp || []).map((k, n) => campo(esc(k), `<select class="select tc" id="tcC${n}"><option value="">Sin evaluar</option>${opts([1, 2, 3, 4].map(x => [x, `${x} · ${NIVEL_COMP[x]}`]), c?.competencias?.[k] ?? "")}</select>`)).join("") || '<p class="note">El puesto no tiene competencias registradas; esa parte no cuenta en el puntaje.</p>';
  calcularCandidato();
}
function datosCandidato() {
  const p = byId(+$("tcPuesto").value), competencias = {};
  (p?.comp || []).forEach((k, n) => { const v = $("tcC" + n)?.value; if (v) competencias[k] = +v; });
  return {
    puesto: p?.id, nombre: val("tcNombre"), fuente: $("tcFuente").value, fechaEntrevista: $("tcFecha").value, escolaridad: $("tcEsc").value, experiencia: $("tcExp").value, competencias,
    prueba: $("tcPrueba").value === "" ? "" : +$("tcPrueba").value, entrevista: $("tcEnt").value === "" ? "" : +$("tcEnt").value, referencias: $("tcRef").value,
    disponibilidad: $("tcDisp").value, salario: $("tcSal").value, fortalezas: val("tcFort"), riesgos: val("tcRiesgo"), decision: $("tcDec").value, justificacion: val("tcJust"),
  };
}
// El puntaje lo calcula el servidor (misma fórmula que al guardar); se pide con una pequeña espera mientras se escribe.
let calcT = null;
function calcularCandidato() {
  clearTimeout(calcT);
  calcT = setTimeout(async () => {
    try {
      const { calculo: r } = await api("/api/talento", { mod: "candidatos", op: "calcular", datos: datosCandidato() });
      $("tcScore").innerHTML = `<div class="big-score inline" style="--c:${NIV[nivelDe(r.puntaje)].c}"><b>${r.puntaje ?? "—"}</b><span class="lvl ${REC_CLS[r.recomendacion] || "sin"}">${esc(r.recomendacion)}</span></div>
        <div class="note">${PARTES_CAND.map(([k, n]) => `${n.split(" (")[0]}: ${r.partes[k] ?? "—"}`).join(" · ")}</div>${r.filtros.length ? `<div class="err-box note">${r.filtros.map(esc).join(" ")}</div>` : ""}`;
    } catch { /* sin puntaje en vivo; se calcula al guardar */ }
  }, 350);
}
async function borrarCandidato(id) {
  if (!confirm("¿Eliminar este candidato y su evaluación?")) return;
  try { await talento({ mod: "candidatos", op: "delete", id }, "Candidato eliminado."); closeModal("tDetail"); } catch (e) { toast(e.message); }
}

/* ---------- valor para la empresa: índice de salud y reporte ejecutivo ---------- */
function salud() {
  const n = puestos.length || 1, act = activos();
  const enDup = new Set(T.duplicados.flatMap(d => [d.a, d.b]));
  const graves = T.alertas.filter(a => a.prioridad !== "Baja");
  const comps = [
    ["Estructura completa", Math.round((puestos.filter(p => !faltaDe(p).length).length / n) * 100), "Puestos con propósito, funciones e indicadores", "estructura"],
    ["Descripciones aprobadas", Math.round((puestos.filter(p => p.status === "Completa").length / n) * 100), "Revisadas y aprobadas por una persona", "puestos"],
    ["Funciones sin duplicar", Math.round((1 - enDup.size / n) * 100), "Puestos sin funciones repetidas", "estructura"],
    // Sin personal registrado estas partes no aplican (null): no cuentan en el índice.
    ["Personas evaluadas", act.length ? Math.round((act.filter(c => perf(c.id).periodo === T.periodoActual).length / act.length) * 100) : null, `Con evaluación de ${mesTxt(T.periodoActual)}`, "desempeno"],
    ["Desempeño promedio", prom(act.map(c => perf(c.id).puntaje).filter(x => x != null)), "Calificación promedio del personal", "desempeno"],
    ["Alertas atendidas", graves.length ? Math.round((graves.filter(a => a.atendida).length / graves.length) * 100) : act.length ? 100 : null, "Alertas altas y medias con acción registrada", "alertas"],
  ];
  return { indice: prom(comps.map(c => c[1]).filter(v => v != null)), comps };
}
const saludTxt = v => (v >= 85 ? "Sólida" : v >= 70 ? "En buen camino" : v >= 50 ? "Necesita atención" : "Crítica");

function pintarValor() {
  if (!$("valorBox") || !usuario || usuario.permisos?.super) return;
  const { indice, comps } = salud(), al = alertasAbiertas(), vac = vacantes().reduce((s, v) => s + v.n, 0);
  const riesgo = activos().filter(c => ["En riesgo", "Bajo desempeño"].includes(perf(c.id).nivel)).length;
  $("valorBox").innerHTML = `<div class="card valor"><div class="sh"><h3>Valor para tu empresa</h3><button class="btn primary" onclick="verReporte()">📄 Reporte ejecutivo</button></div>
    <div class="valor-grid">
      <div class="ring" style="--v:${indice};--c:${NIV[nivelDe(indice)].c}"><div><b>${indice}</b><span>Salud organizacional</span><small>${saludTxt(indice)}</small></div></div>
      <div class="comps">${comps.map(([n, v, d, page]) => `<button class="part comp-btn" onclick="go('${page}')" title="${esc(d)}"><span>${n}</span>${v == null ? '<span class="note">sin datos</span>' : `${barra(v)}<b>${v}%</b>`}</button>`).join("")}</div>
      <div class="tiles">
        <button class="tile ${al.length ? "hot" : ""}" onclick="go('alertas')"><b>${al.length}</b><span>Alertas por atender</span></button>
        <button class="tile" onclick="fD.nivel='';go('desempeno')"><b>${riesgo}</b><span>Personas en riesgo o bajo desempeño</span></button>
        <button class="tile" onclick="go('contratacion')"><b>${vac}</b><span>Vacantes · ${T.candidatos.filter(c => c.decision === "En evaluación").length} candidatos en proceso</span></button>
        <button class="tile" onclick="go('estructura')"><b>${T.duplicados.length}</b><span>Funciones repetidas</span></button></div>
    </div>
    <div class="confianza">🔒 Cada empresa ve solo su información · 🧾 Historial de cambios y aprobaciones · ✦ La IA propone, una persona decide · 👥 Permisos por rol</div></div>`;
}

function verReporte() {
  const { indice, comps } = salud(), act = activos(), emp = usuario?.empresa?.nombre || "la empresa";
  const cuenta = n => act.filter(c => perf(c.id).nivel === n).length;
  const tabla = (cab, filas) => `<table class="rep-t"><thead><tr>${cab.map(c => `<th>${c}</th>`).join("")}</tr></thead><tbody>${filas.join("") || `<tr><td colspan="${cab.length}">Sin registros.</td></tr>`}</tbody></table>`;
  $("repBody").innerHTML = `<div id="repPrint">
    <div class="rep-head"><div><h2>Reporte ejecutivo de desarrollo organizacional</h2><p>${esc(emp)} · ${new Date().toLocaleDateString("es-MX", { day: "numeric", month: "long", year: "numeric" })} · Periodo evaluado: ${mesTxt(T.periodoActual)}</p></div>
      <div class="rep-idx" style="--c:${NIV[nivelDe(indice)].c}"><b>${indice}</b><span>Salud organizacional<br>${saludTxt(indice)}</span></div></div>
    <h3>1. Indicadores de salud</h3>${tabla(["Componente", "Resultado", "Qué mide"], comps.map(([n, v, d]) => `<tr><td>${n}</td><td><b>${v == null ? "Sin datos" : v + "%"}</b></td><td>${esc(d)}</td></tr>`))}
    <h3>2. Desempeño del personal (${act.length} personas)</h3>${tabla(["Nivel", "Personas", "Rango"], NIV_ORDEN.map(n => `<tr><td><span class="lvl ${NIV[n].cls}">${n}</span></td><td>${cuenta(n)}</td><td>${NIV[n].rango || "—"}</td></tr>`))}
    <h3>3. Alertas de acción inmediata</h3>${tabla(["Prioridad", "Persona", "Puesto", "Motivo", "Estado"], T.alertas.filter(a => a.prioridad !== "Baja").map(a => `<tr><td>${a.prioridad}</td><td>${esc(a.nombre)}</td><td>${esc(a.puesto)}</td><td>${esc(a.motivo)}</td><td>${a.atendida ? "Atendida" : "Pendiente"}</td></tr>`))}
    <h3>4. Estructura</h3>${tabla(["Puesto", "Propósito", "Indicadores", "Plazas", "Estado"], puestos.map(p => `<tr><td>${esc(p.name)}</td><td>${esc(p.obj) || "—"}</td><td>${(p.indicadores || []).map(i => esc(i.nombre)).join(", ") || "—"}</td><td>${genteDe(p.id).length}/${p.plazas}</td><td>${esc(p.status)}</td></tr>`))}
    ${T.duplicados.length ? `<p><b>Funciones repetidas:</b> ${T.duplicados.map(d => `${esc(d.puestoA)} y ${esc(d.puestoB)} («${esc(d.funcionA)}»)`).join("; ")}.</p>` : "<p>Sin funciones repetidas entre puestos.</p>"}
    <h3>5. Contratación</h3>${tabla(["Candidato", "Puesto", "Puntaje", "Recomendación", "Decisión"], T.candidatos.slice().sort((a, b) => (b.puntaje ?? -1) - (a.puntaje ?? -1)).map(c => `<tr><td>${esc(c.nombre)}</td><td>${esc(byId(c.puesto)?.name || "")}</td><td>${c.puntaje ?? "—"}</td><td>${esc(c.recomendacion)}</td><td>${esc(c.decision)}</td></tr>`))}
    <p class="rep-foot">Generado por la Plataforma de Desarrollo Organizacional IA · IOT Technologies. Prototipo alineado a la estructura documental de ISO 9001; no es un sistema certificado. Las calificaciones se calculan con los indicadores de estándar de cada puesto, la evaluación de competencias y los KPIs del área.</p></div>`;
  openModal("repModal");
}
function imprimirReporte() { document.body.classList.add("imprimiendo"); window.print(); setTimeout(() => document.body.classList.remove("imprimiendo"), 500); }

/* ---------- refresco, navegación, dashboard y chat ---------- */
const PAGINAS_T = { estructura: renderEstructura, desempeno: renderDesempeno, alertas: renderAlertas, contratacion: renderContratacion };
function refrescarTalento() {
  const al = alertasAbiertas().length;
  $("badgeAlertas").hidden = !al; $("badgeAlertas").textContent = al;
  $("badgeEstructura").hidden = !T.duplicados.length; $("badgeEstructura").textContent = T.duplicados.length;
  for (const k in PAGINAS_T) if ($(k).classList.contains("active")) PAGINAS_T[k]();
  if ($("organigrama").classList.contains("active")) renderOrg();
  updateStats();
}
go = (orig => page => { orig(page); PAGINAS_T[page]?.(); })(go);
updateStats = (orig => () => { orig(); pintarValor(); })(updateStats);

// Resumen para el chat: personas con su calificación, alertas, vacantes y funciones repetidas
modSummary = (orig => () => {
  const L = [orig()];
  for (const c of activos()) { const d = perf(c.id); L.push(`Persona "${c.nombre}" (${byId(c.puesto)?.name || ""}): ${d.puntaje ?? "sin evaluar"}${d.puntaje != null ? `/100, ${d.nivel}` : ""}${d.cambio != null ? `, cambio ${d.cambio}` : ""}${d.bajando.length ? `; bajó en ${d.bajando.map(x => x.nombre).join(", ")}` : ""}`); }
  for (const a of T.alertas) L.push(`Alerta ${a.prioridad}${a.atendida ? " (atendida)" : ""}: ${a.nombre} — ${a.motivo}`);
  for (const v of vacantes()) L.push(`Vacante: ${v.p.name} (${v.n})`);
  for (const c of T.candidatos) L.push(`Candidato "${c.nombre}" a ${byId(c.puesto)?.name || ""}: ${c.puntaje ?? "—"} puntos, ${c.recomendacion}, decisión ${c.decision}`);
  for (const d of T.duplicados) L.push(`Función repetida: "${d.funcionA}" en ${d.puestoA} y "${d.funcionB}" en ${d.puestoB}`);
  return L.join("\n");
})(modSummary);

/* ---------- modales y elementos del dashboard ---------- */
document.body.insertAdjacentHTML("beforeend", `
<div class="modal" id="tDetail"><div class="mc mc-wide"><div class="mh"><h3 id="tdTitle"></h3><button class="close" onclick="closeModal('tDetail')" aria-label="Cerrar">×</button></div><div id="tdBody"></div></div></div>
<div class="modal" id="tForm"><div class="mc mc-wide"><div class="mh"><h3 id="tfTitle"></h3><button class="close" onclick="closeModal('tForm')" aria-label="Cerrar">×</button></div><div id="tfBody"></div>
  <div class="toolbar" style="margin-top:16px;justify-content:flex-end"><button class="btn" onclick="closeModal('tForm')">Cancelar</button><button class="btn primary" id="tfSave" onclick="guardarForm()">Guardar</button></div></div></div>
<div class="modal" id="repModal"><div class="mc mc-wide"><div class="mh"><h3>Reporte ejecutivo</h3><div class="toolbar"><button class="btn primary" onclick="imprimirReporte()">Imprimir o guardar PDF</button><button class="close" onclick="closeModal('repModal')" aria-label="Cerrar">×</button></div></div><div id="repBody"></div></div></div>`);
$("dashboard").querySelector(".hero").insertAdjacentHTML("afterend", '<div id="valorBox"></div>');
CHIPS.unshift("¿Quién tiene bajo desempeño y en qué está bajando?", "¿Qué funciones se repiten entre puestos?");
$("chatChips").innerHTML = CHIPS.map(c => `<button type="button" class="btn small">${esc(c)}</button>`).join("");
refrescarTalento();
