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
let nube, puerta, motor, estado, replicaObj, nubeObj, bandejaObj, bloquesObj, respaldoObj, urlPuerta, CONFIG;
const lineas = []; // lo que la puerta anota en puerta.log
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
    "meda@x": { id: "00000000-0000-0000-0000-0000000000a2", clave: "clave-med", usuario: "richard" },
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
  const { Bandeja } = await import("../puerta/bandeja.mjs");
  const { Bloques } = await import("../puerta/bloques.mjs");
  const { Respaldo } = await import("../puerta/respaldo.mjs");
  const { crearPuerta } = await import("../puerta/servidor.mjs");
  ({ CONFIG } = await import("../puerta/config.mjs"));
  estado = new Estado(datos, CONFIG.llave);
  motor = new Motor(estado);
  await motor.iniciar();
  nubeObj = new Nube(estado);
  await nubeObj.comprobar();
  replicaObj = new Replica(estado, nubeObj, motor);
  bandejaObj = new Bandeja(estado, nubeObj, motor, replicaObj, process.env.DEPURAR_BANDEJA ? (m) => console.error(m) : undefined);
  bloquesObj = new Bloques(estado, nubeObj, motor, replicaObj);
  respaldoObj = new Respaldo({ estado, nube: nubeObj, motor, replica: replicaObj, sincronizar: async () => { await nubeObj.comprobar(); await bandejaObj.subir(); await replicaObj.ciclo(); } });
  puerta = crearPuerta({ estado, nube: nubeObj, motor, replica: replicaObj, bandeja: bandejaObj, bloques: bloquesObj, respaldo: respaldoObj, origen: "http://127.0.0.1:54332", control: CONTROL, registro: (l) => lineas.push(l) });
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
  // Dos letras al azar: el banco local conserva los equipos de corridas anteriores y una sola letra chocaba
  const serie = String.fromCharCode(65 + crypto.randomInt(22)) + String.fromCharCode(65 + crypto.randomInt(26));
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
  const t = await pedir("/rest/v1/trabajadores?select=id,empresa_id", { token: tokenMed });
  assert.equal(t.status, 200);
  assert.ok(t.json.every((f) => f.empresa_id === "20000000-0000-0000-0000-00000000000a"));
});

test("con internet y la copia al día: las lecturas salen de la copia local, sin ir a la nube", { skip: omitir }, async () => {
  await replicaObj.ciclo();
  assert.equal(replicaObj.error, null);
  const e = await pedir("/zamorapp/estado");
  assert.equal(e.json.lecturaLocal, true);
  nube.estado.rest = [];
  const t = await pedir("/rest/v1/trabajadores?select=id,empresa_id", { token: tokenMed });
  assert.equal(t.status, 200);
  assert.ok(t.json.length >= 1);
  assert.ok(t.json.every((f) => f.empresa_id === "20000000-0000-0000-0000-00000000000a"), "la copia aplica las mismas reglas de acceso");
  assert.ok(!nube.estado.rest.includes("/rest/v1/trabajadores"), `fue a la nube: ${nube.estado.rest.join(", ")}`);
  // Una función de lectura (stable) también sale de la copia
  const f = await pedir("/rest/v1/rpc/trabajadores_por_empresa", { metodo: "POST", token: tokenMed, cuerpo: {} });
  assert.equal(f.status, 200);
  assert.ok(!nube.estado.rest.includes("/rest/v1/rpc/trabajadores_por_empresa"));
});

test("lo que la copia no trae se lee de la nube aunque la copia esté al día (accesos, embebidos)", { skip: omitir }, async () => {
  nube.estado.rest = [];
  const a = await pedir("/rest/v1/accesos?select=id&limit=1", { token: tokenAdmin });
  assert.notEqual(a.status, 404);
  assert.ok(nube.estado.rest.includes("/rest/v1/accesos"), "accesos no está en la copia: va a la nube");
  nube.estado.rest = [];
  await pedir("/rest/v1/trabajadores?select=id,accesos(id)&limit=1", { token: tokenAdmin });
  assert.ok(nube.estado.rest.includes("/rest/v1/trabajadores"), "un embebido que la copia no trae manda toda la lectura a la nube");
  nube.estado.rest = [];
  await pedir("/rest/v1/trabajadores?select=id,empresa:empresas(nombre)&limit=1", { token: tokenAdmin });
  assert.ok(!nube.estado.rest.includes("/rest/v1/trabajadores"), "con todo en la copia, sigue en local");
  nube.estado.rest = [];
  await pedir("/rest/v1/trabajadores?select=id,...accesos(id)&limit=1", { token: tokenAdmin });
  assert.ok(nube.estado.rest.includes("/rest/v1/trabajadores"), "un embebido con ... (spread) también se ve");
  nube.estado.rest = [];
  await pedir("/rest/v1/rpc/miembros_con_correo", { metodo: "POST", token: tokenAdmin, cuerpo: {} });
  assert.ok(nube.estado.rest.includes("/rest/v1/rpc/miembros_con_correo"), "una función de lectura que usa datos fuera de la copia va a la nube");
  nube.estado.rest = [];
  await pedir("/rest/v1/ultima_aptitud?select=trabajador_id&limit=1", { token: tokenAdmin });
  assert.ok(!nube.estado.rest.includes("/rest/v1/ultima_aptitud"), "una vista sobre tablas de la copia se lee en local");
});

test("tras guardar en la nube se lee de la nube hasta que el cambio baja; luego otra vez de la copia", { skip: omitir }, async () => {
  nube.estado.rest = [];
  // Una escritura (aunque la nube la rechace por datos incompletos) va a la nube y marca «hay cambios por bajar»
  const w = await pedir("/rest/v1/miembros", { metodo: "POST", token: tokenAdmin, cuerpo: { rol: "x" } });
  assert.notEqual(w.status, 503);
  assert.ok(nube.estado.rest.includes("/rest/v1/miembros"));
  await replicaObj.enCurso; // la escritura disparó una sincronía
  // Mientras una sincronía posterior no termine, la lectura va a la nube
  const ciclo = replicaObj.inicioCiclo;
  replicaObj.inicioCiclo = 0;
  nube.estado.rest = [];
  const r1 = await pedir("/rest/v1/trabajadores?select=id", { token: tokenAdmin });
  assert.equal(r1.status, 200);
  assert.ok(nube.estado.rest.includes("/rest/v1/trabajadores"), "con una escritura en la nube pendiente de bajar se lee de la nube");
  assert.equal((await pedir("/zamorapp/estado")).json.lecturaLocal, false);
  replicaObj.inicioCiclo = ciclo;
  await replicaObj.ciclo();
  nube.estado.rest = [];
  const r2 = await pedir("/rest/v1/trabajadores?select=id", { token: tokenAdmin });
  assert.equal(r2.status, 200);
  assert.ok(!nube.estado.rest.includes("/rest/v1/trabajadores"), "tras la sincronía se vuelve a leer de la copia");
});

test("copia vieja (más de 1 min) o con error: se lee de la nube", { skip: omitir }, async () => {
  const guardada = replicaObj.ultimaMs;
  replicaObj.ultimaMs = performance.now() - 120_000;
  nube.estado.rest = [];
  const r = await pedir("/rest/v1/trabajadores?select=id", { token: tokenAdmin });
  assert.equal(r.status, 200);
  assert.ok(nube.estado.rest.includes("/rest/v1/trabajadores"), "copia vieja: va a la nube");
  replicaObj.ultimaMs = guardada;
  replicaObj.error = "prueba";
  nube.estado.rest = [];
  await pedir("/rest/v1/trabajadores?select=id", { token: tokenAdmin });
  assert.ok(nube.estado.rest.includes("/rest/v1/trabajadores"), "sincronía con error: va a la nube");
  replicaObj.error = null;
});

// ─── Fase A: local primero ───
const TRAB = "30000000-0000-0000-0000-00000000000a";
const CONSULTA_MED = "40000000-0000-0000-0000-0000000000d2"; // borrador del médico A
async function enBase(url, sql, params = []) {
  const c = new pg.Client({ connectionString: url });
  await c.connect();
  try { return (await c.query(sql, params)).rows; } finally { await c.end(); }
}
const enLocal = (sql, params) => enBase(motor.url(), sql, params);
// Escribe en la copia como lo hace la réplica (sin disparadores: no pasa por la bandeja)
async function enLocalReplica(sql, params = []) {
  const c = new pg.Client({ connectionString: motor.url() });
  await c.connect();
  try { await c.query("set session_replication_role = replica"); return (await c.query(sql, params)).rows; } finally { await c.end(); }
}
const enNube = (sql, params) => enBase(NUBE_DB, sql, params);

test("guardar en la PC: la base local responde al instante, queda en la bandeja y sube a la nube con la sesión del autor", { skip: omitir || !postgrestReal, timeout: 60_000 }, async () => {
  nube.estado.rest = [];
  const r = await pedir(`/rest/v1/trabajadores?id=eq.${TRAB}`, { metodo: "PATCH", token: tokenAdmin, cuerpo: { telefono: "0414-0000001" } });
  assert.ok([200, 204].includes(r.status), JSON.stringify(r.json));
  assert.ok(!nube.estado.rest.includes("/rest/v1/trabajadores"), "la escritura no fue a la nube");
  const [local] = await enLocal("select telefono, version from public.trabajadores where id = $1", [TRAB]);
  assert.equal(local.telefono, "0414-0000001");
  await bandejaObj.enCurso; // la puerta disparó la subida al guardar
  if (process.env.DEPURAR_BANDEJA) console.error("bandeja:", JSON.stringify(await enLocal("select * from local.bandeja")));
  await bandejaObj.subir();
  const e = await pedir("/zamorapp/estado");
  assert.deepEqual({ p: e.json.bandeja.pendientes, c: e.json.bandeja.conflictos }, { p: 0, c: 0 }, JSON.stringify(e.json.bandeja));
  const [nubeFila] = await enNube("select telefono, version from public.trabajadores where id = $1", [TRAB]);
  assert.equal(nubeFila.telefono, "0414-0000001", "llegó a la nube");
  const [ap] = await enNube("select autor, equipo_id from sync.aplicados order by en desc limit 1");
  assert.equal(ap.autor, "00000000-0000-0000-0000-0000000000a1", "subió con la sesión de quien guardó");
  assert.equal(ap.equipo_id, estado.d.equipo.id);
  const [tras] = await enLocal("select version from public.trabajadores where id = $1", [TRAB]);
  assert.equal(Number(tras.version), Number(nubeFila.version), "la versión de la nube bajó a la copia");
});

