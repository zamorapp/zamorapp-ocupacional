// Prueba semanal de restauración: con un PostgreSQL de verdad monta la base temporal, restaura, anota y lo borra todo.
// Uso: RESPALDO_PRUEBA_DB=postgresql://postgres@127.0.0.1:5499/zamorapp_prueba ZAMORAPP_PG_BIN=/usr/lib/postgresql/16/bin \
//      node --test scripts/pruebas/probar-restauracion.test.mjs   (no como root: initdb no lo permite)
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import pg from "pg";

const BASE = process.env.RESPALDO_PRUEBA_DB;
const PG_BIN = process.env.ZAMORAPP_PG_BIN;
const falta = !BASE ? "falta RESPALDO_PRUEBA_DB" : !PG_BIN ? "falta ZAMORAPP_PG_BIN" : process.getuid?.() === 0 && "initdb no corre como root";
const script = (n) => fileURLToPath(new URL(`../${n}`, import.meta.url));
const sinSsl = (url) => { const u = new URL(url); u.searchParams.set("sslmode", "disable"); return u.toString(); };
const node = (archivo, args, env = {}) =>
  spawnSync(process.execPath, [script(archivo), ...args], { env: { ...process.env, DATABASE_URL: sinSsl(BASE), ...env }, encoding: "utf8" });

async function ultimaRestauracion() {
  const c = new pg.Client({ connectionString: BASE });
  await c.connect();
  try {
    return (await c.query("select estado, archivo, tablas, filas from public.respaldos where tipo = 'restauracion' order by id desc limit 1")).rows[0];
  } finally { await c.end(); }
}

test("restaura el último respaldo en una base temporal, lo anota y no deja nada", { skip: falta }, async () => {
  const carpeta = fs.mkdtempSync(path.join(os.tmpdir(), "probar-restauracion-"));
  const temporal = path.join(carpeta, "prueba");
  assert.equal(node("respaldo.mjs", [carpeta]).status, 0);
  const archivo = path.join(carpeta, fs.readdirSync(carpeta).find((f) => f.endsWith(".json.gz")));
  const r = node("probar-restauracion.mjs", [archivo, temporal], { ZAMORAPP_PG_BIN: PG_BIN });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /Prueba de restauración \(ok\)/);
  assert.equal(fs.existsSync(temporal), false, "la base temporal debe quedar borrada");
  const anotada = await ultimaRestauracion();
  assert.equal(anotada.estado, "ok");
  assert.equal(anotada.archivo, path.basename(archivo));
  assert.ok(anotada.tablas > 30 && anotada.filas > 0);
  fs.rmSync(carpeta, { recursive: true, force: true });
});

test("un respaldo dañado se anota como fallo y también limpia", { skip: falta }, async () => {
  const carpeta = fs.mkdtempSync(path.join(os.tmpdir(), "probar-restauracion-"));
  const archivo = path.join(carpeta, "respaldo-2026-01-01-00-00-00.json.gz");
  fs.writeFileSync(archivo, "no es un respaldo");
  const r = node("probar-restauracion.mjs", [archivo, path.join(carpeta, "prueba")], { ZAMORAPP_PG_BIN: PG_BIN });
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.equal(fs.existsSync(path.join(carpeta, "prueba")), false);
  assert.equal((await ultimaRestauracion()).estado, "fallo");
  fs.rmSync(carpeta, { recursive: true, force: true });
});

test("con poca memoria libre la pospone sin anotar nada", { skip: falta }, () => {
  const r = node("probar-restauracion.mjs", ["x.json.gz", path.join(os.tmpdir(), "nunca")], { ZAMORAPP_PG_BIN: PG_BIN, RESTAURACION_MEMORIA_MB: "999999999" });
  assert.equal(r.status, 3, r.stdout + r.stderr);
  assert.match(r.stdout, /pospuesta/);
});
