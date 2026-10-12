// POST {mod, op, ...}: altas, cambios, flujo de aprobación y bajas de todos los módulos.
//   mod: "puestos" | "procesos" | "competencias" | "politicas" | "kpis"
//   op:  "create" {datos, ia} | "update" {id, datos, ia} | "estado" {id, accion} | "delete" {id} | "reset" (solo Administrador)
import { db, MODULOS_DOC, insertar, ahora, hoy, nombreDe, puestoOut, docOut, historialDe, restablecer, cargarTodo } from "../lib/db.js";
import { readBody, fail, HttpError, requireSameOrigin } from "../lib/http.js";
import { requireUser, puede, esAdmin } from "../lib/auth.js";
import { limpiarDocumento, limpiarPuesto } from "../lib/validar.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Método no permitido." });
  try {
    requireSameOrigin(req);
    const body = readBody(req);
    const u = await requireUser(req);
    const k = await db();

    if (body.op === "reset") {
      if (!esAdmin(u)) throw new HttpError(403, "Solo el Administrador puede restablecer los datos de ejemplo.");
      await restablecer(k);
      return res.status(200).json(await cargarTodo(k));
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
const idValido = id => {
  const n = Number(id);
  if (!Number.isInteger(n) || n <= 0) throw new HttpError(400, "Identificador no válido.");
  return n;
};

/* ---------- puestos (organigrama y descripciones) ---------- */
async function puestos(k, u, { op, id, datos = {}, accion }) {
  const leer = pid => k.selectFrom("puestos").selectAll().where("id", "=", pid).executeTakeFirst();
  const todos = () => k.selectFrom("puestos").select(["id", "parent_id"]).execute();

  // RN-03 / RN-04: el jefe debe existir y no se permiten ciclos en la jerarquía.
  const validarJefe = async (parent, propio) => {
    if (parent == null || parent === "") return null;
    const pid = idValido(parent);
    const lista = await todos();
    const mapa = new Map(lista.map(p => [Number(p.id), p.parent_id == null ? null : Number(p.parent_id)]));
    if (!mapa.has(pid)) throw new HttpError(400, "El puesto al que reporta no existe.");
    for (let x = pid, pasos = 0; x != null && pasos < 1000; x = mapa.get(x), pasos++) {
      if (x === propio) throw new HttpError(400, "Ese cambio crearía un ciclo en la jerarquía: un puesto no puede reportar a sí mismo ni a su equipo.");
    }
    return pid;
  };

  if (op === "create") {
    exigir(u, "editar", "puestos");
    const v = limpiarPuesto(datos);
    const parent_id = await validarJefe(datos.parent);
    if (parent_id == null && (await todos()).length) throw new HttpError(400, "Indica a quién reporta el puesto.");
    // "Revisar y aprobar" solo se respeta si el rol puede aprobar; si no, queda pendiente.
    const aprobada = datos.status === "Completa" && puede(u, "aprobar", "puestos");
    const nid = await insertar(k, "puestos", { ...v, parent_id, estado: aprobada ? "Completa" : "Pendiente", creado_por: u.nombre, actualizado_el: ahora() });
    return { item: puestoOut(await leer(nid)), aviso: datos.status === "Completa" && !aprobada ? "Se guardó como pendiente: tu rol no puede aprobar descripciones." : "" };
  }

  const pid = idValido(id);
  const actual = await leer(pid);
  if (!actual) throw new HttpError(404, "El puesto ya no existe.");

  if (op === "update") {
    exigir(u, "editar", "puestos");
    const v = limpiarPuesto({ ...puestoOut(actual), ...datos });
    const parent_id = actual.parent_id == null ? null : await validarJefe(datos.parent ?? actual.parent_id, pid);
    // Si cambia la descripción vuelve a revisión; cambiar solo el nombre del área o a quién reporta no la invalida.
    const cambioDescripcion = ["resp", "obj", "comp", "perfil"].some(c => (v[c] || "") !== (actual[c] || ""));
    await k.updateTable("puestos").set({ ...v, parent_id, ...(cambioDescripcion && { estado: "Pendiente" }), actualizado_el: ahora() }).where("id", "=", pid).execute();
    return { item: puestoOut(await leer(pid)) };
  }
  if (op === "estado") {
    if (accion !== "aprobar") throw new HttpError(400, "Acción no válida.");
    exigir(u, "aprobar", "puestos");
    await k.updateTable("puestos").set({ estado: "Completa", actualizado_el: ahora() }).where("id", "=", pid).execute();
    return { item: puestoOut(await leer(pid)) };
  }
  if (op === "delete") {
    exigir(u, "editar", "puestos");
    if (actual.parent_id == null) throw new HttpError(400, "No se puede eliminar el puesto de mayor nivel.");
    const hijos = await k.selectFrom("puestos").select("id").where("parent_id", "=", pid).execute();
    if (hijos.length) throw new HttpError(409, "No se puede eliminar un puesto que tiene equipo a cargo.");
    await k.deleteFrom("puestos").where("id", "=", pid).execute();
    return { ok: true, id: pid };
  }
  throw new HttpError(400, "Operación no válida.");
}

/* ---------- procesos, competencias, políticas y KPIs ---------- */
const PREFIJO = { procesos: "PR", competencias: "CMP", politicas: "POL", kpis: "KPI" };
const abreviatura = d => (String(d || "GEN").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z ]/g, "").split(" ").filter(w => w.length > 2)[0] || "GEN").slice(0, 3).toUpperCase();

