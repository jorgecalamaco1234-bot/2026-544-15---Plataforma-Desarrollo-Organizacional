// POST {mod, op, ...}: altas, cambios, flujo de aprobación y bajas de todos los módulos.
//   mod: "puestos" | "procesos" | "competencias" | "politicas" | "kpis"
//   op:  "create" {datos, ia} | "update" {id, datos, ia} | "estado" {id, accion} | "delete" {id} | "reset" (solo Administrador)
import { db, MODULOS_DOC, insertar, ahora, hoy, nombreDe, puestoOut, docOut, historialDe, restablecer, cargarTodo } from "../lib/db.js";
import { readBody, fail, HttpError, requireSameOrigin } from "../lib/http.js";
import { requireEmpresa, puede, esAdmin } from "../lib/auth.js";
import { exigirEscritura } from "../lib/suscripcion.js";
import { limpiarDocumento, limpiarPuesto } from "../lib/validar.js";
import { funcionesDe, funcionesRepetidas } from "../lib/estructura.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Método no permitido." });
  try {
    requireSameOrigin(req);
    const body = readBody(req);
    // Todo se limita a la empresa del usuario: nunca se lee ni se modifica algo de otra empresa.
    const u = await requireEmpresa(req);
    exigirEscritura(u);
    const k = await db();

    if (body.op === "reset") {
      if (!esAdmin(u)) throw new HttpError(403, "Solo el Administrador puede restablecer los datos de ejemplo.");
      await restablecer(k, u.empresa_id);
      return res.status(200).json(await cargarTodo(k, u.empresa_id));
    }
    if (body.mod === "puestos") return res.status(200).json(await puestos(k, u, body));
    if (MODULOS_DOC.includes(body.mod)) return res.status(200).json(await documentos(k, u, body));
    throw new HttpError(400, "Módulo no válido.");
  } catch (err) {
    fail(res, err);
  }
}

const exigir = (u, accion, mod) => {
  if (!puede(u, accion, mod)) throw new HttpError(403, `Tu rol (${u.rol}) no tiene permiso para ${accion === "aprobar" ? "aprobar" : "modificar"} en este módulo.`);
};
// Un puesto aprobado debe tener propósito claro, funciones y al menos un indicador de estándar.
function faltaParaAprobar(p) {
  const falta = [];
  if (!String(p.obj || "").trim()) falta.push("el propósito del puesto");
  if (!funcionesDe(p.resp).length) falta.push("sus funciones");
  let ind = [];
  try { ind = JSON.parse(p.indicadores || "[]") || []; } catch {}
  if (!ind.length) falta.push("al menos un indicador de estándar");
  return falta.length ? `falta ${falta.join(", ").replace(/, ([^,]*)$/, " y $1")}.` : "";
}

const idValido = id => {
  const n = Number(id);
  if (!Number.isInteger(n) || n <= 0) throw new HttpError(400, "Identificador no válido.");
  return n;
};

