// Prueba integral de la puerta local: base local real (PostgreSQL), nube simulada sobre la base de prueba
// con las migraciones reales. Requiere: PG_BIN (initdb/pg_ctl), NUBE_DB (base de supabase/pruebas/correr.sh)
// y no correr como root (PostgreSQL no lo permite). En Windows, ZAMORAPP_POSTGREST apunta al PostgREST real.
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { simularNube } from "./simulador-nube.mjs";

const aqui = path.dirname(fileURLToPath(import.meta.url));
const raiz = path.resolve(aqui, "../..");
const NUBE_DB = process.env.NUBE_DB;
const postgrestReal = !!process.env.ZAMORAPP_POSTGREST; // en Windows el CI usa el real (no simula caídas)
const omitir = !NUBE_DB || !process.env.PG_BIN ? "Faltan NUBE_DB o PG_BIN" : false;

const datos = fs.mkdtempSync(path.join(os.tmpdir(), "zamorapp-"));
let nube, puerta, motor, estado, replicaObj, nubeObj, urlPuerta;
const CONTROL = crypto.randomBytes(24).toString("hex"); // la clave de control que el programa da a la puerta

async function pedir(ruta, { metodo = "GET", token, cuerpo } = {}) {
  const r = await fetch(`${urlPuerta}${ruta}`, {
    method: metodo,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  });
  const texto = await r.text();
  return { status: r.status, json: texto ? JSON.parse(texto) : null };
}

before(async () => {
  if (omitir) return;
  const simuladorPostgrest = path.join(datos, process.platform === "win32" ? "postgrest.cmd" : "postgrest.sh");
  if (!process.env.ZAMORAPP_POSTGREST) {
    fs.writeFileSync(simuladorPostgrest, `#!/bin/sh\nexec "${process.execPath}" "${path.join(aqui, "simulador-postgrest.mjs")}" "$1"\n`, { mode: 0o755 });
  }
  nube = simularNube({ baseUrl: NUBE_DB, usuarios: {
    "admin@x": { id: "00000000-0000-0000-0000-0000000000a1", clave: "clave-admin" },
    "meda@x": { id: "00000000-0000-0000-0000-0000000000a2", clave: "clave-med" },
  } });
  await new Promise((ok) => nube.servidor.listen(0, "127.0.0.1", ok));
  Object.assign(process.env, {
    ZAMORAPP_DATOS: datos,
    ZAMORAPP_NUBE_URL: `http://127.0.0.1:${nube.servidor.address().port}`,
    ZAMORAPP_NUBE_ANON: "anon-prueba",
    ZAMORAPP_LLAVE: crypto.randomBytes(32).toString("hex"),
    ZAMORAPP_PG_BIN: process.env.PG_BIN,
    ZAMORAPP_POSTGREST: process.env.ZAMORAPP_POSTGREST || simuladorPostgrest,
    ZAMORAPP_MIGRACIONES: path.join(raiz, "supabase/migrations"),
    ZAMORAPP_BASE_EXTRA: path.join(raiz, "escritorio/base"),
    ZAMORAPP_STUBS: path.join(raiz, "supabase/pruebas/00_stubs_supabase.sql"),
    PUERTO_BASE: "55329", PUERTO_POSTGREST: "55330",
  });
  const { Estado } = await import("../puerta/estado.mjs");
  const { Motor } = await import("../puerta/motor.mjs");
  const { Nube } = await import("../puerta/nube.mjs");
  const { Replica } = await import("../puerta/replica.mjs");
  const { crearPuerta } = await import("../puerta/servidor.mjs");
  const { CONFIG } = await import("../puerta/config.mjs");
  estado = new Estado(datos, CONFIG.llave);
  motor = new Motor(estado);
  await motor.iniciar();
  nubeObj = new Nube(estado);
  await nubeObj.comprobar();
  replicaObj = new Replica(estado, nubeObj, motor);
  puerta = crearPuerta({ estado, nube: nubeObj, motor, replica: replicaObj, origen: "http://127.0.0.1:54332", control: CONTROL });
  await new Promise((ok) => puerta.listen(0, "127.0.0.1", ok));
  urlPuerta = `http://127.0.0.1:${puerta.address().port}`;
}, { timeout: 240_000 });