async function nuevoCodigo(k, mod, dept) {
  const pre = mod === "competencias" ? `${PREFIJO[mod]}-` : `${PREFIJO[mod]}-${abreviatura(dept)}-`;
  const usados = new Set((await k.selectFrom("documentos").select("codigo").where("modulo", "=", mod).where("codigo", "like", pre + "%").execute()).map(r => r.codigo));
  let n = usados.size + 1;
  while (usados.has(pre + String(n).padStart(2, "0"))) n++;
  return pre + String(n).padStart(2, "0");
}

const anotar = (q, mod, id, version, autor, nota) =>
  q.insertInto("historial").values({ modulo: mod, registro_id: id, version, fecha: hoy(), autor, nota }).execute();

async function documentos(k, u, { mod, op, id, datos, accion, ia }) {
  const leer = did => k.selectFrom("documentos").selectAll().where("id", "=", did).where("modulo", "=", mod).executeTakeFirst();
  const respuesta = async did => ({ item: docOut(await leer(did), await historialDe(k, mod, did)) });
  const conIA = ia ? " con apoyo de IA" : "";

  if (op === "create") {
    exigir(u, "editar", mod);
    const v = limpiarDocumento(mod, datos);
    const nid = await k.transaction().execute(async tx => {
      const codigo = await nuevoCodigo(tx, mod, v.dept);
      const nuevo = await insertar(tx, "documentos", {
        modulo: mod, codigo, nombre: nombreDe(mod, v), estado: "Borrador", version: 1, datos: JSON.stringify(v),
        aprobado_por: null, aprobado_el: null, creado_por: u.nombre, actualizado_el: ahora(),
      });
      await anotar(tx, mod, nuevo, 1, u.nombre, "Creado" + conIA);
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
      }).where("id", "=", did).execute();
      await anotar(tx, mod, did, version, u.nombre, (nuevaVersion ? "Nueva versión" : "Editado") + conIA);
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
      }).where("id", "=", did).execute();
      await anotar(tx, mod, did, Number(actual.version), u.nombre, r.nota);
    });
    return respuesta(did);
  }

  if (op === "delete") {
    exigir(u, "editar", mod);
    await k.transaction().execute(async tx => {
      await tx.deleteFrom("historial").where("modulo", "=", mod).where("registro_id", "=", did).execute();
      await tx.deleteFrom("documentos").where("id", "=", did).execute();
    });
    return { ok: true, id: did };
  }
  throw new HttpError(400, "Operación no válida.");
}
