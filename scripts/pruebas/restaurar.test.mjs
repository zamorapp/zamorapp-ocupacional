// Prueba de restauración: respalda la base de prueba, la daña en una copia y la restaura idéntica.
// Uso: RESPALDO_PRUEBA_DB=postgresql://postgres@127.0.0.1:5499/zamorapp_prueba node --test scripts/pruebas/restaurar.test.mjs
//      (la base la deja lista supabase/pruebas/correr.sh)
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import zlib from "node:zlib";
import pg from "pg";

const BASE = process.env.RESPALDO_PRUEBA_DB;
const script = (n) => fileURLToPath(new URL(`../${n}`, import.meta.url));
// Los scripts verifican el certificado de Supabase: hacia esta máquina se les pide sin SSL
const sinSsl = (url) => { const u = new URL(url); u.searchParams.set("sslmode", "disable"); return u.toString(); };
const node = (archivo, args, url) =>
  spawnSync(process.execPath, [script(archivo), ...args], { env: { ...process.env, DATABASE_URL: sinSsl(url) }, encoding: "utf8" });

async function consultar(url, sql, params) {
  const c = new pg.Client({ connectionString: url });
  await c.connect();
  try { return (await c.query(sql, params)).rows; } finally { await c.end(); }
}

// Huella de cada tabla: mismo contenido fila por fila
const huellas = (url, tablas) =>
  Promise.all(tablas.map(async (t) => {
    const [e, n] = t.split(".");
    const [r] = await consultar(url, `select count(*)::int as n, md5(coalesce(string_agg(x::text, '|' order by x::text), '')) as h from "${e}"."${n}" x`);
    return `${t}:${r.n}:${r.h}`;
  }));

test("restaura un respaldo real completo e idéntico, y --verificar detecta faltantes", { skip: !BASE && "falta RESPALDO_PRUEBA_DB" }, async () => {
  const carpeta = fs.mkdtempSync(path.join(os.tmpdir(), "restaurar-"));
  const r = node("respaldo.mjs", [carpeta], BASE);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const archivo = path.join(carpeta, fs.readdirSync(carpeta).find((f) => f.endsWith(".json.gz")));

  // Copia de la base con la misma estructura, dañada: se borran consultas y pacientes, se cambia un dato
  const destinoNombre = `zamorapp_restaurada_${process.pid}`;
  const admin = new URL(BASE);
  admin.pathname = "/postgres";
  await consultar(admin.toString(), `create database ${destinoNombre} template ${new URL(BASE).pathname.slice(1)}`);
  const destino = new URL(BASE);
  destino.pathname = `/${destinoNombre}`;
  try {
    await consultar(destino.toString(), "set session_replication_role = replica; delete from clinico.consultas; delete from public.trabajadores; update public.empresas set razon_social = 'DAÑADA'");

    const v = node("restaurar.mjs", [archivo, "--verificar"], destino.toString());
    assert.equal(v.status, 1, "la verificación debe detectar las filas que faltan");
    assert.match(v.stderr, /INCOMPLETA/);

    const x = node("restaurar.mjs", [archivo], destino.toString());
    assert.equal(x.status, 0, x.stdout + x.stderr);
    assert.match(x.stdout, /Restauración completa/);

    // public.respaldos cambia después del volcado (anota el propio respaldo): se compara el resto
    const tablas = Object.keys(JSON.parse(zlib.gunzipSync(fs.readFileSync(archivo))).tablas).filter((t) => t !== "public.respaldos");
    assert.deepEqual(await huellas(destino.toString(), tablas), await huellas(BASE, tablas));

    // Las secuencias siguen después del último id: se puede seguir trabajando sin choques
    await consultar(destino.toString(), "insert into public.respaldos (estado) values ('ok')");
  } finally {
    await consultar(admin.toString(), `drop database if exists ${destinoNombre} with (force)`);
  }
});

test("no escribe en la nube sin confirmación expresa", () => {
  const carpeta = fs.mkdtempSync(path.join(os.tmpdir(), "restaurar-"));
  const archivo = path.join(carpeta, "r.json.gz");
  fs.writeFileSync(archivo, zlib.gzipSync(JSON.stringify({ fecha: "x", tablas: {} })));
  const r = spawnSync(process.execPath, [script("restaurar.mjs"), archivo], {
    env: { ...process.env, DATABASE_URL: "postgresql://postgres.x:y@aws-1-us-west-2.pooler.supabase.com:6543/postgres" }, encoding: "utf8" });
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /RESTAURAR_EN_LA_NUBE/);
});

