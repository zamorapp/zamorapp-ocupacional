// Respaldo diario ante cortes del pooler de Supabase (ECONNRESET).
// Uso: node --test scripts/pruebas/   (la segunda prueba necesita la base de correr.sh:
//      RESPALDO_PRUEBA_DB=postgresql://postgres@127.0.0.1:5499/zamorapp_prueba)
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import pg from "pg";

const SCRIPT = fileURLToPath(new URL("../respaldo.mjs", import.meta.url));
const BASE = process.env.RESPALDO_PRUEBA_DB;

// Servidor intermedio: corta (RST) las conexiones que decida «cortar» y reenvía las demás a la base
async function intermedio(cortar, destino) {
  let n = 0;
  const servidor = net.createServer((s) => {
    const k = ++n;
    s.on("error", () => {});
    const plan = cortar(k);
    if (plan === "ya") return s.resetAndDestroy();
    const d = net.connect(destino.port, destino.host);
    d.on("error", () => s.destroy());
    let mensajes = 0;
    s.on("data", (b) => {
      d.write(b);
      // corta en medio de la lectura de tablas, como el pooler a las 20:13
      if (typeof plan === "number" && ++mensajes === plan) setTimeout(() => { s.resetAndDestroy(); d.destroy(); }, 50);
    });
    d.on("data", (b) => s.writable && s.write(b));
  });
  await new Promise((r) => servidor.listen(0, "127.0.0.1", r));
  return { puerto: servidor.address().port, conexiones: () => n, cerrar: () => servidor.close() };
}

function correr(url, carpeta) {
  return new Promise((r) => {
    const p = spawn(process.execPath, [SCRIPT, carpeta], { env: { ...process.env, DATABASE_URL: url, RESPALDO_ESPERA_MS: "100" } });
    let salida = "";
    p.stdout.on("data", (b) => (salida += b));
    p.stderr.on("data", (b) => (salida += b));
    p.on("close", (codigo) => r({ codigo, salida }));
  });
}

test("sin base: reintenta 3 veces, no revienta y termina con falla", async () => {
  const srv = await intermedio(() => "ya");
  const carpeta = fs.mkdtempSync(path.join(os.tmpdir(), "respaldo-"));
  const r = await correr(`postgresql://x:y@127.0.0.1:${srv.puerto}/postgres?sslmode=disable`, carpeta);
  srv.cerrar();
  assert.notEqual(r.codigo, 0);
  assert.doesNotMatch(r.salida, /Unhandled 'error' event/);
  assert.match(r.salida, /Intento 3 de 3/);
  assert.equal(srv.conexiones(), 5, "3 lecturas + 2 intentos de anotar el fallo");
  assert.deepEqual(fs.readdirSync(carpeta), []);
});

test("corte en medio de la lectura: el segundo intento guarda el respaldo y lo anota ok", { skip: !BASE && "falta RESPALDO_PRUEBA_DB" }, async () => {
  const u = new URL(BASE);
  const srv = await intermedio((k) => (k === 1 ? 8 : null), { host: u.hostname, port: Number(u.port || 5432) });
  const carpeta = fs.mkdtempSync(path.join(os.tmpdir(), "respaldo-"));
  const url = new URL(BASE);
  url.port = String(srv.puerto);
  url.searchParams.set("sslmode", "disable");
  const r = await correr(url.toString(), carpeta);
  srv.cerrar();
  assert.equal(r.codigo, 0, r.salida);
  assert.doesNotMatch(r.salida, /Unhandled 'error' event/);
  assert.match(r.salida, /Intento 1 de 3/);
  assert.equal(fs.readdirSync(carpeta).filter((f) => f.endsWith(".json.gz")).length, 1);
  const c = new pg.Client({ connectionString: BASE });
  await c.connect();
  const { rows: [x] } = await c.query("select estado, destinos from public.respaldos order by id desc limit 1");
  await c.end();
  assert.equal(x.estado, "aviso"); // una sola carpeta: «aviso» (Google Drive no estaba)
  assert.equal(x.destinos, 1);
});