after(async () => {
  puerta?.closeAllConnections?.();
  puerta?.close();
  motor?.detener();
  await nube?.cerrar();
  fs.rmSync(datos, { recursive: true, force: true });
});

let tokenAdmin, tokenMed;

test("entrar con internet y registrar la PC", { skip: omitir }, async () => {
  const r = await pedir("/auth/v1/token?grant_type=password", { metodo: "POST", cuerpo: { email: "admin@x", password: "clave-admin" } });
  assert.equal(r.status, 200);
  tokenAdmin = r.json.access_token;
  assert.equal((await pedir("/auth/v1/user", { token: tokenAdmin })).json.id, "00000000-0000-0000-0000-0000000000a1");
  const serie = "Q" + String.fromCharCode(65 + crypto.randomInt(22));
  const eq = await pedir("/zamorapp/equipo", { metodo: "POST", token: tokenAdmin, cuerpo: { nombre: "PC de prueba", serie } });
  assert.equal(eq.status, 200, JSON.stringify(eq.json));
  assert.ok(estado.d.equipo.secreto.length === 64);
});

test("clave equivocada con internet: la nube la rechaza", { skip: omitir }, async () => {
  const r = await pedir("/auth/v1/token?grant_type=password", { metodo: "POST", cuerpo: { email: "meda@x", password: "otra" } });
  assert.equal(r.status, 400);
});

test("primera copia completa a la PC", { skip: omitir }, async () => {
  await replicaObj.ciclo();
  assert.equal(replicaObj.error, null);
  assert.ok(estado.d.copiaCompleta);
  const c = new pg.Client({ connectionString: motor.url() });
  await c.connect();
  const { rows } = await c.query("select count(*)::int n from public.trabajadores");
  const cats = await c.query("select count(*)::int n from public.listas");
  await c.end();
  assert.ok(rows[0].n >= 2, `trabajadores locales: ${rows[0].n}`);
  assert.ok(cats.rows[0].n > 0);
});

test("con internet, la app lee de la nube", { skip: omitir }, async () => {
  const r = await pedir("/auth/v1/token?grant_type=password", { metodo: "POST", cuerpo: { email: "meda@x", password: "clave-med" } });
  assert.equal(r.status, 200);
  tokenMed = r.json.access_token;
  const t = await pedir("/rest/v1/trabajadores?select=*", { token: tokenMed });
  assert.equal(t.status, 200);
  assert.ok(t.json.every((f) => f.empresa_id === "20000000-0000-0000-0000-00000000000a"));
});

test("sin internet: consulta la copia local con las mismas reglas de acceso", { skip: omitir }, async () => {
  nube.estado.caida = true;
  await nubeObj.comprobar();
  assert.equal(nubeObj.enLinea, false);
  const t = await pedir("/rest/v1/trabajadores?select=*", { token: tokenMed });
  assert.equal(t.status, 200, JSON.stringify(t.json));
  assert.ok(t.json.length >= 1);
  assert.ok(t.json.every((f) => f.empresa_id === "20000000-0000-0000-0000-00000000000a"), "el médico de A no ve trabajadores de B");
});

test("sin internet: guardar se rechaza con un mensaje claro y los adjuntos esperan", { skip: omitir }, async () => {
  const w = await pedir("/rest/v1/trabajadores", { metodo: "POST", token: tokenMed, cuerpo: { cedula: "9" } });
  assert.equal(w.status, 503);
  assert.match(w.json.message, /solo se puede consultar/);
  const s = await pedir("/storage/v1/object/sign/adjuntos/x", { metodo: "POST", token: tokenMed, cuerpo: {} });
  assert.equal(s.status, 503);
});

test("sin internet: entra con su clave; con clave equivocada no", { skip: omitir }, async () => {
  const ok = await pedir("/auth/v1/token?grant_type=password", { metodo: "POST", cuerpo: { email: "meda@x", password: "clave-med" } });
  assert.equal(ok.status, 200);
  const mal = await pedir("/auth/v1/token?grant_type=password", { metodo: "POST", cuerpo: { email: "meda@x", password: "nop" } });
  assert.equal(mal.status, 400);
  const renovada = await pedir("/auth/v1/token?grant_type=refresh_token", { metodo: "POST", cuerpo: { refresh_token: ok.json.refresh_token } });
  assert.equal(renovada.status, 200);
  const reuso = await pedir("/auth/v1/token?grant_type=refresh_token", { metodo: "POST", cuerpo: { refresh_token: ok.json.refresh_token } });
  assert.equal(reuso.status, 400, "un token de renovación sirve una sola vez");
});

