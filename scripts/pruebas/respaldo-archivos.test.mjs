// Respaldo de archivos: pase de un solo uso, copia incremental, ruta segura y puesta al día de Drive.
// Uso: RESPALDO_PRUEBA_DB=postgresql://postgres@127.0.0.1:5499/zamorapp_prueba node --test scripts/pruebas/respaldo-archivos.test.mjs
//      (la base la deja lista supabase/pruebas/correr.sh). La función de Supabase se imita con un servidor local
//      que canjea el pase y lista los archivos con las mismas funciones de la base.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import pg from "pg";

const BASE = process.env.RESPALDO_PRUEBA_DB;
const SCRIPT = fileURLToPath(new URL("../respaldo-archivos.mjs", import.meta.url));
const sinSsl = (url) => { const u = new URL(url); u.searchParams.set("sslmode", "disable"); return u.toString(); };

async function sql(texto, params) {
  const c = new pg.Client({ connectionString: BASE });
  await c.connect();
  try { return (await c.query(texto, params)).rows; } finally { await c.end(); }
}

// Contenido de cada archivo de mentira; «dañado» responde con menos bytes de los anunciados
const contenidos = new Map();
async function funcionFalsa() {
  const pases = [];
  const servidor = http.createServer(async (req, res) => {
    if (req.method === "GET") {
      const nombre = decodeURIComponent(req.url.slice(1));
      return res.end(nombre.endsWith("danado.pdf") ? "x" : contenidos.get(nombre) ?? "");
    }
    let cuerpo = "";
    for await (const t of req) cuerpo += t;
    const { pase, desde } = JSON.parse(cuerpo);
    pases.push(pase);
    const [{ ok }] = await sql("select public.canjear_pase_respaldo($1) as ok", [pase]);
    if (!ok) { res.statusCode = 403; return res.end(JSON.stringify({ error: "Pase inválido" })); }
    const filas = await sql("select * from public.archivos_para_respaldo($1) where nombre like 'prueba/%'", [desde]);
    const { port } = servidor.address();
    res.end(JSON.stringify({ archivos: filas.map((f) => ({ ...f, cambiado: f.cambiado.toISOString(), url: `http://127.0.0.1:${port}/${encodeURIComponent(f.nombre)}` })) }));
  });
  await new Promise((r) => servidor.listen(0, "127.0.0.1", r));
  return { servidor, pases, url: `http://127.0.0.1:${servidor.address().port}/` };
}

function correr(funcion, carpetas) {
  return new Promise((ok) => {
    const p = spawn(process.execPath, [SCRIPT, ...carpetas], { env: { ...process.env, DATABASE_URL: sinSsl(BASE), RESPALDO_FUNCION_URL: funcion } });
    let salida = "";
    p.stdout.on("data", (d) => (salida += d));
    p.stderr.on("data", (d) => (salida += d));
    p.on("close", (codigo) => ok({ codigo, salida }));
  });
}

async function subir(nombre, texto, hace = "0 minutes") {
  contenidos.set(nombre, texto);
  await sql(`insert into storage.objects (bucket_id, name, updated_at, metadata) values ('adjuntos', $1, now() - $3::interval, jsonb_build_object('size', $2::int))`,
    [nombre, Buffer.byteLength(texto), hace]);
}

test("baja solo lo nuevo, lo copia a Drive, nunca sale de la carpeta y no reutiliza pases", { skip: !BASE && "falta RESPALDO_PRUEBA_DB" }, async () => {
  for (const col of ["created_at", "updated_at"]) await sql(`alter table storage.objects add column if not exists ${col} timestamptz default now()`);
  await sql("alter table storage.objects add column if not exists metadata jsonb");
  await sql("delete from storage.objects where name like 'prueba/%'");
  const pc = fs.mkdtempSync(path.join(os.tmpdir(), "archivos-pc-"));
  const drive = fs.mkdtempSync(path.join(os.tmpdir(), "archivos-drive-"));
  const f = await funcionFalsa();
  try {
    await subir("prueba/org/t1/examen.pdf", "PDF-1", "2 hours");
    await subir("prueba/org/t1/firma.png", "PNG-22", "1 hour");

    let r = await correr(f.url, [pc, drive]);
    assert.equal(r.codigo, 0, r.salida);
    assert.match(r.salida, /Archivos \(ok\): 2 nuevos o cambiados, 2 en total, 2 copiados a Drive/);
    assert.equal(fs.readFileSync(path.join(pc, "archivos/adjuntos/prueba/org/t1/examen.pdf"), "utf8"), "PDF-1");
    assert.equal(fs.readFileSync(path.join(drive, "archivos/adjuntos/prueba/org/t1/firma.png"), "utf8"), "PNG-22");

    // Segunda vez: nada nuevo; luego uno nuevo, uno dañado y uno con una ruta que intenta salir de la carpeta
    r = await correr(f.url, [pc, drive]);
    assert.match(r.salida, /0 nuevos o cambiados, 2 en total/);
    await subir("prueba/org/t2/nuevo.pdf", "NUEVO");
    await subir("prueba/org/t2/danado.pdf", "COMPLETO");
    await subir("prueba/../../fuera.txt", "MALO");
    r = await correr(f.url, [pc]);
    assert.match(r.salida, /Archivos \(aviso\): 1 nuevos o cambiados, 3 en total/);
    assert.match(r.salida, /danado\.pdf: tamaño 1 en vez de 8/);
    assert.match(r.salida, /fuera\.txt: ruta no permitida/);
    assert.match(r.salida, /quedaron solo en la PC/);
    assert.equal(fs.existsSync(path.join(pc, "fuera.txt")) || fs.existsSync(path.join(os.tmpdir(), "fuera.txt")), false);
    assert.equal(fs.existsSync(path.join(pc, "archivos/adjuntos/prueba/org/t2/danado.pdf")), false);

    // Lo que falló se vuelve a pedir: la fecha no avanzó
    const indice = JSON.parse(fs.readFileSync(path.join(pc, "archivos/indice.json"), "utf8"));
    assert.ok(new Date(indice.hasta) < new Date(Date.now() - 30 * 60_000));
    // Drive se pone al día con lo que bajó mientras estaba cerrado
    r = await correr(f.url, [pc, drive]);
    assert.equal(fs.readFileSync(path.join(drive, "archivos/adjuntos/prueba/org/t2/nuevo.pdf"), "utf8"), "NUEVO");

    // Un pase ya usado no sirve
    const [{ ok }] = await sql("select public.canjear_pase_respaldo($1) as ok", [f.pases[0]]);
    assert.equal(ok, false);
    const [{ n }] = await sql("select count(*)::int as n from public.respaldos where tipo = 'archivos'");
    assert.ok(n >= 4);
  } finally {
    f.servidor.close();
    await sql("delete from storage.objects where name like 'prueba/%'");
    fs.rmSync(pc, { recursive: true, force: true });
    fs.rmSync(drive, { recursive: true, force: true });
  }
});

test("sin función disponible anota el fallo y termina con error", { skip: !BASE && "falta RESPALDO_PRUEBA_DB" }, async () => {
  const pc = fs.mkdtempSync(path.join(os.tmpdir(), "archivos-pc-"));
  const r = await correr("http://127.0.0.1:9/", [pc]);
  assert.notEqual(r.codigo, 0);
  const [u] = await sql("select estado, detalle from public.respaldos where tipo = 'archivos' order by id desc limit 1");
  assert.equal(u.estado, "fallo");
  assert.match(u.detalle, /No se pudo pedir la lista de archivos/);
  fs.rmSync(pc, { recursive: true, force: true });
});
