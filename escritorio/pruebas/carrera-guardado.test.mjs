// Carrera «guardar consulta» contra la réplica (06-nov-2026, CI Windows del #306: 40P01 en velocidad.test.mjs).
// guardar_consulta bloquea primero la consulta y después la aptitud (y diagnósticos, reposo…). La réplica aplicaba un
// lote de la nube en el orden en que llegó, que es el inverso (aptitud, diagnósticos… y la consulta al final, porque
// guardar_consulta la escribe al final). Cada uno tenía lo que el otro esperaba: abrazo mortal y «no se pudo guardar».
// La prueba arma ese cruce a propósito, sin depender de la suerte:
//   1. Una sesión aparte retiene un diagnóstico: el guardado (que lo borra) queda detenido CON la consulta tomada.
//   2. La nube cambia la aptitud y luego la consulta; la réplica baja ese lote: toma la aptitud y espera la consulta.
//   3. Se suelta el diagnóstico: el guardado va por la aptitud. Sin el candado de escrituras, aquí había 40P01.
// Garantía: el guardado responde 2xx al primer intento (la puerta no tuvo que reintentar), la réplica termina sin
// error y nada se pierde. Corre con el mismo banco que puerta.test.mjs (correr.sh antes).
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
const omitir = !NUBE_DB || !process.env.PG_BIN || !process.env.ZAMORAPP_POSTGREST ? "Faltan NUBE_DB, PG_BIN o ZAMORAPP_POSTGREST" : false;
const datos = fs.mkdtempSync(path.join(os.tmpdir(), "zamorapp-carrera-"));
const ORG = "10000000-0000-0000-0000-000000000001", EMPRESA = "20000000-0000-0000-0000-00000000000a";
const MED = "00000000-0000-0000-0000-0000000000a2";

const registroP = [];
let nube, puerta, motor, estado, replicaObj, nubeObj, bandejaObj, bloquesObj, urlPuerta;
async function pedir(ruta, { metodo = "GET", token, cuerpo, cabeceras = {} } = {}) {
  const r = await fetch(`${urlPuerta}${ruta}`, { method: metodo, headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...cabeceras }, body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo) });
  const texto = await r.text();
  let json = null; try { json = texto ? JSON.parse(texto) : null; } catch { json = texto; }
  return { status: r.status, json };
}
async function enBase(url, sql, params = []) { const c = new pg.Client({ connectionString: url }); await c.connect(); try { return (await c.query(sql, params)).rows; } finally { await c.end(); } }
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
// Sesiones de la base local detenidas esperando un bloqueo (filas o candado), sin contar la que pregunta
async function esperando() {
  const [{ n }] = await enBase(motor.url(), "select count(*)::int as n from pg_stat_activity where wait_event_type = 'Lock' and pid <> pg_backend_pid()");
  return n;
}
async function hasta(cond, que, ms = 20_000) {
  const fin = performance.now() + ms;
  while (performance.now() < fin) { if (await cond()) return; await esperar(25); }
  throw new Error(`No pasó a tiempo: ${que}`);
}