test("más de 7 días sin conexión: no entra hasta reconectar", { skip: omitir }, async () => {
  const u = estado.d.usuarios["00000000-0000-0000-0000-0000000000a2"];
  const antes = u.ultimoOnline;
  u.ultimoOnline = Date.now() - 8 * 864e5;
  const r = await pedir("/auth/v1/token?grant_type=password", { metodo: "POST", cuerpo: { email: "meda@x", password: "clave-med" } });
  u.ultimoOnline = antes;
  assert.equal(r.status, 400);
  assert.equal(r.json.error_code, "session_expired");
});

test("más de 7 días sin conexión: tampoco se renueva una sesión abierta", { skip: omitir }, async () => {
  const ok = await pedir("/auth/v1/token?grant_type=password", { metodo: "POST", cuerpo: { email: "meda@x", password: "clave-med" } });
  assert.equal(ok.status, 200);
  const u = estado.d.usuarios["00000000-0000-0000-0000-0000000000a2"];
  const antes = u.ultimoOnline;
  u.ultimoOnline = Date.now() - 8 * 864e5;
  const r = await pedir("/auth/v1/token?grant_type=refresh_token", { metodo: "POST", cuerpo: { refresh_token: ok.json.refresh_token } });
  u.ultimoOnline = antes;
  assert.equal(r.status, 400);
  assert.equal(r.json.error_code, "session_expired");
});

test("al volver internet, los cambios de la nube llegan a la PC", { skip: omitir }, async () => {
  nube.estado.caida = false;
  await nubeObj.comprobar();
  const nubeDb = new pg.Client({ connectionString: NUBE_DB });
  await nubeDb.connect();
  const nombre = `Ana ${Date.now()}`;
  await nubeDb.query("update public.trabajadores set nombres = $1 where id = '30000000-0000-0000-0000-00000000000a'", [nombre]);
  await nubeDb.end();
  await replicaObj.ciclo();
  assert.equal(replicaObj.error, null);
  const c = new pg.Client({ connectionString: motor.url() });
  await c.connect();
  const { rows } = await c.query("select nombres from public.trabajadores where id = '30000000-0000-0000-0000-00000000000a'");
  await c.end();
  assert.equal(rows[0].nombres, nombre);
});

test("sin sesión no se lee nada, y el estado en disco está cifrado", { skip: omitir }, async () => {
  assert.equal((await pedir("/rest/v1/trabajadores?select=*")).status, 401);
  const crudo = fs.readFileSync(path.join(datos, "estado.zamorapp"));
  assert.ok(!crudo.includes("admin@x") && !crudo.includes(estado.d.equipo.secreto));
  // Ningún archivo de la carpeta de datos (fuera de la base) guarda el secreto JWT ni la clave de PostgREST.
  assert.ok(!fs.existsSync(path.join(datos, "postgrest.conf")));
  for (const f of fs.readdirSync(datos).filter((n) => fs.statSync(path.join(datos, n)).isFile())) {
    const texto = fs.readFileSync(path.join(datos, f));
    assert.ok(!texto.includes(estado.d.jwtSecreto) && !texto.includes(estado.d.claveAutenticador), `secreto en ${f}`);
  }
});

test("solo atiende a esta PC: otro Host u otro origen se rechazan", { skip: omitir }, async () => {
  const puerto = new URL(urlPuerta).port;
  const http = await import("node:http");
  const pedirCrudo = (cabeceras) => new Promise((ok, mal) => {
    const r = http.request({ host: "127.0.0.1", port: puerto, path: "/zamorapp/estado", headers: cabeceras }, (res) => { res.resume(); ok(res.statusCode); });
    r.on("error", mal); r.end();
  });
  assert.equal(await pedirCrudo({ Host: "atacante.com" }), 403, "DNS rebinding");
  assert.equal(await pedirCrudo({ Host: `127.0.0.1:${puerto}`, Origin: "https://atacante.com" }), 403);
  assert.equal(await pedirCrudo({ Host: `127.0.0.1:${puerto}`, Origin: "http://127.0.0.1:54332" }), 200);
  assert.equal(await pedirCrudo({ Host: `127.0.0.1:${puerto}`, Origin: "http://localhost:54332" }), 200, "la ventana también puede estar en localhost");
  assert.equal(await pedirCrudo({ Host: `localhost:${puerto}` }), 200);
});