/* ---------- puestos (organigrama y descripciones) ---------- */
async function puestos(k, u, { op, id, datos = {}, accion }) {
  const E = u.empresa_id;
  const leer = pid => k.selectFrom("puestos").selectAll().where("id", "=", pid).where("empresa_id", "=", E).executeTakeFirst();
  const todos = () => k.selectFrom("puestos").select(["id", "parent_id"]).where("empresa_id", "=", E).execute();

  // RN-03 / RN-04: el jefe debe existir y no se permiten ciclos en la jerarquía.
  const validarJefe = async (parent, propio) => {
    if (parent == null || parent === "" || Number(parent) === 0) return null;
    const pid = idValido(parent);
    const lista = await todos();
    const mapa = new Map(lista.map(p => [Number(p.id), p.parent_id == null ? null : Number(p.parent_id)]));
    if (!mapa.has(pid)) throw new HttpError(400, "El puesto al que reporta no existe.");
    for (let x = pid, pasos = 0; x != null && pasos < 1000; x = mapa.get(x), pasos++) {
      if (x === propio) throw new HttpError(400, "Ese cambio crearía un ciclo en la jerarquía: un puesto no puede reportar a sí mismo ni a su equipo.");
    }
    return pid;
  };

  // Funciones repetidas: si alguna función ya la tiene otro puesto, se avisa y solo se guarda si el usuario lo confirma (forzar).
  const revisarRepetidas = async (v, propio) => {
    if (datos.forzar) return;
    const otros = (await k.selectFrom("puestos").select(["id", "nombre", "resp"]).where("empresa_id", "=", E).execute()).filter(p => Number(p.id) !== propio);
    const rep = funcionesRepetidas([...otros, { id: -1, nombre: v.nombre, resp: v.resp }], -1);
    if (rep.length) {
      // Agrupa por función propia: "Dar seguimiento a indicadores" ya la tienen Gerente de Calidad y Coordinador de Calidad
      const porFuncion = new Map();
      for (const r of rep) {
        const [mia, otro] = r.a === -1 ? [r.funcionA, r.puestoB] : [r.funcionB, r.puestoA];
        porFuncion.set(mia, [...new Set([...(porFuncion.get(mia) || []), otro])]);
      }
      const lista = [...porFuncion].slice(0, 3).map(([f, ps]) => `"${f}" ya la ${ps.length > 1 ? "tienen" : "tiene"} ${ps.join(" y ")}`).join("; ");
      throw new HttpError(409, `Funciones repetidas: ${lista}. Cada función debe tener un solo dueño.`);
    }
  };

  if (op === "create") {
    exigir(u, "editar", "puestos");
    const v = limpiarPuesto(datos);
    const parent_id = await validarJefe(datos.parent);
    if (parent_id == null && (await todos()).length) throw new HttpError(400, "Indica a quién reporta el puesto.");
    await revisarRepetidas(v, null);
    // "Revisar y aprobar" solo se respeta si el rol puede aprobar y la descripción está completa; si no, queda pendiente.
    const falta = faltaParaAprobar(v);
    const aprobada = datos.status === "Completa" && puede(u, "aprobar", "puestos") && !falta;
    const nid = await insertar(k, "puestos", { ...v, empresa_id: E, parent_id, estado: aprobada ? "Completa" : "Pendiente", creado_por: u.nombre, actualizado_el: ahora() });
    const aviso = datos.status !== "Completa" || aprobada ? "" : !puede(u, "aprobar", "puestos") ? "Se guardó como pendiente: tu rol no puede aprobar descripciones." : `Se guardó como pendiente: ${falta}`;
    return { item: puestoOut(await leer(nid)), aviso };
  }

  const pid = idValido(id);
  const actual = await leer(pid);
  if (!actual) throw new HttpError(404, "El puesto ya no existe.");

  if (op === "update") {
    exigir(u, "editar", "puestos");
    const v = limpiarPuesto({ ...puestoOut(actual), ...datos });
    if (actual.parent_id == null && datos.parent != null && datos.parent !== "" && Number(datos.parent) !== 0)
      throw new HttpError(400, "El puesto de mayor nivel no reporta a nadie; no se le puede asignar un jefe.");
    const parent_id = actual.parent_id == null ? null : await validarJefe(datos.parent ?? actual.parent_id, pid);
    await revisarRepetidas(v, pid);
    // Si cambia la descripción vuelve a revisión; cambiar el nombre del área, las plazas o a quién reporta no la invalida.
    const prev = { ...actual, resp: funcionesDe(actual.resp).join("\n"), indicadores: actual.indicadores || "[]" };
    const cambioDescripcion = ["resp", "obj", "comp", "perfil", "indicadores"].some(c => (v[c] || "") !== (prev[c] || ""));
    await k.updateTable("puestos").set({ ...v, parent_id, ...(cambioDescripcion && { estado: "Pendiente" }), actualizado_el: ahora() }).where("id", "=", pid).where("empresa_id", "=", E).execute();
    return { item: puestoOut(await leer(pid)) };
  }
  if (op === "estado") {
    if (accion !== "aprobar") throw new HttpError(400, "Acción no válida.");
    exigir(u, "aprobar", "puestos");
    const falta = faltaParaAprobar(actual);
    if (falta) throw new HttpError(400, `No se puede aprobar todavía: ${falta}`);
    await k.updateTable("puestos").set({ estado: "Completa", actualizado_el: ahora() }).where("id", "=", pid).where("empresa_id", "=", E).execute();
    return { item: puestoOut(await leer(pid)) };
  }
  if (op === "delete") {
    exigir(u, "editar", "puestos");
    if (actual.parent_id == null) throw new HttpError(400, "No se puede eliminar el puesto de mayor nivel.");
    const hijos = await k.selectFrom("puestos").select("id").where("parent_id", "=", pid).where("empresa_id", "=", E).execute();
    if (hijos.length) throw new HttpError(409, "No se puede eliminar un puesto que tiene equipo a cargo.");
    const gente = await k.selectFrom("colaboradores").select("id").where("puesto_id", "=", pid).where("empresa_id", "=", E).where("activo", "=", 1).execute();
    if (gente.length) throw new HttpError(409, `No se puede eliminar: ${gente.length === 1 ? "hay 1 persona" : `hay ${gente.length} personas`} en este puesto. Cámbialas de puesto o dalas de baja primero.`);
    await k.deleteFrom("candidatos").where("puesto_id", "=", pid).where("empresa_id", "=", E).execute();
    await k.deleteFrom("puestos").where("id", "=", pid).where("empresa_id", "=", E).execute();
    return { ok: true, id: pid };
  }
  throw new HttpError(400, "Operación no válida.");
}