test("sin internet: guardar en la PC queda pendiente y sube al volver la conexión", { skip: omitir || !postgrestReal, timeout: 60_000 }, async () => {
  nube.estado.caida = true;
  await nubeObj.comprobar();
  const r = await pedir(`/rest/v1/trabajadores?id=eq.${TRAB}`, { metodo: "PATCH", token: tokenAdmin, cuerpo: { telefono: "0414-0000002" } });
  assert.ok([200, 204].includes(r.status), JSON.stringify(r.json));
  assert.equal((await pedir("/zamorapp/estado")).json.bandeja.pendientes, 1);
  // Un segundo cambio de la misma fila se funde con el pendiente (una sola subida, con la versión que la PC vio)
  await pedir(`/rest/v1/trabajadores?id=eq.${TRAB}`, { metodo: "PATCH", token: tokenAdmin, cuerpo: { correo: "t@x.com" } });
  const [b] = await enLocal("select datos, version_base from local.bandeja where estado = 'pendiente'");
  assert.deepEqual(b.datos, { telefono: "0414-0000002", correo: "t@x.com" });
  nube.estado.caida = false;
  await nubeObj.comprobar();
  await bandejaObj.subir();
  const [f] = await enNube("select telefono, correo from public.trabajadores where id = $1", [TRAB]);
  assert.deepEqual(f, { telefono: "0414-0000002", correo: "t@x.com" });
  assert.equal((await pedir("/zamorapp/estado")).json.bandeja.pendientes, 0);
});

test("dos equipos sin conexión editan la misma consulta: la nube no pisa nada y queda en Conflictos", { skip: omitir || !postgrestReal, timeout: 60_000 }, async () => {
  await replicaObj.ciclo();
  nube.estado.caida = true;
  await nubeObj.comprobar();
  const r = await pedir(`/rest/v1/consultas?id=eq.${CONSULTA_MED}`, { metodo: "PATCH", token: tokenMed, cuerpo: { motivo_texto: "cambiado en la PC" } });
  assert.ok([200, 204].includes(r.status), JSON.stringify(r.json));
  // Mientras tanto, otro equipo (o la web) cambió la misma ficha en la nube
  await enNube("update clinico.consultas set motivo_texto = 'cambiado en la nube' where id = $1", [CONSULTA_MED]);
  nube.estado.caida = false;
  await nubeObj.comprobar();
  await bandejaObj.subir();
  const [k] = await enLocal("select estado, motivo from local.bandeja where fila_id = $1 order by orden desc limit 1", [CONSULTA_MED]);
  assert.equal(k.estado, "conflicto", JSON.stringify(k));
  const [n] = await enNube("select motivo_texto from clinico.consultas where id = $1", [CONSULTA_MED]);
  assert.equal(n.motivo_texto, "cambiado en la nube", "la nube no se pisó");
  const [c] = await enNube("select count(*)::int n from sync.conflictos where fila_id = $1 and resuelto_en is null", [CONSULTA_MED]);
  assert.equal(c.n, 1, "la nube guardó lo que la PC quiso escribir");
  assert.equal((await pedir("/zamorapp/estado")).json.bandeja.conflictos, 1);
  // La copia local vuelve a mostrar lo que hay en la nube; lo que escribió la PC queda en la lista para revisarlo
  const [l] = await enLocal("select motivo_texto from clinico.consultas where id = $1", [CONSULTA_MED]);
  assert.equal(l.motivo_texto, "cambiado en la nube", "la fila en conflicto volvió a bajar de la nube");
  const lista = await pedir("/zamorapp/bandeja", { token: tokenMed });
  assert.equal(lista.status, 200);
  const item = lista.json.revisar.find((x) => x.fila_id === CONSULTA_MED);
  assert.ok(item && item.estado === "conflicto" && item.datos.motivo_texto === "cambiado en la PC" && item.motivo, JSON.stringify(lista.json));
  assert.equal((await pedir("/zamorapp/bandeja")).status, 401, "la lista exige sesión");
  // Quien revisa decide: otro usuario sin rol no puede; el autor descarta y la bandeja queda limpia
  const admin = estado.d.usuarios["00000000-0000-0000-0000-0000000000a1"];
  const rolAdmin = admin.rol; admin.rol = "rrhh"; // alguien que no es el autor ni administra
  const ajeno = await pedir("/zamorapp/bandeja/resolver", { metodo: "POST", token: tokenAdmin, cuerpo: { id: item.id, accion: "descartar" } });
  admin.rol = rolAdmin;
  assert.equal(ajeno.status, 400, JSON.stringify(ajeno.json));
  const ok = await pedir("/zamorapp/bandeja/resolver", { metodo: "POST", token: tokenMed, cuerpo: { id: item.id, accion: "descartar" } });
  assert.equal(ok.status, 200, JSON.stringify(ok.json));
  assert.equal((await pedir("/zamorapp/estado")).json.bandeja.conflictos, 0);
});

test("un autor sin sesión en la nube no frena a los demás: sus cambios esperan y los otros suben", { skip: omitir || !postgrestReal, timeout: 60_000 }, async () => {
  await replicaObj.ciclo();
  // El médico guarda sin internet; luego «pierde» su sesión en la nube (p. ej. entró solo sin conexión)
  nube.estado.caida = true;
  await nubeObj.comprobar();
  const r1 = await pedir(`/rest/v1/consultas?id=eq.${CONSULTA_MED}`, { metodo: "PATCH", token: tokenMed, cuerpo: { motivo_texto: "del médico" } });
  assert.ok([200, 204].includes(r1.status), JSON.stringify(r1.json));
  const r2 = await pedir(`/rest/v1/trabajadores?id=eq.${TRAB}`, { metodo: "PATCH", token: tokenAdmin, cuerpo: { telefono: "0414-0000009" } });
  assert.ok([200, 204].includes(r2.status), JSON.stringify(r2.json));
  // La nube rechaza la sesión del médico (clave cambiada o sesión revocada): token() no la renueva
  const med = estado.d.usuarios["00000000-0000-0000-0000-0000000000a2"];
  med.nube = { ...med.nube, access_token: "x", refresh_token: "rota", expires_at: 0 };
  nube.estado.caida = false;
  await nubeObj.comprobar();
  await bandejaObj.subir();
  const [t] = await enNube("select telefono from public.trabajadores where id = $1", [TRAB]);
  assert.equal(t.telefono, "0414-0000009", "lo del administrador subió");
  const [p] = await enLocal("select count(*)::int n from local.bandeja where estado = 'pendiente' and autor = $1", [med.user?.id || "00000000-0000-0000-0000-0000000000a2"]);
  assert.equal(p.n, 1, "lo del médico espera");
  assert.match(bandejaObj.ultimoError || "", /sesión/);
  // El médico vuelve a entrar con internet: su sesión se recupera y sus cambios suben
  const entra = await pedir("/auth/v1/token?grant_type=password", { metodo: "POST", cuerpo: { email: "meda@x", password: "clave-med" } });
  assert.equal(entra.status, 200, JSON.stringify(entra.json));
  tokenMed = entra.json.access_token;
  await bandejaObj.subir();
  assert.equal((await bandejaObj.resumen()).pendientes, 0);
  const [n] = await enNube("select motivo_texto from clinico.consultas where id = $1", [CONSULTA_MED]);
  assert.equal(n.motivo_texto, "del médico");
});

test("fase B: con un bloque reservado, el alta de un paciente sin internet lleva su número definitivo y sube igual", { skip: omitir || !postgrestReal, timeout: 60_000 }, async () => {
  nube.estado.caida = false; await nubeObj.comprobar();
  assert.equal(await bloquesObj.reponer(), true, bloquesObj.ultimoError || "");
  const [b] = await enLocal("select desde, hasta from local.bloques order by id desc limit 1");
  assert.equal(Number(b.hasta) - Number(b.desde), 99);
  assert.equal((await pedir("/zamorapp/estado")).json.numerosLibres, 100);
  assert.equal(await bloquesObj.reponer(), false, "con números de sobra no pide otro bloque");
  // Sin internet: alta en la PC con el primer número del bloque
  nube.estado.caida = true; await nubeObj.comprobar();
  const id = "30000000-0000-0000-0000-0000000000fb";
  const alta = await pedir("/rest/v1/trabajadores", { metodo: "POST", token: tokenMed, cuerpo: { id, org_id: "10000000-0000-0000-0000-000000000001", empresa_id: "20000000-0000-0000-0000-00000000000a", cedula: "7001", nombres: "Nuevo", apellidos: "Sin internet", numero_historia: 5 } });
  assert.ok([200, 201].includes(alta.status), JSON.stringify(alta.json));
  const [t] = await enLocal("select numero_historia from public.trabajadores where id = $1", [id]);
  assert.equal(Number(t.numero_historia), Number(b.desde), "el número es del bloque, no el que mandó el cliente ni uno provisional");
  assert.equal((await pedir("/zamorapp/estado")).json.numerosLibres, 99);
  // Vuelve internet: sube con ese mismo número y la nube lo acepta
  nube.estado.caida = false; await nubeObj.comprobar();
  await bandejaObj.subir();
  const [n] = await enNube("select numero_historia from public.trabajadores where id = $1", [id]);
  assert.equal(Number(n.numero_historia), Number(b.desde));
  // Un respaldo viejo restaurado deja «siguiente» atrasado: el próximo alta no repite el número ya usado
  await enLocal("update local.bloques set siguiente = desde");
  nube.estado.caida = true; await nubeObj.comprobar();
  const id2 = "30000000-0000-0000-0000-0000000000fc";
  const alta2 = await pedir("/rest/v1/trabajadores", { metodo: "POST", token: tokenMed, cuerpo: { id: id2, org_id: "10000000-0000-0000-0000-000000000001", empresa_id: "20000000-0000-0000-0000-00000000000a", cedula: "7003", nombres: "Tras", apellidos: "Restaurar" } });
  assert.ok([200, 201].includes(alta2.status), JSON.stringify(alta2.json));
  const [t2] = await enLocal("select numero_historia from public.trabajadores where id = $1", [id2]);
  assert.equal(Number(t2.numero_historia), Number(b.desde) + 1, "salta el número ya usado");
  nube.estado.caida = false; await nubeObj.comprobar();
  await bandejaObj.subir();
  assert.equal((await bandejaObj.resumen()).conflictos, 0);
  // La web, mientras tanto, numera por encima del bloque
  const [w] = await enNube("insert into public.trabajadores (org_id, empresa_id, cedula, nombres, apellidos) values ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a','7002','Web','Numera') returning numero_historia");
  assert.ok(Number(w.numero_historia) > Number(b.hasta), `${w.numero_historia} > ${b.hasta}`);
});