test("probar claves: tras 5 fallos el correo queda en espera", { skip: omitir }, async () => {
  const cuerpo = { email: "nadie@x", password: "mal" };
  for (let i = 0; i < 5; i++) {
    assert.equal((await pedir("/auth/v1/token?grant_type=password", { metodo: "POST", cuerpo })).status, 400);
  }
  const r = await pedir("/auth/v1/token?grant_type=password", { metodo: "POST", cuerpo });
  assert.equal(r.status, 429);
  assert.match(r.json.msg, /Demasiados intentos/);
});

test("clave cambiada o sesión revocada en la nube: sin internet ya no entra", { skip: omitir }, async () => {
  const medA = "00000000-0000-0000-0000-0000000000a2";
  const u = () => estado.d.usuarios[medA]; // entrar con internet reemplaza el registro
  // 1) La nube revoca la sesión (p. ej. cambió la clave desde la web): la PC lo nota al renovar.
  await replicaObj.enCurso;
  nube.usuarios._revocados = [medA];
  u().nube.expires_at = 0;
  await replicaObj.ciclo();
  assert.equal(u().requiereNube, true);
  assert.equal((await pedir("/rest/v1/trabajadores?select=*", { token: tokenMed })).status, 401, "sus sesiones locales se cortan");
  nube.estado.caida = true;
  await nubeObj.comprobar();
  const fuera = await pedir("/auth/v1/token?grant_type=password", { metodo: "POST", cuerpo: { email: "meda@x", password: "clave-med" } });
  assert.equal(fuera.status, 400);
  assert.equal(fuera.json.error_code, "session_expired");
  nube.estado.caida = false;
  await nubeObj.comprobar();
  nube.usuarios._revocados = [];
  // 2) Con internet, la nube rechaza la clave vieja que la PC aún aceptaría: la huella local deja de valer.
  const ok = await pedir("/auth/v1/token?grant_type=password", { metodo: "POST", cuerpo: { email: "meda@x", password: "clave-med" } });
  assert.equal(ok.status, 200);
  assert.equal(u().requiereNube, false);
  nube.usuarios["meda@x"].clave = "clave-nueva";
  const vieja = await pedir("/auth/v1/token?grant_type=password", { metodo: "POST", cuerpo: { email: "meda@x", password: "clave-med" } });
  assert.equal(vieja.status, 400);
  assert.equal(u().requiereNube, true);
  // 3) Entra con la clave nueva y todo vuelve a la normalidad.
  const nueva = await pedir("/auth/v1/token?grant_type=password", { metodo: "POST", cuerpo: { email: "meda@x", password: "clave-nueva" } });
  assert.equal(nueva.status, 200);
  assert.equal(u().requiereNube, false);
  tokenMed = nueva.json.access_token;
  nube.usuarios["meda@x"].clave = "clave-med";
});

