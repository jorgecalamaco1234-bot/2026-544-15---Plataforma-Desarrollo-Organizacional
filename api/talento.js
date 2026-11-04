// POST {mod, op, ...}: personas, evaluaciones de desempeño, acciones de mejora y candidatos.
//   colaboradores: "create" {datos} | "update" {id, datos} | "baja" {id} | "reactivar" {id}
//   evaluaciones:  "guardar" {datos: {colaborador, periodo, resultados, competencias, comentario}} (una por persona y mes) | "delete" {id}
//   acciones:      "create" {datos} | "cerrar" {id} | "delete" {id}
//   candidatos:    "create" {datos} | "update" {id, datos} | "delete" {id}
// Siempre responde con todos los datos de talento recalculados (desempeño, alertas, etc.).
import { db, insertar, ahora, puestoOut, docOut, cargarTalento } from "../lib/db.js";
import { readBody, fail, HttpError, requireSameOrigin } from "../lib/http.js";
import { requireEmpresa, puede } from "../lib/auth.js";
import { limpiarColaborador, limpiarEvaluacion, limpiarAccion, limpiarCandidato } from "../lib/validar.js";
import { calificar, evaluarCandidato } from "../lib/talento.js";
import { exigirEscritura } from "../lib/suscripcion.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Método no permitido." });
  try {
    requireSameOrigin(req);
    const body = readBody(req);
    const u = await requireEmpresa(req);
    exigirEscritura(u);
    const k = await db();
    // Puntaje en vivo mientras se llena el formulario del candidato (no guarda nada).
    if (body.mod === "candidatos" && body.op === "calcular") {
      exigir(u, "editar", "contratacion", "evaluar candidatos");
      const puesto = await leerPuesto(k, u.empresa_id, idValido(body.datos?.puesto));
      return res.status(200).json({ calculo: evaluarCandidato(body.datos || {}, puesto.comp) });
    }
    const ops = { colaboradores, evaluaciones, acciones, candidatos }[body.mod];
    if (!ops) throw new HttpError(400, "Módulo no válido.");
    const aviso = await ops(k, u, body);
    res.status(200).json({ ...(await cargarTalento(k, u.empresa_id)), aviso: aviso || "" });
  } catch (err) {
    fail(res, err);
  }
}

const exigir = (u, accion, mod, que) => {
  if (!puede(u, accion, mod)) throw new HttpError(403, `Tu rol (${u.rol}) no puede ${que}.`);
};
const idValido = id => {
  const n = Number(id);
  if (!Number.isInteger(n) || n <= 0) throw new HttpError(400, "Identificador no válido.");
  return n;
};
const leerPuesto = async (k, E, id) => {
  const p = await k.selectFrom("puestos").selectAll().where("id", "=", id).where("empresa_id", "=", E).executeTakeFirst();
  if (!p) throw new HttpError(400, "El puesto no existe.");
  return puestoOut(p);
};
const leerColab = async (k, E, id) => {
  const c = await k.selectFrom("colaboradores").selectAll().where("id", "=", idValido(id)).where("empresa_id", "=", E).executeTakeFirst();
  if (!c) throw new HttpError(404, "La persona ya no existe.");
  return c;
};
const ocupadas = async (k, E, puesto_id, sin = 0) =>
  (await k.selectFrom("colaboradores").select("id").where("empresa_id", "=", E).where("puesto_id", "=", puesto_id).where("activo", "=", 1).where("id", "!=", sin).execute()).length;
// Aviso (no bloquea) si el puesto ya tiene todas sus plazas ocupadas.
const avisoPlazas = async (k, E, puesto, sin) => {
  const n = await ocupadas(k, E, puesto.id, sin);
  return n >= puesto.plazas ? `Atención: ${puesto.name} ya tenía ${n} de ${puesto.plazas} plazas ocupadas. Ajusta las plazas del puesto si la estructura cambió.` : "";
};

