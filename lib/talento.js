// Desempeño de colaboradores, alertas de acción inmediata y evaluación de candidatos.
// Toda la lógica de cálculo vive aquí (servidor) para que la página, el reporte y la IA usen los mismos números.
import { cumplimiento } from "./estructura.js";

/* ---------- niveles de desempeño ---------- */
export const NIVELES = [
  { min: 90, nombre: "Sobresaliente" },
  { min: 75, nombre: "Cumple" },
  { min: 60, nombre: "En riesgo" },
  { min: 0, nombre: "Bajo desempeño" },
];
export const nivelDe = p => (p == null ? "Sin evaluar" : NIVELES.find(n => p >= n.min).nombre);

// Peso de cada parte de la calificación; si una parte no tiene datos, su peso se reparte entre las demás.
export const PESOS = { indicadores: 0.5, competencias: 0.3, kpis: 0.2 };
const prom = a => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);

// Calcula la calificación de una evaluación.
//   puesto: {indicadores:[{nombre,meta,unidad,sentido}], comp:[...]}
//   resultados: {nombreIndicador: valor} · competencias: {nombreCompetencia: 1..4} · kpis: KPIs del módulo cuyo responsable es el puesto
export function calificar(puesto, resultados = {}, competencias = {}, kpis = []) {
  const ind = (puesto.indicadores || []).map(i => {
    const valor = resultados[i.nombre];
    const c = valor === "" || valor == null ? null : cumplimiento(valor, i.meta, i.sentido);
    return { nombre: i.nombre, meta: i.meta, unidad: i.unidad || "", sentido: i.sentido, valor: c == null ? null : Number(valor), cumplimiento: c };
  });
  const comp = (puesto.comp || []).map(nombre => {
    const n = Number(competencias[nombre]);
    return { nombre, nivel: n >= 1 && n <= 4 ? n : null, cumplimiento: n >= 1 && n <= 4 ? Math.round((n / 4) * 100) : null };
  });
  const kp = kpis.map(k => {
    const vals = Array.isArray(k.valores) ? k.valores : [];
    const ultimo = vals.length ? Number(vals[vals.length - 1]) : null;
    return { nombre: k.nombre, codigo: k.codigo, meta: k.meta, unidad: k.unidad || "", sentido: k.sentido, valor: ultimo, cumplimiento: ultimo == null ? null : cumplimiento(ultimo, k.meta, k.sentido) };
  });
  const partes = {
    indicadores: prom(ind.map(x => x.cumplimiento).filter(x => x != null)),
    competencias: prom(comp.map(x => x.cumplimiento).filter(x => x != null)),
    kpis: prom(kp.map(x => x.cumplimiento).filter(x => x != null)),
  };
  const usadas = Object.keys(PESOS).filter(k => partes[k] != null);
  const total = usadas.reduce((s, k) => s + PESOS[k], 0);
  const puntaje = usadas.length ? Math.round(usadas.reduce((s, k) => s + partes[k] * PESOS[k], 0) / total) : null;
  for (const k in partes) if (partes[k] != null) partes[k] = Math.round(partes[k]);
  return { puntaje, nivel: nivelDe(puntaje), partes, indicadores: ind, competencias: comp, kpis: kp };
}