test("Windows Hello: se activa con la sesión abierta y luego entra sin clave", { skip: omitir }, async () => {
  const ventana = (ruta) => fetch(`${urlPuerta}${ruta}`, { method: "POST", headers: { "X-Zamorapp-Control": CONTROL } }).then(async (r) => ({ status: r.status, json: await r.json() }));
  const medA = "00000000-0000-0000-0000-0000000000a2";
  const ok = await pedir("/auth/v1/token?grant_type=password", { metodo: "POST", cuerpo: { email: "meda@x", password: "clave-med" } });
  assert.equal(ok.status, 200);
  assert.equal((await pedir("/zamorapp/huella/estado")).json.usuarios, 0);
  assert.equal((await pedir("/zamorapp/huella/preparar", { metodo: "POST" })).status, 401, "sin sesión no se prepara");
  const prep = await pedir("/zamorapp/huella/preparar", { metodo: "POST", token: ok.json.access_token });
  assert.equal(prep.status, 200);
  // Solo la ventana (con la clave de control) confirma que Windows verificó la huella
  const sinControl = await fetch(`${urlPuerta}/zamorapp/huella/activar?codigo=${prep.json.codigo}`, { method: "POST", headers: { "X-Zamorapp-Control": "x".repeat(48) } });
  assert.equal(sinControl.status, 403);
  assert.equal((await ventana(`/zamorapp/huella/activar?codigo=${prep.json.codigo}`)).json.ok, true);
  assert.equal((await ventana(`/zamorapp/huella/activar?codigo=${prep.json.codigo}`)).json.ok, false, "el código sirve una vez");
  assert.equal((await pedir("/zamorapp/huella/estado")).json.usuarios, 1);
  assert.equal((await pedir("/zamorapp/huella/mia", { token: ok.json.access_token })).json.activa, true);
  // La dirección que intercepta la ventana: si llega a la puerta, no cambia la página
  assert.equal((await fetch(`${urlPuerta}/zamorapp/huella/ventana/entrar`)).status, 204);
  // Entrar: Windows verificó → código de un solo uso → sesión local
  const v = await ventana("/zamorapp/huella/entrar");
  assert.equal(v.json.ok, true, JSON.stringify(v.json));
  assert.equal((await pedir("/auth/v1/token?grant_type=hello", { metodo: "POST", cuerpo: { codigo: "inventado" } })).status, 400);
  const s = await pedir("/auth/v1/token?grant_type=hello", { metodo: "POST", cuerpo: { codigo: v.json.codigo } });
  assert.equal(s.status, 200);
  assert.equal((await pedir("/auth/v1/user", { token: s.json.access_token })).json.id, medA);
  assert.equal((await pedir("/auth/v1/token?grant_type=hello", { metodo: "POST", cuerpo: { codigo: v.json.codigo } })).status, 400, "el código sirve una vez");
  // Sin internet también entra
  nube.estado.caida = true;
  await nubeObj.comprobar();
  const sinRed = await ventana("/zamorapp/huella/entrar");
  assert.equal(sinRed.json.ok, true);
  // ...pero no tras más de 7 días sin conexión
  const antes = estado.d.usuarios[medA].ultimoOnline;
  estado.d.usuarios[medA].ultimoOnline = Date.now() - 8 * 864e5;
  const viejo = await ventana("/zamorapp/huella/entrar");
  estado.d.usuarios[medA].ultimoOnline = antes;
  assert.equal(viejo.json.ok, false);
  assert.match(viejo.json.mensaje, /7 días/);
  nube.estado.caida = false;
  await nubeObj.comprobar();
});

test("Windows Hello: clave cambiada en la nube o huella quitada → vuelve a pedir la contraseña", { skip: omitir }, async () => {
  const ventana = (ruta) => fetch(`${urlPuerta}${ruta}`, { method: "POST", headers: { "X-Zamorapp-Control": CONTROL } }).then(async (r) => ({ status: r.status, json: await r.json() }));
  const medA = "00000000-0000-0000-0000-0000000000a2";
  nubeObj.exigirNube(medA);
  const r = await ventana("/zamorapp/huella/entrar");
  assert.equal(r.json.ok, false);
  assert.match(r.json.mensaje, /contraseña/);
  const ok = await pedir("/auth/v1/token?grant_type=password", { metodo: "POST", cuerpo: { email: "meda@x", password: "clave-med" } });
  assert.equal((await ventana("/zamorapp/huella/entrar")).json.ok, true, "tras entrar con la clave, la huella vuelve a servir");
  assert.equal((await pedir("/zamorapp/huella/quitar", { metodo: "POST", token: ok.json.access_token })).status, 200);
  assert.equal((await pedir("/zamorapp/huella/estado")).json.usuarios, 0);
  assert.equal((await ventana("/zamorapp/huella/entrar")).json.ok, false);
});

test("la ventana de la app puede llamar a la puerta (CORS con las cabeceras de supabase-js)", { skip: omitir }, async () => {
  const pedidas = "apikey,authorization,content-type,x-client-info,x-supabase-api-version";
  const r = await fetch(`${urlPuerta}/auth/v1/token?grant_type=password`, { method: "OPTIONS", headers: {
    Origin: "http://127.0.0.1:54332", "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": pedidas } });
  assert.equal(r.status, 204);
  assert.equal(r.headers.get("access-control-allow-origin"), "http://127.0.0.1:54332");
  for (const h of pedidas.split(",")) assert.ok(r.headers.get("access-control-allow-headers").includes(h), `falta ${h}`);
});