before(async () => {
  if (omitir) return;
  nube = simularNube({ baseUrl: NUBE_DB, usuarios: { "admin@x": { id: "00000000-0000-0000-0000-0000000000a1", clave: "clave-admin" }, "meda@x": { id: MED, clave: "clave-med", usuario: "richard" } } });
  await new Promise((ok) => nube.servidor.listen(0, "127.0.0.1", ok));
  Object.assign(process.env, { ZAMORAPP_DATOS: datos, ZAMORAPP_NUBE_URL: `http://127.0.0.1:${nube.servidor.address().port}`, ZAMORAPP_NUBE_ANON: "anon-prueba",
    ZAMORAPP_LLAVE: crypto.randomBytes(32).toString("hex"), ZAMORAPP_PG_BIN: process.env.PG_BIN, ZAMORAPP_MIGRACIONES: path.join(raiz, "supabase/migrations"),
    ZAMORAPP_BASE_EXTRA: path.join(raiz, "escritorio/base"), ZAMORAPP_STUBS: path.join(raiz, "supabase/pruebas/00_stubs_supabase.sql"), PUERTO_BASE: "55549", PUERTO_POSTGREST: "55550" });
  const { Estado } = await import("../puerta/estado.mjs"); const { Motor } = await import("../puerta/motor.mjs"); const { Nube } = await import("../puerta/nube.mjs");
  const { Replica } = await import("../puerta/replica.mjs"); const { Bandeja } = await import("../puerta/bandeja.mjs"); const { Bloques } = await import("../puerta/bloques.mjs");
  const { crearPuerta } = await import("../puerta/servidor.mjs"); const { CONFIG } = await import("../puerta/config.mjs");
  estado = new Estado(datos, CONFIG.llave); motor = new Motor(estado); await motor.iniciar();
  nubeObj = new Nube(estado); await nubeObj.comprobar();
  replicaObj = new Replica(estado, nubeObj, motor); bandejaObj = new Bandeja(estado, nubeObj, motor, replicaObj); bloquesObj = new Bloques(estado, nubeObj, motor, replicaObj);
  puerta = crearPuerta({ estado, nube: nubeObj, motor, replica: replicaObj, bandeja: bandejaObj, bloques: bloquesObj, origen: "http://127.0.0.1:54332", control: "x", registro: (l) => registroP.push(l) });
  await new Promise((ok) => puerta.listen(0, "127.0.0.1", ok));
  urlPuerta = `http://127.0.0.1:${puerta.address().port}`;
}, { timeout: 300_000 });
after(async () => {
  await bandejaObj?.enCurso?.catch(() => {});
  for (let i = 0; replicaObj?.ocupada && i < 200; i++) await esperar(50);
  puerta?.closeAllConnections?.(); puerta?.close(); motor?.detener(); await nube?.cerrar(); fs.rmSync(datos, { recursive: true, force: true });
});