/* ---------- en qué está bajando y cómo mejorar ---------- */
// Compara la evaluación actual con la anterior: qué bajó y qué está por debajo del estándar.
export function diagnostico(actual, anterior) {
  if (!actual) return { bajando: [], debajo: [], cambio: null };
  const prev = new Map();
  if (anterior) for (const x of [...anterior.desglose.indicadores, ...anterior.desglose.competencias]) prev.set(x.nombre, x.cumplimiento);
  const items = [...actual.desglose.indicadores.map(x => ({ ...x, tipo: "indicador" })), ...actual.desglose.competencias.map(x => ({ ...x, tipo: "competencia" }))]
    .filter(x => x.cumplimiento != null);
  const bajando = items
    .filter(x => prev.get(x.nombre) != null && x.cumplimiento < prev.get(x.nombre) - 4)
    .map(x => ({ nombre: x.nombre, tipo: x.tipo, antes: prev.get(x.nombre), ahora: x.cumplimiento, cambio: x.cumplimiento - prev.get(x.nombre) }))
    .sort((a, b) => a.cambio - b.cambio);
  // Por debajo del estándar: un indicador bajo 80% de su meta, o una competencia en nivel 1 o 2 de 4.
  const debajo = items.filter(x => (x.tipo === "indicador" ? x.cumplimiento < 80 : x.cumplimiento < 75)).map(x => ({ nombre: x.nombre, tipo: x.tipo, cumplimiento: x.cumplimiento, valor: x.valor, meta: x.meta, unidad: x.unidad, nivel: x.nivel }))
    .sort((a, b) => a.cumplimiento - b.cumplimiento);
  const cambio = anterior && actual.puntaje != null && anterior.puntaje != null ? actual.puntaje - anterior.puntaje : null;
  return { bajando, debajo, cambio };
}

// Recomendaciones base (sin IA) según lo que está fallando.
export function recomendaciones(d, jefe) {
  const out = [];
  const quien = jefe || "su jefe inmediato";
  for (const x of d.debajo.slice(0, 3)) {
    if (x.tipo === "indicador") out.push(`Revisar con ${quien} por qué "${x.nombre}" está al ${x.cumplimiento}% del estándar y acordar una meta intermedia para el siguiente periodo.`);
    else out.push(`Reforzar la competencia "${x.nombre}" (nivel ${x.nivel} de 4) con capacitación práctica o acompañamiento de un compañero con buen desempeño.`);
  }
  if (d.bajando.length) out.push(`Hacer una sesión de retroalimentación esta semana: bajó en ${d.bajando.map(x => `"${x.nombre}"`).slice(0, 3).join(", ")} respecto al periodo anterior.`);
  if (!out.length) out.push("Mantener el seguimiento mensual y reconocer el buen desempeño.");
  return out;
}

/* ---------- alertas de acción inmediata ---------- */
// Reglas: calificación baja, caída fuerte, dos periodos en riesgo, un indicador muy por debajo o falta de evaluación.
// Una alerta se da por atendida si hay una acción registrada después de la última evaluación.
export function alertas(colaboradores, evaluaciones, acciones, puestos, periodoActual) {
  const porColab = new Map();
  for (const e of evaluaciones) {
    if (!porColab.has(e.colaborador)) porColab.set(e.colaborador, []);
    porColab.get(e.colaborador).push(e);
  }
  const out = [];
  for (const c of colaboradores.filter(x => x.activo)) {
    const evs = (porColab.get(c.id) || []).slice().sort((a, b) => a.periodo.localeCompare(b.periodo));
    const ult = evs.at(-1), ant = evs.at(-2);
    const puesto = puestos.find(p => p.id === c.puesto);
    const jefe = puestos.find(p => p.id === puesto?.parent)?.name || "";
    const base = { colaborador: c.id, nombre: c.nombre, puesto: puesto?.name || "", jefe };
    if (!ult) {
      out.push({ ...base, prioridad: "Baja", motivo: "Todavía no tiene ninguna evaluación de desempeño.", accion: "Registrar su primera evaluación.", tipo: "sin-evaluar" });
      continue;
    }
    const atendida = acciones.some(a => a.colaborador === c.id && a.creado >= ult.fecha);
    const d = diagnostico(ult, ant);
    const add = (prioridad, motivo, accion) => out.push({ ...base, prioridad, motivo, accion, atendida, periodo: ult.periodo, puntaje: ult.puntaje });
    if (ult.puntaje != null && ult.puntaje < 60) {
      const en = d.debajo.slice(0, 2).map(x => `"${x.nombre}" (${x.cumplimiento}%)`).join(" y ");
      add("Alta", `Bajo desempeño: ${ult.puntaje}/100${en ? `; lo más bajo es ${en}` : ""}.`, `${jefe || "Su jefe"} debe reunirse con la persona esta semana y acordar un plan de mejora con fecha.`);
    } else if (d.cambio != null && d.cambio <= -10) {
      add(d.cambio <= -15 ? "Alta" : "Media", `Su calificación cayó ${-d.cambio} puntos (de ${ant.puntaje} a ${ult.puntaje})${d.bajando.length ? `; bajó en "${d.bajando[0].nombre}"` : ""}.`, "Dar retroalimentación inmediata e investigar la causa de la caída.");
    } else if (ant && ult.puntaje < 75 && ant.puntaje < 75) {
      add("Media", `Dos periodos seguidos en riesgo (${ant.puntaje} y ${ult.puntaje}).`, "Acordar un plan de mejora con seguimiento semanal.");
    } else {
      const critico = d.debajo.find(x => x.tipo === "indicador" && x.cumplimiento < 70);
      if (critico) add("Media", `El indicador "${critico.nombre}" está al ${critico.cumplimiento}% del estándar.`, "Revisar el indicador con la persona y definir acciones concretas.");
    }
    if (periodoActual && ult.periodo < periodoActual && !out.some(a => a.colaborador === c.id)) {
      const mes = new Date(ult.periodo + "-15T12:00:00Z").toLocaleDateString("es-MX", { month: "long", year: "numeric", timeZone: "UTC" });
      out.push({ ...base, prioridad: "Baja", motivo: `Su última evaluación es de ${mes}.`, accion: "Registrar la evaluación del periodo más reciente.", tipo: "sin-evaluar", atendida: false });
    }
  }
  const orden = { Alta: 0, Media: 1, Baja: 2 };
  return out.sort((a, b) => orden[a.prioridad] - orden[b.prioridad] || (a.puntaje ?? 999) - (b.puntaje ?? 999));
}