test("recuperar clave: el enlace del correo abre la app web, no la PC", { skip: omitir }, async () => {
  const r = await pedir(`/auth/v1/recover?redirect_to=${encodeURIComponent("http://127.0.0.1:54332/login/nueva-clave")}`, { metodo: "POST", cuerpo: { email: "meda@x" } });
  assert.equal(r.status, 200);
  assert.equal(nube.estado.ultimoRecuperar, "https://zamorapp-ocupacional.vercel.app/login/nueva-clave");
});

test("sincronizar ahora: solo con la clave de control de la ventana", { skip: omitir }, async () => {
  const llamar = (clave) => fetch(`${urlPuerta}/zamorapp/sincronizar`, { method: "POST", headers: clave ? { "X-Zamorapp-Control": clave } : {} });
  assert.equal((await llamar()).status, 403);
  assert.equal((await llamar("otra")).status, 403);
  const r = await llamar(CONTROL);
  assert.equal(r.status, 200);
  const j = await r.json();
  assert.equal(j.enLinea, true);
  assert.equal(j.error, null);
  assert.ok(j.ultimaSincronia);
});

test("usuario desactivado en la nube: queda bloqueado en la PC", { skip: omitir }, async () => {
  const nubeDb = new pg.Client({ connectionString: NUBE_DB });
  await nubeDb.connect();
  const medA = "00000000-0000-0000-0000-0000000000a2";
  try {
    await replicaObj.enCurso; // entrar con internet dispara un ciclo en segundo plano: que no se cruce con este
    await nubeDb.query("update public.miembros set activo = false where usuario_id = $1", [medA]);
    estado.d.usuarios[medA].ultimoOnline = Date.now(); // que sea el usuario de la sincronía
    await replicaObj.ciclo();
    assert.equal(estado.d.usuarios[medA].bloqueado, true);
    assert.equal((await pedir("/rest/v1/trabajadores?select=*", { token: tokenMed })).status, 401);
    nube.estado.caida = true;
    await nubeObj.comprobar();
    const r = await pedir("/auth/v1/token?grant_type=password", { metodo: "POST", cuerpo: { email: "meda@x", password: "clave-med" } });
    assert.equal(r.status, 400, "tampoco entra sin internet");
  } finally {
    nube.estado.caida = false;
    await nubeDb.query("update public.miembros set activo = true where usuario_id = $1", [medA]);
    await nubeDb.end();
  }
});

// En Windows PostgREST se caía a veces en su primer segundo (código 3): el motor debe relanzarlo solo
test("si PostgREST se cae, se vuelve a lanzar solo (también si cae al arrancar)", { skip: omitir }, async () => {
  const marca = path.join(datos, "caer-postgrest");
  if (!postgrestReal) fs.writeFileSync(marca, "2"); // los dos próximos arranques del simulador se caen con código 3
  process.env.SIMULAR_CAIDA_POSTGREST = marca;
  try {
    motor.hijos.find((h) => h.spawnargs.some((a) => /postgrest/.test(a)))?.kill();
    await new Promise((r) => setTimeout(r, 500));
    await motor.relanzando;
    assert.ok(!fs.existsSync(marca), "pasó por las dos caídas");
    const r = await pedir("/rest/v1/trabajadores?select=*", { token: tokenAdmin });
    assert.equal(r.status, 200);
  } finally {
    delete process.env.SIMULAR_CAIDA_POSTGREST;
  }
});

// Una base que quedó viva de una sesión anterior (cierre a la fuerza o versión instalada encima) no impide abrir
test("si quedó abierta la base de una sesión anterior, el programa igual arranca", { skip: omitir }, async () => {
  const { Motor } = await import("../puerta/motor.mjs");
  const otro = new Motor(estado); // la base de "motor" sigue viva, como tras un cierre a la fuerza
  try {
    await otro.iniciar();
    const r = await fetch(`http://127.0.0.1:${otro.puertoPostgrest}/`);
    assert.ok(r.status < 500);
  } finally {
    otro.detener();
    motor.deteniendo = true;
    motor.baseIniciada = false; // ya la detuvo "otro"
  }
});