test("guardar una consulta mientras la réplica baja su aptitud y la consulta: sin abrazo mortal (40P01)", { skip: omitir, timeout: 180_000 }, async () => {
  const tokenAdmin = (await pedir("/auth/v1/token?grant_type=password", { metodo: "POST", cuerpo: { email: "admin@x", password: "clave-admin" } })).json.access_token;
  const serie = String.fromCharCode(65 + crypto.randomInt(22)) + String.fromCharCode(65 + crypto.randomInt(26));
  assert.equal((await pedir("/zamorapp/equipo", { metodo: "POST", token: tokenAdmin, cuerpo: { nombre: "PC carrera", serie } })).status, 200);
  const tokenMed = (await pedir("/auth/v1/token?grant_type=password", { metodo: "POST", cuerpo: { email: "meda@x", password: "clave-med" } })).json.access_token;
  await replicaObj.ciclo(); assert.ok(estado.d.copiaCompleta, replicaObj.error || "");
  assert.equal(await bloquesObj.reponer(), true, bloquesObj.ultimoError || "");

  // Paciente y consulta con un diagnóstico y una aptitud, ya subidos y bajados (la PC y la nube iguales)
  const trab = crypto.randomUUID(), cid = crypto.randomUUID();
  assert.ok([200, 201].includes((await pedir("/rest/v1/trabajadores", { metodo: "POST", token: tokenMed, cuerpo: { id: trab, org_id: ORG, empresa_id: EMPRESA, cedula: `8${crypto.randomInt(1e7)}`, nombres: "Carrera", apellidos: "Prueba" } })).status));
  assert.ok([200, 201].includes((await pedir("/rest/v1/consultas", { metodo: "POST", token: tokenMed, cabeceras: { "Content-Profile": "clinico" }, cuerpo: { id: cid, org_id: ORG, empresa_id: EMPRESA, trabajador_id: trab, tipo: "primera" } })).status));
  const guardar = (motivo, dx) => pedir("/rest/v1/rpc/guardar_consulta", { metodo: "POST", token: tokenMed, cuerpo: {
    p_id: cid, p_consulta: { tipo: "primera", motivo_texto: motivo, conclusiones: "Apto" },
    p_diagnosticos: [{ cie10: dx, descripcion: `Diagnóstico ${dx}`, principal: true }], p_aptitud: { clasificacion: "elegible" }, p_reposo: null, p_cerrar: false } });
  let r = await guardar("Inicial", "Z00.0");
  assert.ok([200, 204].includes(r.status), JSON.stringify(r.json));
  await bandejaObj.enCurso?.catch(() => {}); await bandejaObj.subir(); await replicaObj.ciclo();
  assert.equal((await bandejaObj.resumen()).pendientes, 0, "todo subió antes de armar la carrera");
  const [dx] = await enBase(motor.url(), "select id from clinico.diagnosticos where consulta_id = $1", [cid]);
  assert.ok(dx, "el diagnóstico llegó a la PC");

  // 1. Retener el diagnóstico: el guardado (que lo cambia por otro) queda detenido con la consulta ya tomada
  const reten = new pg.Client({ connectionString: motor.url() }); await reten.connect();
  await reten.query("begin"); await reten.query("select 1 from clinico.diagnosticos where id = $1 for update", [dx.id]);
  try {
    const intentos = registroP.length;
    const guardado = guardar("Mientras baja la nube", "J06.9");
    await hasta(async () => (await esperando()) >= 1, "el guardado espera el diagnóstico retenido");
    // 2. La nube cambia la aptitud y después la consulta (el orden de un guardado hecho en otro equipo)
    await enBase(NUBE_DB, `begin;
      update clinico.aptitudes set observacion = 'Cambiada en la nube' where consulta_id = '${cid}';
      update clinico.consultas set indicaciones = 'Desde la nube' where id = '${cid}';
      commit;`);
    const replicaEnCurso = replicaObj.ciclo();
    await hasta(async () => (await esperando()) >= 2, "la réplica también espera");
    // 3. Soltar el diagnóstico y dejar que cada uno siga
    await reten.query("commit");
    r = await guardado;
    await replicaEnCurso;
    assert.ok([200, 204].includes(r.status), `el guardado no falló: ${JSON.stringify(r.json)}`);
    assert.ok(!registroP.slice(intentos).some((l) => /40P01|bloqueo mutuo/.test(l)), "la puerta no tuvo que reintentar: no hubo abrazo mortal");
    assert.equal(replicaObj.error, null, `la réplica terminó sin error: ${replicaObj.error}`);
    assert.equal(replicaObj.apartadas(), 0, "nada quedó apartado");
  } finally { await reten.end().catch(() => {}); }

  // Nada se pierde: la consulta cambió en los dos lados, así que lo guardado en la PC llega a la nube o queda en
  // «Conflictos» con su texto (la nube decide, como siempre); la aptitud, que solo cambió en la nube, baja a la PC
  await bandejaObj.enCurso?.catch(() => {}); await bandejaObj.subir(); await replicaObj.ciclo();
  const [enNube] = await enBase(NUBE_DB, "select motivo_texto from clinico.consultas where id = $1", [cid]);
  const [enConflicto] = await enBase(motor.url(), "select count(*)::int as n from local.bandeja where fila_id = $1 and estado = 'conflicto' and datos ->> 'motivo_texto' = 'Mientras baja la nube'", [cid]);
  assert.ok(enNube.motivo_texto === "Mientras baja la nube" || enConflicto.n === 1, "lo guardado en la PC no se perdió");
  const [apt] = await enBase(motor.url(), "select observacion from clinico.aptitudes where consulta_id = $1", [cid]);
  assert.equal(apt.observacion, "Cambiada en la nube", "y la aptitud cambiada en la nube bajó a la PC");
});
