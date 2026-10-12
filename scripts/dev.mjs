// Servidor de desarrollo local que imita a Vercel: sirve la página y ejecuta las funciones de /api.
//   npm run dev            → http://localhost:3000
// Lee las variables de .env. Si no hay DATABASE_URL usa PGlite (PostgreSQL en memoria): los datos se pierden al cerrar.
import http from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const PORT = +process.env.PORT || 3000;

// .env sencillo (CLAVE=valor); no sobrescribe variables ya definidas
if (existsSync(join(ROOT, ".env"))) {
  for (const linea of readFileSync(join(ROOT, ".env"), "utf8").split(/\r?\n/)) {
    const m = linea.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env) && !/pega_tu_clave_aqui/.test(m[2])) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

if (!process.env.DATABASE_URL && !process.env.POSTGRES_URL) {
  const { PGlite } = await import("@electric-sql/pglite");
  const { PostgresDialect } = await import("kysely");
  const pg = new PGlite();
  // Adaptador mínimo de PGlite a la interfaz de pool que espera Kysely
  const cliente = {
    async query(sql, params) {
      const r = await pg.query(sql, params);
      return { rows: r.rows, rowCount: r.affectedRows ?? r.rows.length, command: sql.trim().split(/\s+/)[0].toUpperCase() };
    },
    release() {},
  };
  globalThis.__dbDialect = new PostgresDialect({ pool: { connect: async () => cliente, end: async () => {}, options: {} } });
  console.log("Base de datos: PGlite en memoria (sin DATABASE_URL).");
} else {
  console.log("Base de datos: DATABASE_URL de .env.");
}

const TIPOS = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml", ".ico": "image/x-icon" };
const PRIVADO = /^(\.|node_modules|lib|scripts|api)(\/|$)|\.(docx|pdf|md)$/i;

function adaptarRes(res) {
  res.status = c => { res.statusCode = c; return res; };
  res.json = o => { if (!res.getHeader("Content-Type")) res.setHeader("Content-Type", "application/json; charset=utf-8"); res.end(JSON.stringify(o)); return res; };
  res.send = b => { res.end(b); return res; };
  return res;
}

http.createServer(async (req, res) => {
  adaptarRes(res);
  const url = new URL(req.url, `http://localhost:${PORT}`);
  try {
    const api = url.pathname.match(/^\/api\/([a-z0-9-]+)$/i);
    if (api) {
      const archivo = join(ROOT, "api", api[1] + ".js");
      if (!existsSync(archivo)) return res.status(404).json({ error: "No existe." });
      let raw = "";
      for await (const c of req) raw += c;
      req.query = Object.fromEntries(url.searchParams);
      req.body = /json/.test(req.headers["content-type"] || "") && raw ? JSON.parse(raw) : raw;
      const { default: handler } = await import(pathToFileURL(archivo).href);
      return await handler(req, res);
    }
    const rel = decodeURIComponent(url.pathname).replace(/^\/+/, "") || "index.html";
    const ruta = normalize(join(ROOT, rel));
    if (!ruta.startsWith(ROOT + sep) || PRIVADO.test(rel.replace(/\\/g, "/")) || !existsSync(ruta)) return res.status(404).send("No encontrado");
    res.setHeader("Content-Type", TIPOS[extname(ruta)] || "application/octet-stream");
    res.end(await readFile(ruta));
  } catch (e) {
    console.error(e);
    if (!res.headersSent) res.status(500).json({ error: "Error del servidor de desarrollo." });
  }
}).listen(PORT, "127.0.0.1", () => console.log(`Listo: http://localhost:${PORT}`));