/* ---------- procesos, competencias, políticas y KPIs ---------- */
const PREFIJO = { procesos: "PR", competencias: "CMP", politicas: "POL", kpis: "KPI" };
const abreviatura = d => (String(d || "GEN").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z ]/g, "").split(" ").filter(w => w.length > 2)[0] || "GEN").slice(0, 3).toUpperCase();

async function nuevoCodigo(k, E, mod, dept) {
  const pre = mod === "competencias" ? `${PREFIJO[mod]}-` : `${PREFIJO[mod]}-${abreviatura(dept)}-`;
  const usados = new Set((await k.selectFrom("documentos").select("codigo").where("empresa_id", "=", E).where("modulo", "=", mod).where("codigo", "like", pre + "%").execute()).map(r => r.codigo));
  let n = usados.size + 1;
  while (usados.has(pre + String(n).padStart(2, "0"))) n++;
  return pre + String(n).padStart(2, "0");
}

const anotar = (q, E, mod, id, version, autor, nota) =>
  q.insertInto("historial").values({ empresa_id: E, modulo: mod, registro_id: id, version, fecha: hoy(), autor, nota }).execute();

async function documentos(k, u, { mod, op, id, datos, accion, ia }) {
  const E = u.empresa_id;
  const leer = did => k.selectFrom("documentos").selectAll().where("id", "=", did).where("modulo", "=", mod).where("empresa_id", "=", E).executeTakeFirst();
  const respuesta = async did => ({ item: docOut(await leer(did), await historialDe(k, E, mod, did)) });
  const conIA = ia ? " con apoyo de IA" : "";

  if (op === "create") {
    exigir(u, "editar", mod);
    const v = limpiarDocumento(mod, datos);
    const nid = await k.transaction().execute(async tx => {
      const codigo = await nuevoCodigo(tx, E, mod, v.dept);
      const nuevo = await insertar(tx, "documentos", {
        empresa_id: E, modulo: mod, codigo, nombre: nombreDe(mod, v), estado: "Borrador", version: 1, datos: JSON.stringify(v),
        aprobado_por: null, aprobado_el: null, creado_por: u.nombre, actualizado_el: ahora(),
      });
      await anotar(tx, E, mod, nuevo, 1, u.nombre, "Creado" + conIA);
      return nuevo;
    });
    return respuesta(nid);
  }

  const did = idValido(id);
  const actual = await leer(did);
  if (!actual) throw new HttpError(404, "El registro ya no existe.");

  if (op === "update") {
    exigir(u, "editar", mod);
    const v = limpiarDocumento(mod, datos);
    // Editar algo aprobado crea la versión siguiente en revisión; la anterior queda en el historial.
    const nuevaVersion = actual.estado === "Aprobado";
    const version = Number(actual.version) + (nuevaVersion ? 1 : 0);
    await k.transaction().execute(async tx => {
      await tx.updateTable("documentos").set({
        nombre: nombreDe(mod, v), datos: JSON.stringify(v), version, actualizado_el: ahora(),
        ...(nuevaVersion && { estado: "En revisión", aprobado_por: null, aprobado_el: null }),
      }).where("id", "=", did).where("empresa_id", "=", E).execute();
      await anotar(tx, E, mod, did, version, u.nombre, (nuevaVersion ? "Nueva versión" : "Editado") + conIA);
    });
    return respuesta(did);
  }

  if (op === "estado") {
    const reglas = {
      enviar: { desde: "Borrador", hacia: "En revisión", permiso: "editar", nota: "Enviado a revisión" },
      regresar: { desde: "En revisión", hacia: "Borrador", permiso: "editar", nota: "Regresado a borrador" },
      aprobar: { desde: "En revisión", hacia: "Aprobado", permiso: "aprobar", nota: "Aprobado" },
    };
    const r = reglas[accion];
    if (!r) throw new HttpError(400, "Acción no válida.");
    exigir(u, r.permiso, mod);
    if (actual.estado !== r.desde) throw new HttpError(409, `No se puede ${accion} un registro en estado "${actual.estado}".`);
    await k.transaction().execute(async tx => {
      await tx.updateTable("documentos").set({
        estado: r.hacia, actualizado_el: ahora(),
        ...(accion === "aprobar" ? { aprobado_por: u.nombre, aprobado_el: hoy() } : { aprobado_por: null, aprobado_el: null }),
      }).where("id", "=", did).where("empresa_id", "=", E).execute();
      await anotar(tx, E, mod, did, Number(actual.version), u.nombre, r.nota);
    });
    return respuesta(did);
  }

  if (op === "delete") {
    exigir(u, "editar", mod);
    await k.transaction().execute(async tx => {
      await tx.deleteFrom("historial").where("empresa_id", "=", E).where("modulo", "=", mod).where("registro_id", "=", did).execute();
      await tx.deleteFrom("documentos").where("id", "=", did).where("empresa_id", "=", E).execute();
    });
    return { ok: true, id: did };
  }
  throw new HttpError(400, "Operación no válida.");
}
