// Estructura de los puestos: funciones como lista, indicadores de estándar y detección de funciones repetidas.

// Las funciones se guardan en la columna "resp": una por línea (los datos anteriores usaban punto y coma).
// Cada función empieza con mayúscula y sin punto final (igual que lineas() en la página).
export const funcionesDe = resp => String(resp || "").split(/\n|;/).map(s => s.trim().replace(/\.$/, "")).filter(Boolean).map(s => s[0].toUpperCase() + s.slice(1));

// Palabras que no aportan significado al comparar funciones.
const VACIAS = new Set("de del la las el los y e o u a al en con por para su sus un una unos unas que se lo le les como sobre entre cada todo toda todos todas segun".split(" "));

// Raíz aproximada: sin acentos, sin plural y recortada, para que "coordinar" y "coordina" cuenten como la misma palabra.
function raices(texto) {
  return new Set(String(texto).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9ñ ]/g, " ")
    .split(/\s+/).filter(w => w.length > 2 && !VACIAS.has(w))
    .map(w => w.replace(/(es|s)$/, "").slice(0, 6)));
}

// Similitud de Jaccard entre dos funciones (0 a 1).
export function similitud(a, b) {
  const A = raices(a), B = raices(b);
  if (A.size < 2 || B.size < 2) return 0;
  let comun = 0;
  for (const x of A) if (B.has(x)) comun++;
  return comun / (A.size + B.size - comun);
}

export const UMBRAL_REPETIDA = 0.6;

// Pares de funciones que se repiten entre puestos distintos.
// puestos: [{id, name, resp}] · solo: id de un puesto para revisar solo sus funciones contra las demás.
export function funcionesRepetidas(puestos, solo = null) {
  const lista = puestos.map(p => ({ id: Number(p.id), name: p.name ?? p.nombre, fs: funcionesDe(p.resp) }));
  const out = [];
  for (let i = 0; i < lista.length; i++) {
    for (let j = i + 1; j < lista.length; j++) {
      const a = lista[i], b = lista[j];
      if (solo != null && a.id !== solo && b.id !== solo) continue;
      for (const fa of a.fs) for (const fb of b.fs) {
        const s = similitud(fa, fb);
        if (s >= UMBRAL_REPETIDA) out.push({ a: a.id, b: b.id, puestoA: a.name, puestoB: b.name, funcionA: fa, funcionB: fb, similitud: Math.round(s * 100) });
      }
    }
  }
  return out.sort((x, y) => y.similitud - x.similitud);
}

// Funciones repetidas dentro del mismo puesto (se quitan al guardar).
export function sinRepetirDentro(funciones) {
  const out = [];
  for (const f of funciones) if (!out.some(g => g.toLowerCase() === f.toLowerCase() || similitud(f, g) >= 0.85)) out.push(f);
  return out;
}

/* ---------- indicadores de estándar del puesto ---------- */
// {nombre, meta, unidad, sentido: "mayor" | "menor"}: el estándar que se espera de quien ocupa el puesto.
export function cumplimiento(valor, meta, sentido) {
  const v = Number(valor), m = Number(meta);
  if (!Number.isFinite(v) || !Number.isFinite(m)) return null;
  let c;
  if (sentido === "menor") c = v <= m ? 100 : v === 0 ? 100 : (m / v) * 100;
  else c = m === 0 ? (v >= 0 ? 100 : 0) : (v / m) * 100;
  return Math.max(0, Math.min(100, Math.round(c)));
}