test("fase C: «Respaldar ahora» sincroniza y deja la copia local y la copia cifrada en la carpeta externa; restaurar la trae de vuelta", { skip: omitir || !postgrestReal, timeout: 180_000 }, async () => {
  const { descifrarArchivo } = await import("../puerta/respaldo.mjs");
  nube.estado.caida = false; await nubeObj.comprobar();
  const externa = fs.mkdtempSync(path.join(os.tmpdir(), "drive-"));
  // Configurar: solo administrador o gerente; carpeta inexistente o clave corta se rechazan
  assert.equal((await pedir("/zamorapp/respaldo/configurar", { metodo: "POST", token: tokenMed, cuerpo: { carpeta: externa } })).status, 403);
  assert.equal((await pedir("/zamorapp/respaldo/configurar", { metodo: "POST", token: tokenAdmin, cuerpo: { carpeta: path.join(externa, "no-existe") } })).status, 400);
  assert.equal((await pedir("/zamorapp/respaldo/configurar", { metodo: "POST", token: tokenAdmin, cuerpo: { clave: "corta-corta", confirmacion: "corta-corta" } })).status, 400, "menos de 12 caracteres");
  assert.equal((await pedir("/zamorapp/respaldo/configurar", { metodo: "POST", token: tokenAdmin, cuerpo: { clave: "clave-de-respaldo", confirmacion: "clave-de-respaldO" } })).status, 400, "las dos escrituras no coinciden");
  // El estado del respaldo lo ve el personal de salud y el administrador; un rol de RR. HH. no
  assert.equal((await pedir("/zamorapp/respaldo", { token: tokenMed })).status, 200);
  // Con carpeta pero sin clave, la copia no sale de la PC
  assert.equal((await pedir("/zamorapp/respaldo/configurar", { metodo: "POST", token: tokenAdmin, cuerpo: { carpeta: externa } })).status, 200);
  let r = await fetch(`${urlPuerta}/zamorapp/respaldar`, { method: "POST", headers: { "X-Zamorapp-Control": CONTROL } });
  let j = await r.json();
  assert.equal(r.status, 500); assert.match(j.error, /clave de respaldo/);
  assert.ok(j.archivo && fs.existsSync(j.archivo), "la copia local sí se hizo");
  assert.equal(fs.readdirSync(externa).length, 0);
  const conf = await pedir("/zamorapp/respaldo/configurar", { metodo: "POST", token: tokenAdmin, cuerpo: { clave: "clave-de-respaldo", confirmacion: "clave-de-respaldo" } });
  assert.equal(conf.status, 200); assert.match(conf.json.aviso, /anótala en papel/); assert.equal(conf.json.clave, undefined, "la clave nunca vuelve");
  // Un dato nuevo en la PC antes del respaldo
  await enLocalReplica("update public.trabajadores set telefono = '0414-RESPALDO' where id = $1", [TRAB]);
  r = await fetch(`${urlPuerta}/zamorapp/respaldar`, { method: "POST", headers: { "X-Zamorapp-Control": CONTROL } });
  j = await r.json();
  assert.equal(r.status, 200, JSON.stringify(j));
  assert.ok(j.ok && j.sincronizado && j.externo?.endsWith(".zamorapp") && fs.existsSync(j.externo), JSON.stringify(j));
  assert.ok(j.bytes > 1000);
  const est = (await pedir("/zamorapp/respaldo", { token: tokenAdmin })).json;
  assert.equal(est.cifrado, true); assert.equal(est.ultimo.ok, true); assert.ok(est.copias.length >= 2);
  assert.ok(est.hora && typeof est.horaSinAncla === "boolean" && est.pasos.length === 4, "hora anclada y pasos fijos para la pantalla");
  // Prueba de descifrado automática: quedó registrada en la PC y anotada en la nube (public.respaldos, #116)
  assert.equal(est.restauracionProbada?.ok, true, JSON.stringify(est.restauracionProbada));
  assert.equal(est.restauracionProbada.anotadaEnNube, true);
  const [anot] = await enNube("select count(*)::int as n from public.respaldos where tipo = 'restauracion' and estado = 'ok' and equipo = 'PC de prueba'");
  assert.ok(anot.n >= 1, "la prueba de restauración está en la nube");
  const [anot2] = await enNube("select estado, destinos from public.respaldos where tipo = 'respaldo' order by id desc limit 1");
  assert.deepEqual(anot2, { estado: "ok", destinos: 2 });
  assert.equal((await pedir("/zamorapp/estado")).json.respaldo.ultimo.ok, true);
  // La copia externa está cifrada: con otra clave no se abre; con la buena es el volcado de pg_dump
  const tmp = path.join(externa, "prueba.dump");
  await assert.rejects(descifrarArchivo(j.externo, tmp, "otra-clave"), /clave de respaldo/);
  await descifrarArchivo(j.externo, tmp, "clave-de-respaldo");
  assert.equal(fs.readFileSync(tmp).subarray(0, 5).toString(), "PGDMP");
  assert.ok(!fs.readFileSync(j.externo).includes("0414-RESPALDO"), "nada legible en la copia externa");
  // Restaurar: se pide desde la app y se aplica al arrancar (aquí se aplica directo)
  await enLocalReplica("update public.trabajadores set telefono = '0414-DESPUES' where id = $1", [TRAB]);
  let pr = await pedir("/zamorapp/restaurar", { metodo: "POST", token: tokenAdmin, cuerpo: { archivo: j.externo, clave: "clave-de-respaldo" } });
  assert.equal(pr.status, 200, JSON.stringify(pr.json));
  assert.ok(estado.d.restaurar?.archivo);
  // Se puede cancelar antes de reabrir el programa
  assert.equal((await pedir("/zamorapp/respaldo", { token: tokenAdmin })).json.restauracionPendiente?.origen, j.externo);
  assert.equal((await pedir("/zamorapp/restaurar/cancelar", { metodo: "POST", token: tokenAdmin })).json.cancelada, true);
  assert.equal(estado.d.restaurar, null); assert.equal(fs.existsSync(path.join(respaldoObj.carpetaLocal, "restaurar.dump")), false);
  // Un archivo dañado NO deja al programa sin abrir: sigue con la base actual y el error queda a la vista
  const danado = path.join(respaldoObj.carpetaLocal, "restaurar.dump");
  fs.writeFileSync(danado, Buffer.concat([Buffer.from("PGDMP"), crypto.randomBytes(4096)]));
  estado.d.restaurar = { archivo: danado, origen: "copia-danada.zamorapp", pedido: nubeObj.reloj.iso() };
  assert.equal(await motor.restaurarSiPedida(), false);
  assert.equal(estado.d.restaurar, null);
  assert.match(estado.d.respaldo.restauracionFallida.mensaje, /No se pudo restaurar/);
  assert.equal((await pedir("/zamorapp/respaldo", { token: tokenAdmin })).json.restauracionFallida.origen, "copia-danada.zamorapp");
  assert.equal(fs.existsSync(danado), false, "el volcado dañado se borra");
  assert.equal((await enLocal("select count(*)::int as n from pg_database where datname = 'zamorapp_restaurada'"))[0].n, 0, "la base a medias se borra");
  const [sigue] = await enLocal("select telefono from public.trabajadores where id = $1", [TRAB]);
  assert.equal(sigue.telefono, "0414-DESPUES", "la base actual sigue intacta");
  // Los bloques de números de historia que traiga un respaldo de OTRA PC se borran al restaurar (condición 7)
  await enLocalReplica("insert into local.bloques (desde, hasta, siguiente, equipo_id) values (900000, 900099, 900000, '00000000-0000-0000-0000-00000000dead')");
  pr = await pedir("/zamorapp/restaurar", { metodo: "POST", token: tokenAdmin, cuerpo: { archivo: j.externo, clave: "clave-de-respaldo" } });
  assert.equal(pr.status, 200, JSON.stringify(pr.json));
  assert.equal(await motor.aplicarRestauracion(), true);
  const [bl] = await enLocal("select count(*) filter (where equipo_id = '00000000-0000-0000-0000-00000000dead')::int as ajenos, count(*) filter (where equipo_id = $1)::int as propios from local.bloques", [estado.d.equipo.id]);
  assert.deepEqual(bl, { ajenos: 0, propios: 1 }, "quedan solo los bloques de este equipo");
  const [t] = await enLocal("select telefono from public.trabajadores where id = $1", [TRAB]);
  assert.equal(t.telefono, "0414-RESPALDO", "la base volvió al respaldo");
  assert.equal(estado.d.cursor, null, "la nube vuelve a bajar completa");
  await replicaObj.ciclo();
  assert.ok(estado.d.copiaCompleta, replicaObj.error || "");
  const [n] = await enNube("select telefono from public.trabajadores where id = $1", [TRAB]);
  const [l] = await enLocal("select telefono from public.trabajadores where id = $1", [TRAB]);
  assert.equal(l.telefono, n.telefono, "tras restaurar, manda la nube");
  fs.rmSync(externa, { recursive: true, force: true });
});