/* ---------- colaboradores ---------- */
async function colaboradores(k, u, { op, id, datos }) {
  const E = u.empresa_id;
  exigir(u, "editar", "talento", "dar de alta ni modificar personas");
  if (op === "create") {
    const v = limpiarColaborador(datos);
    const puesto = await leerPuesto(k, E, v.puesto_id);
    const aviso = await avisoPlazas(k, E, puesto, 0);
    await insertar(k, "colaboradores", { ...v, empresa_id: E, activo: 1, creado_el: ahora() });
    return aviso;
  }
  const c = await leerColab(k, E, id);
  if (op === "update") {
    const v = limpiarColaborador(datos);
    const puesto = await leerPuesto(k, E, v.puesto_id);
    const aviso = Number(c.puesto_id) !== puesto.id ? await avisoPlazas(k, E, puesto, Number(c.id)) : "";
    await k.updateTable("colaboradores").set(v).where("id", "=", c.id).where("empresa_id", "=", E).execute();
    return aviso;
  }
  if (op === "baja" || op === "reactivar") {
    await k.updateTable("colaboradores").set({ activo: op === "baja" ? 0 : 1 }).where("id", "=", c.id).where("empresa_id", "=", E).execute();
    return "";
  }
  throw new HttpError(400, "Operación no válida.");
}

/* ---------- evaluaciones de desempeño ---------- */
// La calificación la calcula el servidor: indicadores del puesto + competencias (evaluación del jefe) + KPIs del área a cargo del puesto.
async function evaluaciones(k, u, { op, id, datos }) {
  const E = u.empresa_id;
  exigir(u, "aprobar", "talento", "evaluar el desempeño");
  if (op === "guardar") {
    const c = await leerColab(k, E, datos?.colaborador);
    if (Number(c.activo) !== 1) throw new HttpError(400, "No se puede evaluar a una persona dada de baja.");
    const puesto = await leerPuesto(k, E, Number(c.puesto_id));
    const v = limpiarEvaluacion(datos, puesto, ahora().slice(0, 7)); // se puede evaluar hasta el mes en curso
    const kpis = (await k.selectFrom("documentos").selectAll().where("empresa_id", "=", E).where("modulo", "=", "kpis").execute()).map(r => docOut(r)).filter(x => Number(x.responsable) === puesto.id);
    const cal = calificar(puesto, v.resultados, v.competencias, kpis);
    const fila = { resultados: JSON.stringify(v.resultados), competencias: JSON.stringify(v.competencias), puntaje: cal.puntaje, desglose: JSON.stringify(cal), comentario: v.comentario || null, evaluador: u.nombre, fecha: ahora() };
    const previa = await k.selectFrom("evaluaciones").select("id").where("empresa_id", "=", E).where("colaborador_id", "=", c.id).where("periodo", "=", v.periodo).executeTakeFirst();
    if (previa) await k.updateTable("evaluaciones").set(fila).where("id", "=", previa.id).execute();
    else await insertar(k, "evaluaciones", { ...fila, empresa_id: E, colaborador_id: c.id, periodo: v.periodo });
    return previa ? `Se actualizó la evaluación de ${v.periodo}: ${cal.puntaje ?? "sin"} puntos.` : `Evaluación registrada: ${cal.puntaje ?? "sin"} puntos (${cal.nivel}).`;
  }
  if (op === "delete") {
    await k.deleteFrom("evaluaciones").where("id", "=", idValido(id)).where("empresa_id", "=", E).execute();
    return "";
  }
  throw new HttpError(400, "Operación no válida.");
}

/* ---------- acciones de mejora (atienden las alertas) ---------- */
async function acciones(k, u, { op, id, datos }) {
  const E = u.empresa_id;
  exigir(u, "aprobar", "talento", "registrar acciones de mejora");
  if (op === "create") {
    const c = await leerColab(k, E, datos?.colaborador);
    const v = limpiarAccion(datos);
    await insertar(k, "acciones", { ...v, empresa_id: E, colaborador_id: c.id, estado: "Abierta", creado_por: u.nombre, creado_el: ahora(), cerrado_el: null });
    return "Acción registrada. La alerta queda como atendida.";
  }
  const aid = idValido(id);
  if (op === "cerrar") {
    await k.updateTable("acciones").set({ estado: "Cerrada", cerrado_el: ahora() }).where("id", "=", aid).where("empresa_id", "=", E).execute();
    return "Acción cerrada.";
  }
  if (op === "delete") {
    await k.deleteFrom("acciones").where("id", "=", aid).where("empresa_id", "=", E).execute();
    return "";
  }
  throw new HttpError(400, "Operación no válida.");
}