/* ---------- contratación: evaluación de candidatos ---------- */
export const ESCALA_PERFIL = { "Cumple": 100, "Cumple parcialmente": 60, "No cumple": 0 };
export const REFERENCIAS = { "Positivas": 100, "Sin verificar": 60, "Negativas": 0 };
export const PESOS_CANDIDATO = { perfil: 0.25, competencias: 0.35, prueba: 0.2, entrevista: 0.1, referencias: 0.1 };

// Puntaje ponderado y recomendación. Filtros que descartan sin importar el puntaje: no cumple escolaridad o referencias negativas.
export function evaluarCandidato(d, compPuesto = []) {
  const perfil = prom([ESCALA_PERFIL[d.escolaridad], ESCALA_PERFIL[d.experiencia]].filter(x => x != null));
  const comp = prom(compPuesto.map(c => Number(d.competencias?.[c])).filter(n => n >= 1 && n <= 4).map(n => (n / 4) * 100));
  const prueba = d.prueba === "" || d.prueba == null ? null : Math.max(0, Math.min(100, Number(d.prueba)));
  const entrevista = Number(d.entrevista) >= 1 && Number(d.entrevista) <= 4 ? (Number(d.entrevista) / 4) * 100 : null;
  const referencias = REFERENCIAS[d.referencias] ?? null;
  const partes = { perfil, competencias: comp, prueba, entrevista, referencias };
  const usadas = Object.keys(PESOS_CANDIDATO).filter(k => partes[k] != null);
  const total = usadas.reduce((s, k) => s + PESOS_CANDIDATO[k], 0);
  const puntaje = usadas.length ? Math.round(usadas.reduce((s, k) => s + partes[k] * PESOS_CANDIDATO[k], 0) / total) : null;
  for (const k in partes) if (partes[k] != null) partes[k] = Math.round(partes[k]);
  const filtros = [];
  if (d.escolaridad === "No cumple") filtros.push("No cumple la escolaridad requerida por el perfil del puesto.");
  if (d.referencias === "Negativas") filtros.push("Tiene referencias laborales negativas.");
  let recomendacion = puntaje == null ? "Faltan datos" : puntaje >= 80 ? "Contratar" : puntaje >= 65 ? "Segunda entrevista" : "No recomendable";
  if (filtros.length) recomendacion = "No recomendable";
  return { puntaje, recomendacion, partes, filtros };
}