test("hora anclada: la puerta pone X-Zamorapp-Ahora con la hora de la nube y tira la del navegador; sin ancla avisa", { skip: omitir || !postgrestReal, timeout: 60_000 }, async () => {
  await enLocal(`create or replace function public.prueba_cabecera_ahora() returns text language sql stable security definer
    as $$ select current_setting('request.headers', true)::json ->> 'x-zamorapp-ahora' $$;
    grant execute on function public.prueba_cabecera_ahora() to authenticated; notify pgrst, 'reload schema'`);
  await new Promise((r) => setTimeout(r, 3000)); // PostgREST recarga el esquema; la puerta vuelve a mirar el catálogo
  const est = (await pedir("/zamorapp/estado")).json;
  // Con ancla, un cambio guardado queda marcado con hora verificada
  const g = await pedir(`/rest/v1/trabajadores?id=eq.${TRAB}`, { metodo: "PATCH", token: tokenAdmin, cuerpo: { telefono: "0414-0000013" } });
  assert.ok([200, 204].includes(g.status), JSON.stringify(g.json));
  const [hv] = await enLocal("select hora_verificada from local.bandeja where fila_id = $1 and estado = 'pendiente'", [TRAB]);
  assert.equal(hv?.hora_verificada, true);
  await bandejaObj.subir();
  assert.equal(est.horaSinAncla, false, "con internet la hora está verificada");
  assert.ok(Math.abs(Date.parse(est.hora) - Date.now()) < 60e3);
  // Windows se atrasa un mes: la hora de la app no cambia (manda la nube)
  const fecha = nubeObj.reloj.fecha;
  nubeObj.reloj.fecha = () => Date.now() - 30 * 864e5;
  nube.estado.caida = true; await nubeObj.comprobar(); // sin internet: la lectura stable sale de la copia local
  const r = await fetch(`${urlPuerta}/rest/v1/rpc/prueba_cabecera_ahora`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenMed}`, "X-Zamorapp-Ahora": "1999-01-01T00:00:00.000Z" }, body: "{}" });
  const textoR = await r.text();
  assert.equal(r.status, 200, textoR);
  const puesta = Date.parse(JSON.parse(textoR));
  assert.ok(Math.abs(puesta - Date.now()) < 60e3, "la cabecera es la de la puerta, no la del navegador ni la de Windows");
  // Reinicio sin internet (sin ancla): no va la cabecera, manda el piso y se avisa «hora sin verificar»
  nubeObj.reloj.ancla = null;
  const sin = (await pedir("/zamorapp/estado")).json;
  assert.equal(sin.horaSinAncla, true);
  assert.ok(Date.parse(sin.hora) >= puesta - 1000, "no retrocede aunque Windows esté un mes atrás");
  const sinCab = await pedir("/rest/v1/rpc/prueba_cabecera_ahora", { metodo: "POST", token: tokenMed, cuerpo: {} });
  assert.equal(sinCab.status, 200, JSON.stringify(sinCab.json));
  assert.equal(sinCab.json, null, "sin ancla no se manda ninguna hora (ni la de Windows)");
  const g2 = await pedir(`/rest/v1/trabajadores?id=eq.${TRAB}`, { metodo: "PATCH", token: tokenAdmin, cuerpo: { telefono: "0414-0000014" } });
  assert.ok([200, 204].includes(g2.status));
  const [hv2] = await enLocal("select hora_verificada from local.bandeja where fila_id = $1 and estado = 'pendiente'", [TRAB]);
  assert.equal(hv2?.hora_verificada, false, "guardado sin ancla: hora no verificada");
  nubeObj.reloj.fecha = fecha;
  nube.estado.caida = false; await nubeObj.comprobar();
  assert.equal((await pedir("/zamorapp/estado")).json.horaSinAncla, false, "al volver la nube se vuelve a anclar");
  await enLocal("drop function public.prueba_cabecera_ahora(); notify pgrst, 'reload schema'");
});

test("qué se queda en la PC y qué va a la nube: funciones de la consulta sí, borrado clínico y funciones con otras tablas no", { skip: omitir || !postgrestReal }, async () => {
  nube.estado.caida = true;
  await nubeObj.comprobar();
  const g = await pedir("/rest/v1/rpc/guardar_consulta", { metodo: "POST", token: tokenMed, cuerpo: {} });
  assert.notEqual(g.status, 503, "guardar_consulta corre en la base local (aquí falla por argumentos, no por falta de internet)");
  const re = await pedir("/rest/v1/rpc/reabrir_consulta", { metodo: "POST", token: tokenMed, cuerpo: { p_id: CONSULTA_MED, p_motivo: "x" } });
  assert.equal(re.status, 503, "reabrir_consulta escribe consultas_versiones (no sube): va a la nube");
  const del = await pedir(`/rest/v1/consultas?id=eq.${CONSULTA_MED}`, { metodo: "DELETE", token: tokenMed });
  assert.equal(del.status, 503, "nada clínico se borra desde la PC");
  nube.estado.caida = false;
  await nubeObj.comprobar();
});

test("sin internet: consulta la copia local con las mismas reglas de acceso", { skip: omitir }, async () => {
  nube.estado.caida = true;
  await nubeObj.comprobar();
  assert.equal(nubeObj.enLinea, false);
  const t = await pedir("/rest/v1/trabajadores?select=id,empresa_id", { token: tokenMed });
  assert.equal(t.status, 200, JSON.stringify(t.json));
  assert.ok(t.json.length >= 1);
  assert.ok(t.json.every((f) => f.empresa_id === "20000000-0000-0000-0000-00000000000a"), "el médico de A no ve trabajadores de B");
});

test("sin internet: lo que no sincroniza (miembros, alta de paciente) se rechaza con un mensaje claro y los adjuntos esperan", { skip: omitir }, async () => {
  const w = await pedir("/rest/v1/miembros", { metodo: "POST", token: tokenMed, cuerpo: { rol: "x" } });
  assert.equal(w.status, 503);
  assert.match(w.json.message, /solo se puede consultar/);
  await enLocal("delete from local.bloques");
  const alta = await pedir("/rest/v1/trabajadores", { metodo: "POST", token: tokenMed, cuerpo: { cedula: "9" } });
  assert.equal(alta.status, 503, "sin números de historia reservados, el alta de un paciente nuevo exige internet");
  // Un archivo que no está en la PC no se puede firmar sin internet (como la nube: 400 «not_found»)
  const s = await pedir("/storage/v1/object/sign/adjuntos/x", { metodo: "POST", token: tokenMed, cuerpo: {} });
  assert.equal(s.status, 400);
});

// 28/10/2026: la 0.1.168 no abría: el menú de la app llama a trabajadores_por_empresa por POST y la puerta,
// sin conexión, lo tomaba por escritura. Toda función stable/immutable de la base es lectura y va a la copia.
test("sin internet: las funciones de lectura (stable) responden desde la copia; las que escriben no", { skip: omitir }, async () => {
  const conteo = await pedir("/rest/v1/rpc/trabajadores_por_empresa", { metodo: "POST", token: tokenMed, cuerpo: {} });
  assert.equal(conteo.status, 200, JSON.stringify(conteo.json));
  assert.ok(Array.isArray(conteo.json));
  const escribir = await pedir("/rest/v1/rpc/registrar_acceso", { metodo: "POST", token: tokenMed, cuerpo: { p_trabajador: "30000000-0000-0000-0000-00000000000a" } });
  assert.equal(escribir.status, 503);
  assert.equal(escribir.json.code, "OFFLINE");
});

// Un «sin conexión» de un instante (p. ej. la red de Windows aún no lista al arrancar) no deja la PC sin internet
// hasta la próxima sincronía: a los 15 s la puerta vuelve a preguntar sola.
test("volvió internet: la puerta lo nota sola en la siguiente petición", { skip: omitir }, async () => {
  nube.estado.caida = false;
  assert.equal(nubeObj.enLinea, false);
  nubeObj.revisadaEn = Date.now() - 16_000;
  const t = await pedir("/rest/v1/trabajadores?select=id&limit=1", { token: tokenMed });
  assert.equal(t.status, 200);
  assert.equal(nubeObj.enLinea, true);
  nube.estado.caida = true;
  await nubeObj.comprobar();
});

test("sin internet: entra con su clave; con clave equivocada no", { skip: omitir }, async () => {
  const ok = await pedir("/auth/v1/token?grant_type=password", { metodo: "POST", cuerpo: { email: "meda@x", password: "clave-med" } });
  assert.equal(ok.status, 200);
  const mal = await pedir("/auth/v1/token?grant_type=password", { metodo: "POST", cuerpo: { email: "meda@x", password: "nop" } });
  assert.equal(mal.status, 400);
  const renovada = await pedir("/auth/v1/token?grant_type=refresh_token", { metodo: "POST", cuerpo: { refresh_token: ok.json.refresh_token } });
  assert.equal(renovada.status, 200);
  // El servidor de la app y la ventana renuevan a la vez al abrir: el segundo recibe la misma sesión nueva
  const reuso = await pedir("/auth/v1/token?grant_type=refresh_token", { metodo: "POST", cuerpo: { refresh_token: ok.json.refresh_token } });
  assert.equal(reuso.status, 200, "dentro del margen, el refresco recién usado no cierra la sesión");
  assert.equal(reuso.json.refresh_token, renovada.json.refresh_token);
  const u = estado.d.usuarios["00000000-0000-0000-0000-0000000000a2"];
  u.bloqueado = true; // un bloqueo surte efecto al instante, también dentro del margen
  try {
    assert.equal((await pedir("/auth/v1/token?grant_type=refresh_token", { metodo: "POST", cuerpo: { refresh_token: ok.json.refresh_token } })).status, 400);
  } finally {
    delete u.bloqueado;
  }
  const sid = (t) => JSON.parse(Buffer.from(t.split(".")[1], "base64url").toString()).session_id;
  assert.equal(sid(renovada.json.access_token), sid(ok.json.access_token), "renovar conserva la sesión");
  const margen = CONFIG.reusoRefrescoMs;
  CONFIG.reusoRefrescoMs = 0;
  try {
    const otra = await pedir("/auth/v1/token?grant_type=refresh_token", { metodo: "POST", cuerpo: { refresh_token: renovada.json.refresh_token } });
    assert.equal(otra.status, 200);
    const tarde = await pedir("/auth/v1/token?grant_type=refresh_token", { metodo: "POST", cuerpo: { refresh_token: renovada.json.refresh_token } });
    assert.equal(tarde.status, 400, "pasado el margen, un refresco sirve una sola vez");
  } finally {
    CONFIG.reusoRefrescoMs = margen;
  }
  assert.ok(lineas.includes("[auth] renovar: ok"), "puerta.log anota cada renovación");
  assert.ok(lineas.some((l) => l.startsWith("[auth] renovar: 400 (refresco desconocido")), "y también cuando falla");
  assert.ok(!lineas.some((l) => l.includes(ok.json.refresh_token)), "sin escribir el token");
});

test("salir: scope local cierra solo esta ventana; global, todas", { skip: omitir }, async () => {
  const entrar = () => pedir("/auth/v1/token?grant_type=password", { metodo: "POST", cuerpo: { email: "meda@x", password: "clave-med" } });
  const renovar = (t) => pedir("/auth/v1/token?grant_type=refresh_token", { metodo: "POST", cuerpo: { refresh_token: t } });
  const a = (await entrar()).json;
  const b = (await entrar()).json;
  const a2 = (await renovar(a.refresh_token)).json; // la sesión renovada sigue siendo la de esta ventana
  assert.equal((await pedir("/auth/v1/logout?scope=local", { metodo: "POST", token: a2.access_token })).status, 204);
  assert.equal((await renovar(a2.refresh_token)).status, 400, "la sesión que salió queda cerrada");
  const b2 = await renovar(b.refresh_token);
  assert.equal(b2.status, 200, "la otra sesión sigue abierta");
  assert.equal((await pedir("/auth/v1/logout", { metodo: "POST", token: b2.json.access_token })).status, 204);
  assert.equal((await renovar(b2.json.refresh_token)).status, 400, "sin scope (global) se cierran todas");
  assert.ok(lineas.some((l) => /^\[auth\] salir \(local\): 1 sesión/.test(l)));
});

test("más de 7 días sin conexión: no entra hasta reconectar", { skip: omitir }, async () => {
  const u = estado.d.usuarios["00000000-0000-0000-0000-0000000000a2"];
  const antes = u.ultimoOnline;
  u.ultimoOnline = nubeObj.reloj.ahora() - 8 * 864e5;
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
  u.ultimoOnline = nubeObj.reloj.ahora() - 8 * 864e5;
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
  assert.equal((await pedir("/rest/v1/trabajadores?select=id,empresa_id")).status, 401);
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
  assert.equal((await pedir("/rest/v1/trabajadores?select=id,empresa_id", { token: tokenMed })).status, 401, "sus sesiones locales se cortan");
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
  const { instalacion } = (await pedir("/zamorapp/huella/estado")).json;
  assert.ok(instalacion, "la puerta identifica la instalación");
  assert.equal((await pedir("/zamorapp/huella/preparar", { metodo: "POST" })).status, 401, "sin sesión no se prepara");
  const prep = await pedir("/zamorapp/huella/preparar", { metodo: "POST", token: ok.json.access_token });
  assert.equal(prep.status, 200);
  // Solo la ventana (con la clave de control) confirma que Windows verificó la huella
  const sinControl = await fetch(`${urlPuerta}/zamorapp/huella/activar?codigo=${prep.json.codigo}`, { method: "POST", headers: { "X-Zamorapp-Control": "x".repeat(48) } });
  assert.equal(sinControl.status, 403);
  assert.equal((await ventana(`/zamorapp/huella/activar?codigo=${prep.json.codigo}`)).json.ok, true);
  assert.equal((await ventana(`/zamorapp/huella/activar?codigo=${prep.json.codigo}`)).json.ok, false, "el código sirve una vez");
  assert.equal((await pedir("/zamorapp/huella/estado")).json.usuarios, 1);
  assert.equal((await pedir("/zamorapp/huella/estado")).json.instalacion, instalacion);
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

test("verificación en dos pasos: la puerta pide el código para abrir la app y para registrar una PC", { skip: omitir }, async () => {
  nube.estado.conAal = true;
  nube.usuarios["admin@x"].factor = "f-admin";
  const aal = (t) => JSON.parse(Buffer.from(t.split(".")[1], "base64url")).aal;
  try {
    const r = await pedir("/auth/v1/token?grant_type=password", { metodo: "POST", cuerpo: { email: "admin@x", password: "clave-admin" } });
    assert.equal(r.status, 200);
    const token = r.json.access_token;
    assert.equal(aal(token), "aal1", "el administrador entra con aal1 y la app le pide el código");
    const m = await pedir("/auth/v1/token?grant_type=password", { metodo: "POST", cuerpo: { email: "meda@x", password: "clave-med" } });
    assert.equal(aal(m.json.access_token), undefined, "al médico no se le pide");

    let eq = await pedir("/zamorapp/equipo", { metodo: "POST", token, cuerpo: { nombre: "Otra PC", serie: "QZ" } });
    assert.equal(eq.status, 401);
    assert.equal(eq.json.code, "dos_pasos");
    eq = await pedir("/zamorapp/equipo", { metodo: "POST", token, cuerpo: { nombre: "Otra PC", serie: "QZ", codigo: "000000" } });
    assert.equal(eq.status, 401);
    assert.match(eq.json.message, /no es correcto/);

    const mal = await pedir("/auth/v1/factors/f-admin/verify", { metodo: "POST", token, cuerpo: { challenge_id: "reto-1", code: "111111" } });
    assert.equal(mal.status, 422);
    assert.equal((await pedir("/auth/v1/factors/f-admin/challenge", { metodo: "POST", token, cuerpo: {} })).status, 200);
    const ok = await pedir("/auth/v1/factors/f-admin/verify", { metodo: "POST", token, cuerpo: { challenge_id: "reto-1", code: "123456" } });
    assert.equal(ok.status, 200, JSON.stringify(ok.json));
    assert.equal(aal(ok.json.access_token), "aal2");
    assert.equal(aal(estado.d.usuarios["00000000-0000-0000-0000-0000000000a1"].nube.access_token), "aal2", "la sesión de la nube también queda aal2");
    const ren = await pedir("/auth/v1/token?grant_type=refresh_token", { metodo: "POST", cuerpo: { refresh_token: ok.json.refresh_token } });
    assert.equal(aal(ren.json.access_token), "aal2", "renovar conserva el segundo paso");
  } finally {
    nube.estado.conAal = false;
    delete nube.usuarios["admin@x"].factor;
  }
});

test("dos pasos y copia local: una sesión aal1 no lee la copia (ni sin internet); requiere_dos_pasos siempre va a la nube", { skip: omitir }, async () => {
  nube.estado.conAal = true;
  nube.usuarios["admin@x"].factor = "f-admin";
  const admin = () => estado.d.usuarios["00000000-0000-0000-0000-0000000000a1"];
  const nubeAntes = admin().nube.access_token;
  try {
    const token1 = (await pedir("/auth/v1/token?grant_type=password", { metodo: "POST", cuerpo: { email: "admin@x", password: "clave-admin" } })).json.access_token;
    await replicaObj.ciclo();
    assert.equal((await pedir("/zamorapp/estado")).json.lecturaLocal, true, "la copia está al día");
    nube.estado.rest = [];
    const r1 = await pedir("/rest/v1/trabajadores?select=id", { token: token1 });
    assert.equal(r1.status, 200);
    assert.ok(nube.estado.rest.includes("/rest/v1/trabajadores"), "aal1: la lectura va a la nube aunque la copia esté al día");
    const w = await pedir(`/rest/v1/trabajadores?id=eq.${TRAB}`, { metodo: "PATCH", token: token1, cuerpo: { telefono: "x" } });
    assert.equal(w.status, 403);
    assert.equal(w.json.code, "dos_pasos", "aal1: tampoco guarda en la PC");
    const ok = await pedir("/auth/v1/factors/f-admin/verify", { metodo: "POST", token: token1, cuerpo: { challenge_id: "reto-1", code: "123456" } });
    const token2 = ok.json.access_token;
    nube.estado.rest = [];
    assert.equal((await pedir("/rest/v1/trabajadores?select=id", { token: token2 })).status, 200);
    assert.ok(!nube.estado.rest.includes("/rest/v1/trabajadores"), "aal2: vuelve a leer de la copia");
    await pedir("/rest/v1/rpc/requiere_dos_pasos", { metodo: "POST", token: token2, cuerpo: {} });
    await pedir("/rest/v1/rpc/falta_segundo_paso", { metodo: "POST", token: token2, cuerpo: {} });
    assert.ok(nube.estado.rest.includes("/rest/v1/rpc/requiere_dos_pasos") && nube.estado.rest.includes("/rest/v1/rpc/falta_segundo_paso"), "el segundo paso lo decide la nube");
    // Sin internet, aal1 tampoco lee la copia (Windows Hello da aal2); aal2 sí
    nube.estado.caida = true;
    await nubeObj.comprobar();
    const sin = await pedir("/rest/v1/trabajadores?select=id", { token: token1 });
    assert.equal(sin.status, 403);
    assert.equal(sin.json.code, "dos_pasos");
    assert.equal((await pedir("/rest/v1/trabajadores?select=id", { token: token2 })).status, 200);
  } finally {
    nube.estado.caida = false;
    await nubeObj.comprobar();
    admin().nube.access_token = nubeAntes;
    nube.estado.conAal = false;
    delete nube.usuarios["admin@x"].factor;
  }
});

test("Windows Hello y dos pasos: con internet y la nube en aal1 se pide el código; sin internet basta Windows Hello", { skip: omitir }, async () => {
  const ventana = (ruta) => fetch(`${urlPuerta}${ruta}`, { method: "POST", headers: { "X-Zamorapp-Control": CONTROL } }).then(async (r) => ({ status: r.status, json: await r.json() }));
  const aal = (t) => JSON.parse(Buffer.from(t.split(".")[1], "base64url")).aal;
  const entrarHello = async () => {
    const v = await ventana("/zamorapp/huella/entrar");
    assert.equal(v.json.ok, true, JSON.stringify(v.json));
    return pedir("/auth/v1/token?grant_type=hello", { metodo: "POST", cuerpo: { codigo: v.json.codigo } });
  };
  nube.estado.conAal = true;
  nube.usuarios["admin@x"].factor = "f-admin";
  const admin = () => estado.d.usuarios["00000000-0000-0000-0000-0000000000a1"];
  let token, nubeAal2;
  try {
    token = (await pedir("/auth/v1/token?grant_type=password", { metodo: "POST", cuerpo: { email: "admin@x", password: "clave-admin" } })).json.access_token;
    const nubeAal1 = admin().nube.access_token;
    const prep = await pedir("/zamorapp/huella/preparar", { metodo: "POST", token });
    assert.equal((await ventana(`/zamorapp/huella/activar?codigo=${prep.json.codigo}`)).json.ok, true);
    // La nube aún está en aal1: Windows Hello abre la sesión local sin el segundo paso y la app pide el código
    let s = await entrarHello();
    assert.equal(s.status, 200);
    assert.equal(aal(s.json.access_token), "aal1");
    assert.equal(s.json.dos_pasos, true, "la página avisa por qué pide el código");
    const ok = await pedir("/auth/v1/factors/f-admin/verify", { metodo: "POST", token: s.json.access_token, cuerpo: { challenge_id: "reto-1", code: "123456" } });
    assert.equal(aal(ok.json.access_token), "aal2");
    // Con la nube ya en aal2, Windows Hello basta
    s = await entrarHello();
    assert.equal(aal(s.json.access_token), "aal2");
    assert.equal(s.json.dos_pasos, undefined);
    // Sin internet, Windows Hello cuenta como segundo paso aunque la sesión de la nube sea aal1
    nubeAal2 = admin().nube.access_token;
    admin().nube.access_token = nubeAal1;
    nube.estado.caida = true;
    await nubeObj.comprobar();
    s = await entrarHello();
    assert.equal(aal(s.json.access_token), "aal2");
  } finally {
    if (nubeAal2) admin().nube.access_token = nubeAal2;
    nube.estado.caida = false;
    await nubeObj.comprobar();
    if (token) await pedir("/zamorapp/huella/quitar", { metodo: "POST", token });
    nube.estado.conAal = false;
    delete nube.usuarios["admin@x"].factor;
  }
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
    assert.equal((await pedir("/rest/v1/trabajadores?select=id,empresa_id", { token: tokenMed })).status, 401);
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

test("usuario corto: entra con internet, luego sin internet; con clave equivocada no", { skip: omitir }, async () => {
  const entrar = (email, password) => pedir("/auth/v1/token?grant_type=password", { metodo: "POST", cuerpo: { email, password } });
  const medA = "00000000-0000-0000-0000-0000000000a2";
  await replicaObj.enCurso;
  assert.equal((await entrar("richard", "mala")).status, 400, "con internet, la clave equivocada no revela nada");
  const ok = await entrar("Richard", "clave-med");
  assert.equal(ok.status, 200, JSON.stringify(ok.json));
  assert.equal(ok.json.user.id, medA);
  assert.equal(estado.d.usuarios[medA].usuario, "richard", "la PC recuerda el usuario para entrar sin internet");
  try {
    nube.estado.caida = true;
    await nubeObj.comprobar();
    assert.equal((await entrar("richard", "clave-med")).status, 200, "sin internet entra con el usuario corto");
    assert.equal((await entrar("richard", "nop")).status, 400);
    assert.equal((await entrar("fantasma", "clave-med")).status, 400);
  } finally {
    nube.estado.caida = false;
    await nubeObj.comprobar();
  }
});

// En Windows PostgREST se caía a veces en su primer segundo (código 3): el motor debe relanzarlo solo
// La nube recibió una migración que esta versión del programa no entiende (27/10/2026: quitar columnas de
// trabajadores a RR. HH. dejó a la 0.1.0 con «Application error»). La puerta lo dice claro y lo marca para
// que la ventana ofrezca actualizar, en vez de dejar caer la pantalla con un error mudo.
test("la nube cambió y esta versión no la entiende: se avisa que hay que actualizar", { skip: omitir }, async () => {
  nube.estado.caida = false;
  await nubeObj.comprobar();
  assert.equal(nubeObj.enLinea, true);
  let e = await pedir("/zamorapp/estado");
  assert.equal(e.json.actualizar, false);
  nube.estado.migradaPorDelante = true;
  replicaObj.ultimaMs = performance.now() - 120_000; // copia vieja: la lectura va a la nube (C11)
  try {
    const r = await pedir("/rest/v1/trabajadores?select=id,grupo_sanguineo", { token: tokenAdmin });
    assert.equal(r.status, 403);
    assert.equal(r.json.code, "42501");
    assert.match(r.json.message, /necesita actualizarse/);
    assert.match(r.json.message, /permission denied for table trabajadores/);
    e = await pedir("/zamorapp/estado");
    assert.equal(e.json.actualizar, true);
    assert.equal(e.json.incompatible.codigo, "42501");
    // Gana el primer 42501: puede ser esta consulta o la sincronía de fondo (cambios_desde) si cae en la ventana.
    assert.match(e.json.incompatible.donde, /^(\/rest\/v1\/trabajadores|rpc cambios_desde)$/);
  } catch (err) {
    nubeObj.incompatible = null; // que una falla aquí no arrastre a las pruebas que siguen
    throw err;
  } finally {
    nube.estado.migradaPorDelante = false;
  }
  // El aviso queda hasta que el programa se actualice (reinicio): una consulta que sí pasa no lo borra.
  const ok = await pedir("/rest/v1/trabajadores?select=id,empresa_id", { token: tokenAdmin });
  assert.equal(ok.status, 200);
  e = await pedir("/zamorapp/estado");
  assert.equal(e.json.actualizar, true);
  nubeObj.incompatible = null; // para las pruebas que siguen
});

test("botones de la pantalla «hay una versión nueva»: solo desde la ventana de zamorApp", { skip: omitir }, async () => {
  const origenVentana = "http://127.0.0.1:54332";
  // Sin Origin de la ventana: rechazados
  assert.equal((await pedir("/zamorapp/buscar-actualizacion", { metodo: "POST" })).status, 403);
  assert.equal((await pedir("/zamorapp/abrir-web", { metodo: "POST" })).status, 403);
  // Desde la ventana: la petición queda guardada y solo el programa (clave de control) la recibe, una sola vez
  let r = await fetch(`${urlPuerta}/zamorapp/buscar-actualizacion`, { method: "POST", headers: { Origin: origenVentana } });
  assert.equal(r.status, 200);
  assert.equal((await r.json()).pedida, true);
  let e = await pedir("/zamorapp/estado");
  assert.equal(e.json.buscarActualizacion, false, "sin clave de control no se entrega");
  r = await fetch(`${urlPuerta}/zamorapp/estado`, { headers: { "X-Zamorapp-Control": CONTROL } });
  assert.equal((await r.json()).buscarActualizacion, true);
  r = await fetch(`${urlPuerta}/zamorapp/estado`, { headers: { "X-Zamorapp-Control": CONTROL } });
  assert.equal((await r.json()).buscarActualizacion, false, "se entrega una sola vez");
  // Abrir la web: responde la dirección (en Windows además abre el navegador)
  r = await fetch(`${urlPuerta}/zamorapp/abrir-web`, { method: "POST", headers: { Origin: origenVentana } });
  assert.equal(r.status, 200);
  const j = await r.json();
  assert.equal(j.url, "https://zamorapp-ocupacional.vercel.app");
  assert.equal(j.abierto, process.platform === "win32");
});

// main.rs (vigilar_nube, sincronizar) le habla a la puerta con HTTP crudo por TcpStream y lee hasta que la
// conexión se cierra: la puerta debe responder 200 y cerrar sola (Connection: close), o el programa se queda esperando.
test("el programa consulta /zamorapp/estado con HTTP crudo (como main.rs) y la puerta cierra la conexión", { skip: omitir }, async () => {
  const net = await import("node:net");
  const { port } = puerta.address();
  const respuesta = await new Promise((ok, falla) => {
    const c = net.connect(port, "127.0.0.1");
    let texto = "";
    const t = setTimeout(() => { c.destroy(); falla(new Error("la puerta no cerró la conexión en 5 s (el programa se quedaría esperando)")); }, 5000);
    c.on("connect", () => c.write(`GET /zamorapp/estado HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\nX-Zamorapp-Control: ${CONTROL}\r\nContent-Length: 0\r\nConnection: close\r\n\r\n`));
    c.on("data", (d) => { texto += d; });
    c.on("end", () => { clearTimeout(t); ok(texto); });
    c.on("error", (e) => { clearTimeout(t); falla(e); });
  });
  assert.ok(respuesta.startsWith("HTTP/1.1 200"), respuesta.slice(0, 80));
  const [cabecera, cuerpoTexto] = respuesta.split("\r\n\r\n");
  assert.match(cabecera.toLowerCase(), /content-length: \d+/, "sin Content-Length el cuerpo llega «chunked» y el programa no lo entiende");
  const cuerpo = JSON.parse(cuerpoTexto);
  assert.equal(typeof cuerpo.actualizar, "boolean");
  assert.equal(cuerpo.buscarActualizacion, false);
});

test("una RLS que niega una escritura (también 42501) NO se confunde con «hay que actualizar»", { skip: omitir }, async () => {
  nube.estado.rlsNiega = true;
  try {
    // (miembros no sincroniza: la escritura va a la nube, que aquí la niega por RLS)
    const r = await pedir("/rest/v1/miembros?id=eq.00000000-0000-0000-0000-0000000000c1", { metodo: "PATCH", token: tokenAdmin, cuerpo: { rol: "x" } });
    assert.equal(r.status, 403);
    assert.equal(r.json.code, "42501");
    assert.match(r.json.message, /^new row violates row-level security policy/);
    assert.doesNotMatch(r.json.message, /necesita actualizarse/);
    const e = await pedir("/zamorapp/estado");
    assert.equal(e.json.actualizar, false);
    assert.equal(e.json.incompatible, null);
  } finally {
    nube.estado.rlsNiega = false;
  }
});

// ─── Fase B: adjuntos en la PC (carpeta local + cola de subida) ───
const ORG = "10000000-0000-0000-0000-000000000001";
const RUTA_A = `${ORG}/30000000-0000-0000-0000-00000000000a/examen-prueba.pdf`;
const RUTA_B = `${ORG}/30000000-0000-0000-0000-00000000000b/de-otra-empresa.pdf`;
const PDF = "%PDF-1.4\nprueba de adjunto local\n%%EOF\n";
// Como lo manda supabase-js desde el navegador (File → FormData)
function formulario(texto, tipo = "application/pdf") {
  const f = new FormData();
  f.append("cacheControl", "3600");
  f.append("", new Blob([texto], { type: tipo }), "archivo");
  return f;
}
// status y json; los assert de status llevan el json como mensaje para que el CI muestre la causa
async function subirArchivo(ruta, { token, tipo, metodo = "POST", upsert = false } = {}) {
  const r = await fetch(`${urlPuerta}/storage/v1/object/adjuntos/${ruta}`, {
    method: metodo, headers: { Authorization: `Bearer ${token}`, "x-upsert": String(upsert) }, body: formulario(PDF, tipo),
  });
  return { status: r.status, json: await r.json().catch(() => null) };
}
const conEstado = (r, esperado) => assert.equal(r.status, esperado, JSON.stringify(r.json));
async function enLaCola(ruta) {
  const c = new pg.Client({ connectionString: motor.url() });
  await c.connect();
  try { return (await c.query("select estado, intentos, motivo, autor from local.adjuntos_cola where ruta = $1", [ruta])).rows[0] || null; } finally { await c.end(); }
}
async function enLaCopiaDB(sql, params) {
  const c = new pg.Client({ connectionString: motor.url() });
  await c.connect();
  try { await c.query("set session_replication_role = replica"); return await c.query(sql, params); } finally { await c.end(); }
}
async function enLaNubeDB(sql, params) {
  const c = new pg.Client({ connectionString: NUBE_DB });
  await c.connect();
  try { return await c.query(sql, params); } finally { await c.end(); }
}

test("adjuntos: con internet se guardan en la PC, se ven desde ella y suben solos a la nube", { skip: omitir }, async () => {
  nube.estado.caida = false;
  await nubeObj.comprobar();
  const e = await pedir("/auth/v1/token?grant_type=password", { metodo: "POST", cuerpo: { email: "meda@x", password: "clave-med" } });
  tokenMed = e.json.access_token;
  // Copia atrasada (así falló el CI con PostgREST real): en la PC el médico aún figura inactivo, en la nube ya no.
  // Con internet decide la nube: la subida pasa igual.
  await enLaCopiaDB("update public.miembros set activo = false where usuario_id = $1", ["00000000-0000-0000-0000-0000000000a2"]);
  let s;
  try { s = await subirArchivo(RUTA_A, { token: tokenMed }); } finally {
    await enLaCopiaDB("update public.miembros set activo = true where usuario_id = $1", ["00000000-0000-0000-0000-0000000000a2"]);
  }
  assert.equal(s.status, 200, JSON.stringify(s.json));
  assert.equal(s.json.Key, `adjuntos/${RUTA_A}`);
  assert.equal(fs.readFileSync(path.join(datos, "adjuntos", "adjuntos", ...RUTA_A.split("/")), "utf8"), PDF);
  // Repetir sin upsert: ya existe
  conEstado(await subirArchivo(RUTA_A, { token: tokenMed }), 409);
  // Recién subido (la fila aún no existe): quien lo subió ya lo puede firmar y ver desde la PC
  const f = await pedir(`/storage/v1/object/sign/adjuntos/${RUTA_A}`, { metodo: "POST", token: tokenMed, cuerpo: { expiresIn: 600 } });
  assert.equal(f.status, 200, JSON.stringify(f.json));
  assert.match(f.json.signedURL, /^\/object\/sign\/adjuntos\/.+\?token=[\w-]+\.[\w-]+$/);
  const ver = await fetch(encodeURI(`${urlPuerta}/storage/v1${f.json.signedURL}`)); // sin sesión, como un <img>
  assert.equal(ver.status, 200);
  assert.equal(ver.headers.get("content-type"), "application/pdf");
  assert.equal(await ver.text(), PDF);
  // Firma alterada o de otra ruta: no
  const otra = f.json.signedURL.replace("examen-prueba", "otro");
  assert.equal((await fetch(encodeURI(`${urlPuerta}/storage/v1${otra}`))).status, 400);
  // Sube a la nube con la sesión del autor
  assert.equal((await enLaCola(RUTA_A)).estado, "pendiente");
  const r = await puerta.adjuntos.subir();
  assert.equal(r.subidos, 1);
  assert.equal((await enLaCola(RUTA_A)).estado, "subido");
  const enNube = nube.estado.archivos.get(`adjuntos/${RUTA_A}`);
  assert.equal(enNube.cuerpo, PDF);
  assert.equal(enNube.uid, "00000000-0000-0000-0000-0000000000a2");
  const est = await pedir("/zamorapp/estado");
  assert.deepEqual(est.json.adjuntos, { pendientes: 0, rechazados: 0 });
});

test("adjuntos: solo PDF, JPG o PNG que coincidan con su nombre, y solo en la organización de quien sube", { skip: omitir }, async () => {
  conEstado(await subirArchivo(`${ORG}/30000000-0000-0000-0000-00000000000a/x.pdf`, { token: tokenMed, tipo: "text/html" }), 415);
  conEstado(await subirArchivo(`${ORG}/30000000-0000-0000-0000-00000000000a/x.html`, { token: tokenMed, tipo: "application/pdf" }), 415);
  conEstado(await subirArchivo(`20000000-0000-0000-0000-000000000099/t/x.pdf`, { token: tokenMed }), 403);
  conEstado(await subirArchivo(`${ORG}/../../escape.pdf`, { token: tokenMed }), 400);
  conEstado(await subirArchivo(`${ORG}/%2e%2e/escape.pdf`, { token: tokenMed }), 400);
  assert.ok(!fs.existsSync(path.join(datos, "escape.pdf")) && !fs.existsSync(path.join(datos, "adjuntos", "escape.pdf")));
});

test("adjuntos: sin internet se ven los archivos de la PC (con las reglas de la fila); bajados una vez, se ven sin internet", { skip: omitir }, async () => {
  // Dos filas en la nube: una de la empresa A (la ve medA) y otra de B (no la ve); el archivo de B solo está en la nube
  for (const [ruta, trab] of [[RUTA_A, "30000000-0000-0000-0000-00000000000a"], [RUTA_B, "30000000-0000-0000-0000-00000000000b"]]) {
    await enLaNubeDB(`insert into clinico.adjuntos (org_id, trabajador_id, nombre, ruta, tipo_mime, tamano) values ($1, $2, 'x.pdf', $3, 'application/pdf', 40) on conflict (ruta) do nothing`, [ORG, trab, ruta]);
  }
  nube.estado.archivos.set(`adjuntos/${RUTA_B}`, { cuerpo: PDF, tipo: "application/pdf" });
  const RUTA_A2 = `${ORG}/30000000-0000-0000-0000-00000000000a/solo-en-la-nube.pdf`;
  await enLaNubeDB(`insert into clinico.adjuntos (org_id, trabajador_id, nombre, ruta, tipo_mime, tamano) values ($1, $2, 'y.pdf', $3, 'application/pdf', 40) on conflict (ruta) do nothing`, [ORG, "30000000-0000-0000-0000-00000000000a", RUTA_A2]);
  nube.estado.archivos.set(`adjuntos/${RUTA_A2}`, { cuerpo: PDF, tipo: "application/pdf" });
  await replicaObj.ciclo();
  // Con internet: el que solo está en la nube se baja una vez por la URL firmada de la PC y queda guardado
  const lote = await pedir("/storage/v1/object/sign/adjuntos", { metodo: "POST", token: tokenMed, cuerpo: { expiresIn: 600, paths: [RUTA_A, RUTA_A2] } });
  assert.equal(lote.status, 200, JSON.stringify(lote.json));
  assert.equal(lote.json.length, 2);
  assert.equal((await fetch(encodeURI(`${urlPuerta}/storage/v1${lote.json[1].signedURL}`))).status, 200);
  assert.ok(fs.existsSync(path.join(datos, "adjuntos", "adjuntos", ...RUTA_A2.split("/"))));

  // try/finally: si algo falla sin internet, la nube vuelve igual y la falla no arrastra a las pruebas que siguen
  const rutaNuevo = `${ORG}/30000000-0000-0000-0000-00000000000a/nuevo.pdf`;
  try {
    nube.estado.caida = true;
    await nubeObj.comprobar();
    const a = await pedir(`/storage/v1/object/sign/adjuntos/${RUTA_A2}`, { metodo: "POST", token: tokenMed, cuerpo: { expiresIn: 600 } });
    assert.equal(a.status, 200, JSON.stringify(a.json));
    assert.equal(await (await fetch(encodeURI(`${urlPuerta}/storage/v1${a.json.signedURL}`))).text(), PDF);
    const conSesion = await fetch(`${urlPuerta}/storage/v1/object/authenticated/adjuntos/${RUTA_A}`, { headers: { Authorization: `Bearer ${tokenMed}` } });
    assert.equal(conSesion.status, 200, await conSesion.clone().text());
    // La fila de la empresa B no es suya (RLS de la copia): ni firma ni descarga
    const b = await pedir(`/storage/v1/object/sign/adjuntos/${RUTA_B}`, { metodo: "POST", token: tokenMed, cuerpo: { expiresIn: 600 } });
    assert.equal(b.status, 400, JSON.stringify(b.json));
    const bl = await pedir("/storage/v1/object/sign/adjuntos", { metodo: "POST", token: tokenMed, cuerpo: { expiresIn: 600, paths: [RUTA_B] } });
    assert.equal(bl.json[0].signedURL, null);
    // Sin sesión no se firma nada
    assert.equal((await pedir(`/storage/v1/object/sign/adjuntos/${RUTA_A}`, { metodo: "POST", cuerpo: { expiresIn: 600 } })).status, 401);
    // Archivos nuevos sin internet: esperan a que vuelva (la fila de clinico.adjuntos aún no se guarda en la PC)
    // Fase A cableada (hallazgo de «un día de Cesar»): un archivo nuevo sin internet se guarda en la PC y espera en la cola
    const nuevo = await subirArchivo(rutaNuevo, { token: tokenMed });
    assert.equal(nuevo.status, 200, JSON.stringify(nuevo.json));
    assert.ok(fs.existsSync(path.join(datos, "adjuntos", "adjuntos", ...rutaNuevo.split("/"))));
    assert.equal((await enLaCola(rutaNuevo)).estado, "pendiente");
  } finally {
    nube.estado.caida = false;
    await nubeObj.comprobar();
    await puerta.adjuntos.subir(); // el archivo guardado sin internet sube ahora y no estorba a la prueba siguiente
    assert.equal((await enLaCola(rutaNuevo)).estado, "subido");
    await nubeObj.comprobar();
  }
});

test("adjuntos: si la nube rechaza un archivo, se reintenta y a los 5 intentos queda «rechazado» sin borrarse de la PC", { skip: omitir }, async () => {
  const ruta = `${ORG}/30000000-0000-0000-0000-00000000000a/rechazado.pdf`;
  conEstado(await subirArchivo(ruta, { token: tokenMed }), 200);
  nube.estado.storageRechaza = 5;
  for (let i = 0; i < 5; i++) await puerta.adjuntos.subir();
  const c = await enLaCola(ruta);
  assert.equal(c.estado, "rechazado");
  assert.equal(c.intentos, 5);
  assert.match(c.motivo, /mime type/);
  assert.ok(fs.existsSync(path.join(datos, "adjuntos", "adjuntos", ...ruta.split("/"))));
  assert.equal((await pedir("/zamorapp/estado")).json.adjuntos.rechazados, 1);
  // Reemplazarlo (upsert) lo vuelve a poner en cola
  conEstado(await subirArchivo(ruta, { token: tokenMed, upsert: true }), 200);
  assert.equal((await enLaCola(ruta)).estado, "pendiente");
  await puerta.adjuntos.subir();
  assert.equal((await enLaCola(ruta)).estado, "subido");
});

test("fase C.2: los adjuntos van en el respaldo (paquete tar cifrado en Drive), no se repiten si nada cambió y vuelven al restaurar", { skip: omitir || !postgrestReal, timeout: 180_000 }, async () => {
  nube.estado.caida = false; await nubeObj.comprobar();
  const externa = fs.mkdtempSync(path.join(os.tmpdir(), "drive2-"));
  assert.equal((await pedir("/zamorapp/respaldo/configurar", { metodo: "POST", token: tokenAdmin, cuerpo: { carpeta: externa, clave: "clave-de-respaldo", confirmacion: "clave-de-respaldo" } })).status, 200);
  const local = path.join(datos, "adjuntos", "adjuntos", ...RUTA_A.split("/"));
  assert.equal(fs.readFileSync(local, "utf8"), PDF, "el adjunto de la prueba anterior sigue en la PC");
  let r = await fetch(`${urlPuerta}/zamorapp/respaldar`, { method: "POST", headers: { "X-Zamorapp-Control": CONTROL } });
  let j = await r.json();
  assert.equal(r.status, 200, JSON.stringify(j));
  assert.ok(j.adjuntos?.archivos >= 1 && j.adjuntos.nuevo && j.adjuntos.archivo.endsWith(".adjuntos.tar") && fs.existsSync(j.adjuntos.archivo), JSON.stringify(j.adjuntos));
  assert.ok(j.adjuntos.externo?.endsWith(".adjuntos.zamorapp") && fs.existsSync(j.adjuntos.externo));
  assert.equal(j.probada.ok, true); assert.match(j.probada.detalle, /adjuntos/);
  assert.ok(!fs.readFileSync(j.adjuntos.externo).includes("prueba de adjunto"), "el paquete externo va cifrado");
  // Es tar estándar: el nombre del archivo aparece en la cabecera del paquete local
  assert.ok(fs.readFileSync(j.adjuntos.archivo).includes("examen-prueba.pdf"));
  // Sin cambios, el segundo respaldo no arma otro paquete ni otra copia externa
  r = await fetch(`${urlPuerta}/zamorapp/respaldar`, { method: "POST", headers: { "X-Zamorapp-Control": CONTROL } });
  const j2 = await r.json();
  assert.equal(r.status, 200, JSON.stringify(j2));
  assert.equal(j2.adjuntos.nuevo, false); assert.equal(j2.adjuntos.externo, j.adjuntos.externo);
  assert.equal(fs.readdirSync(externa).filter((f) => f.endsWith(".adjuntos.zamorapp")).length, 1);
  assert.ok(!(await pedir("/zamorapp/respaldo", { token: tokenAdmin })).json.copias.some((c) => c.archivo.endsWith(".adjuntos.zamorapp")), "la lista de copias muestra solo las de la base");
  // Se pierde el archivo de la PC; restaurar la copia externa lo trae de vuelta junto con la base
  fs.rmSync(local);
  const pr = await pedir("/zamorapp/restaurar", { metodo: "POST", token: tokenAdmin, cuerpo: { archivo: j2.externo, clave: "clave-de-respaldo" } });
  assert.equal(pr.status, 200, JSON.stringify(pr.json));
  assert.ok(estado.d.restaurar?.adjuntos && fs.existsSync(estado.d.restaurar.adjuntos));
  assert.equal(estado.d.restaurar.origenAdjuntos, j.adjuntos.externo);
  assert.equal(await motor.aplicarRestauracion(), true);
  assert.equal(fs.readFileSync(local, "utf8"), PDF, "el adjunto volvió");
  assert.equal(fs.existsSync(path.join(respaldoObj.carpetaLocal, "restaurar.adjuntos.tar")), false);
  await replicaObj.ciclo();
  // Analizar: en Drive quedan 2 paquetes de adjuntos y en la PC 1 (cada uno trae todo); las copias de la base siguen aparte.
  // Paquetes «viejos» de días anteriores (los nombres van por fecha) y un adjunto nuevo que obliga a armar otro paquete
  for (const d of ["20260101-0900", "20260102-0900", "20260103-0900"]) {
    fs.writeFileSync(path.join(externa, `zamorapp-${d}.adjuntos.zamorapp`), "viejo");
    fs.writeFileSync(path.join(externa, `zamorapp-${d}.zamorapp`), "viejo");
    fs.writeFileSync(path.join(respaldoObj.carpetaLocal, `zamorapp-${d}.adjuntos.tar`), "viejo");
  }
  const adjDir = path.join(datos, "adjuntos", "adjuntos", ORG, "30000000-0000-0000-0000-00000000000a");
  fs.writeFileSync(path.join(adjDir, "extra-1.pdf"), PDF);
  const basesAntes = fs.readdirSync(externa).filter((f) => f.endsWith(".zamorapp") && !f.endsWith(".adjuntos.zamorapp")).length;
  const rr = await fetch(`${urlPuerta}/zamorapp/respaldar`, { method: "POST", headers: { "X-Zamorapp-Control": CONTROL } });
  const jj = await rr.json();
  assert.equal(rr.status, 200, JSON.stringify(jj));
  assert.equal(jj.adjuntos.nuevo, true);
  assert.equal(fs.readdirSync(externa).filter((f) => f.endsWith(".adjuntos.zamorapp")).length, 2, fs.readdirSync(externa).join(", "));
  assert.equal(fs.readdirSync(respaldoObj.carpetaLocal).filter((f) => f.endsWith(".adjuntos.tar")).length, 1);
  assert.equal(fs.readdirSync(externa).filter((f) => f.endsWith(".zamorapp") && !f.endsWith(".adjuntos.zamorapp")).length, basesAntes, "las copias de la base no se tocan (30 en Drive)");
  for (const f of fs.readdirSync(externa)) if (f.startsWith("zamorapp-202601")) fs.rmSync(path.join(externa, f)); // las de mentira
  // Analizar: si el paquete de adjuntos más nuevo no abre, se restaura la base igual con el paquete anterior que sí abra
  const buenos = fs.readdirSync(externa).filter((f) => f.endsWith(".adjuntos.zamorapp")).sort();
  const roto = path.join(externa, "zamorapp-29991231-2359.adjuntos.zamorapp");
  fs.writeFileSync(roto, Buffer.concat([fs.readFileSync(path.join(externa, buenos[buenos.length - 1])).subarray(0, 200), crypto.randomBytes(300)]));
  const bases = fs.readdirSync(externa).filter((f) => f.endsWith(".zamorapp") && !f.endsWith(".adjuntos.zamorapp")).sort();
  const pr2 = await pedir("/zamorapp/restaurar", { metodo: "POST", token: tokenAdmin, cuerpo: { archivo: path.join(externa, bases[bases.length - 1]), clave: "clave-de-respaldo" } });
  assert.equal(pr2.status, 200, JSON.stringify(pr2.json));
  assert.equal(pr2.json.adjuntos, true); assert.match(pr2.json.aviso, /más nuevo no abrió/);
  assert.equal(path.basename(estado.d.restaurar.origenAdjuntos), buenos[buenos.length - 1]);
  assert.equal((await pedir("/zamorapp/respaldo", { token: tokenAdmin })).json.restauracionPendiente.aviso, pr2.json.aviso);
  // Y si ninguno abre (otra clave): solo la base, con aviso
  for (const f of buenos) fs.rmSync(path.join(externa, f));
  const pr3 = await pedir("/zamorapp/restaurar", { metodo: "POST", token: tokenAdmin, cuerpo: { archivo: path.join(externa, bases[bases.length - 1]), clave: "clave-de-respaldo" } });
  assert.equal(pr3.status, 200, JSON.stringify(pr3.json));
  assert.equal(pr3.json.adjuntos, false); assert.match(pr3.json.aviso, /solo la base/);
  assert.equal((await pedir("/zamorapp/restaurar/cancelar", { metodo: "POST", token: tokenAdmin })).json.cancelada, true);
  fs.rmSync(externa, { recursive: true, force: true });
});

test("si PostgREST se cae, se vuelve a lanzar solo (también si cae al arrancar)", { skip: omitir }, async () => {
  const marca = path.join(datos, "caer-postgrest");
  if (!postgrestReal) fs.writeFileSync(marca, "2"); // los dos próximos arranques del simulador se caen con código 3
  process.env.SIMULAR_CAIDA_POSTGREST = marca;
  try {
    motor.hijos.find((h) => h.spawnargs.some((a) => /postgrest/.test(a)))?.kill();
    await new Promise((r) => setTimeout(r, 500));
    await motor.relanzando;
    assert.ok(!fs.existsSync(marca), "pasó por las dos caídas");
    const r = await pedir("/rest/v1/trabajadores?select=id,empresa_id", { token: tokenAdmin });
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