/* ---------- candidatos (formulario de decisión de contratación) ---------- */
async function candidatos(k, u, { op, id, datos }) {
  const E = u.empresa_id;
  if (op === "delete") {
    exigir(u, "editar", "contratacion", "eliminar candidatos");
    await k.deleteFrom("candidatos").where("id", "=", idValido(id)).where("empresa_id", "=", E).execute();
    return "";
  }
  if (op !== "create" && op !== "update") throw new HttpError(400, "Operación no válida.");
  const actual = op === "update" ? await k.selectFrom("candidatos").selectAll().where("id", "=", idValido(id)).where("empresa_id", "=", E).executeTakeFirst() : null;
  if (op === "update" && !actual) throw new HttpError(404, "El candidato ya no existe.");
  if (actual?.decision === "Contratado") throw new HttpError(409, "Este candidato ya fue contratado; su evaluación queda como registro.");
  // Quien solo decide (Dirección) cambia la decisión y su justificación; la evaluación se conserva tal cual.
  const soloDecide = op === "update" && !puede(u, "editar", "contratacion");
  if (!soloDecide) exigir(u, "editar", "contratacion", "registrar candidatos");
  const puesto = await leerPuesto(k, E, soloDecide ? Number(actual.puesto_id) : idValido(datos?.puesto));
  const v = limpiarCandidato(soloDecide ? { ...JSON.parse(actual.datos), nombre: actual.nombre, decision: datos?.decision, justificacion: datos?.justificacion } : datos, puesto.comp);
  const ev = evaluarCandidato(v.datos, puesto.comp);

  // La decisión final es humana y solo la toman los roles autorizados; si se aparta de la recomendación, debe justificarse.
  if (v.decision !== (actual?.decision || "En evaluación")) exigir(u, "aprobar", "contratacion", "tomar la decisión de contratación");
  const contraria = (v.decision === "Contratado" && ev.recomendacion !== "Contratar") || (v.decision === "Descartado" && ev.recomendacion === "Contratar");
  if (contraria && v.justificacion.length < 10) throw new HttpError(400, `La recomendación es "${ev.recomendacion}". Para decidir "${v.decision}" escribe la justificación.`);

  const fila = { puesto_id: puesto.id, nombre: v.nombre, datos: JSON.stringify(v.datos), puntaje: ev.puntaje, recomendacion: ev.recomendacion, decision: v.decision, justificacion: v.justificacion || null, evaluador: u.nombre, actualizado_el: ahora() };
  let aviso = `${v.nombre}: ${ev.puntaje ?? "sin"} puntos · recomendación: ${ev.recomendacion}.`;
  await k.transaction().execute(async tx => {
    if (actual) await tx.updateTable("candidatos").set(fila).where("id", "=", actual.id).execute();
    else await insertar(tx, "candidatos", { ...fila, empresa_id: E, creado_el: ahora() });
    // Al contratar, la persona se da de alta en el puesto (y empieza sin evaluaciones).
    if (v.decision === "Contratado") {
      const plazas = await avisoPlazas(tx, E, puesto, 0);
      await insertar(tx, "colaboradores", { empresa_id: E, puesto_id: puesto.id, nombre: v.nombre, email: null, ingreso: ahora().slice(0, 10), activo: 1, creado_el: ahora() });
      aviso = `Contratación registrada: ${v.nombre} ya aparece en Desempeño como ${puesto.name}.${plazas ? " " + plazas : ""}`;
    }
  });
  return aviso;
}
