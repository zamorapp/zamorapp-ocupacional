// Guardar la misma consulta muchas veces seguidas en la PC (29-oct): cada subida de la bandeja debe salir sobre la
// versión que la nube dejó con la subida anterior de esta misma PC. Antes, la copia aún no la había bajado y la base
// quedaba vieja: conflictos falsos y la nube con un texto viejo. Garantía: 0 conflictos y la nube con lo último.
// Datos propios (equipo, paciente y consulta nuevos) para no pisar otras pruebas del banco. correr.sh antes.
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
const datos = fs.mkdtempSync(path.join(os.tmpdir(), "zamorapp-seguidos-"));
const ORG = "10000000-0000-0000-0000-000000000001", EMPRESA = "20000000-0000-0000-0000-00000000000a";
const MED = "00000000-0000-0000-0000-0000000000a2";

const registroB = [];
let nube, puerta, motor, estado, replicaObj, nubeObj, bandejaObj, bloquesObj, urlPuerta, CONFIG;
async function pedir(ruta, { metodo = "GET", token, cuerpo, cabeceras = {} } = {}) {
  const r = await fetch(`${urlPuerta}${ruta}`, { method: metodo, headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...cabeceras }, body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo) });
  const texto = await r.text();
  let json = null; try { json = texto ? JSON.parse(texto) : null; } catch { json = texto; }
  return { status: r.status, json };
}
async function enBase(url, sql, params = []) { const c = new pg.Client({ connectionString: url }); await c.connect(); try { return (await c.query(sql, params)).rows; } finally { await c.end(); } }

before(async () => {
  if (omitir) return;
  nube = simularNube({ baseUrl: NUBE_DB, usuarios: { "admin@x": { id: "00000000-0000-0000-0000-0000000000a1", clave: "clave-admin" }, "meda@x": { id: MED, clave: "clave-med", usuario: "richard" } } });
  await new Promise((ok) => nube.servidor.listen(0, "127.0.0.1", ok));
  Object.assign(process.env, { ZAMORAPP_DATOS: datos, ZAMORAPP_NUBE_URL: `http://127.0.0.1:${nube.servidor.address().port}`, ZAMORAPP_NUBE_ANON: "anon-prueba",
    ZAMORAPP_LLAVE: crypto.randomBytes(32).toString("hex"), ZAMORAPP_PG_BIN: process.env.PG_BIN, ZAMORAPP_MIGRACIONES: path.join(raiz, "supabase/migrations"),
    ZAMORAPP_BASE_EXTRA: path.join(raiz, "escritorio/base"), ZAMORAPP_STUBS: path.join(raiz, "supabase/pruebas/00_stubs_supabase.sql"), PUERTO_BASE: "55539", PUERTO_POSTGREST: "55540" });
  const { Estado } = await import("../puerta/estado.mjs"); const { Motor } = await import("../puerta/motor.mjs"); const { Nube } = await import("../puerta/nube.mjs");
  const { Replica } = await import("../puerta/replica.mjs"); const { Bandeja } = await import("../puerta/bandeja.mjs"); const { Bloques } = await import("../puerta/bloques.mjs");
  const { crearPuerta } = await import("../puerta/servidor.mjs"); ({ CONFIG } = await import("../puerta/config.mjs"));
  estado = new Estado(datos, CONFIG.llave); motor = new Motor(estado); await motor.iniciar();
  nubeObj = new Nube(estado); await nubeObj.comprobar();
  replicaObj = new Replica(estado, nubeObj, motor); bandejaObj = new Bandeja(estado, nubeObj, motor, replicaObj); bloquesObj = new Bloques(estado, nubeObj, motor, replicaObj);
  puerta = crearPuerta({ estado, nube: nubeObj, motor, replica: replicaObj, bandeja: bandejaObj, bloques: bloquesObj, origen: "http://127.0.0.1:54332", control: "x", registro: () => {} });
  if (process.env.DEPURAR) { const orig = nubeObj.rpc.bind(nubeObj); nubeObj.rpc = async (u, f, a) => { const r = await orig(u, f, a); if (f === "aplicar_cambios") registroB.push(a.p_lote.filter((x) => x.tabla === "clinico.consultas").map((x) => [x.id.slice(0, 4), x.version_base, x.datos?.motivo_texto, r.find((y) => y.id === x.id)?.estado, r.find((y) => y.id === x.id)?.version])); return r; }; }
  await new Promise((ok) => puerta.listen(0, "127.0.0.1", ok));
  urlPuerta = `http://127.0.0.1:${puerta.address().port}`;
}, { timeout: 300_000 });
after(async () => {
  // Lo que el último guardado lanzó en segundo plano (bandeja, réplica) termina antes de cerrar la nube simulada:
  // si no, usa su pool ya cerrado y la prueba falla después de pasar
  await bandejaObj?.enCurso?.catch(() => {});
  for (let i = 0; replicaObj?.ocupada && i < 200; i++) await new Promise((r) => setTimeout(r, 50));
  puerta?.closeAllConnections?.(); puerta?.close(); motor?.detener(); await nube?.cerrar(); fs.rmSync(datos, { recursive: true, force: true }); });


const conflictosEnNube = async (ids) => (await enBase(NUBE_DB, "select count(*)::int n from sync.conflictos where fila_id = any($1::uuid[])", [ids]))[0].n;
async function vaciar() {
  // Lo que los guardados lanzaron en segundo plano termina; luego se sube lo que quede hasta vaciar la bandeja
  for (let i = 0; i < 40; i++) {
    await bandejaObj.enCurso?.catch(() => {});
    for (let j = 0; replicaObj.ocupada && j < 200; j++) await new Promise((r) => setTimeout(r, 25));
    const r = await bandejaObj.resumen();
    if (!r.pendientes) return r;
    await bandejaObj.subir();
  }
  return bandejaObj.resumen();
}

test("guardar la misma consulta 20 veces seguidas en la PC: 0 conflictos y la nube queda con lo último", { skip: omitir, timeout: 600_000 }, async () => {
  const tokenAdmin = (await pedir("/auth/v1/token?grant_type=password", { metodo: "POST", cuerpo: { email: "admin@x", password: "clave-admin" } })).json.access_token;
  const serie = String.fromCharCode(65 + crypto.randomInt(22)) + String.fromCharCode(65 + crypto.randomInt(26));
  const alta = await pedir("/zamorapp/equipo", { metodo: "POST", token: tokenAdmin, cuerpo: { nombre: "PC guardados seguidos", serie } });
  assert.equal(alta.status, 200, JSON.stringify(alta.json));
  const tokenMed = (await pedir("/auth/v1/token?grant_type=password", { metodo: "POST", cuerpo: { email: "meda@x", password: "clave-med" } })).json.access_token;
  await replicaObj.ciclo(); assert.ok(estado.d.copiaCompleta, replicaObj.error || "");
  assert.equal(await bloquesObj.reponer(), true, bloquesObj.ultimoError || "");
  const trab = crypto.randomUUID(), cid = crypto.randomUUID();
  assert.ok([200, 201].includes((await pedir("/rest/v1/trabajadores", { metodo: "POST", token: tokenMed, cuerpo: { id: trab, org_id: ORG, empresa_id: EMPRESA, cedula: `8${crypto.randomInt(1e7)}`, nombres: "Guardados", apellidos: "Seguidos" } })).status));
  assert.ok([200, 201].includes((await pedir("/rest/v1/consultas", { metodo: "POST", token: tokenMed, cabeceras: { "Content-Profile": "clinico" }, cuerpo: { id: cid, org_id: ORG, empresa_id: EMPRESA, trabajador_id: trab, tipo: "primera" } })).status));
  await vaciar(); await replicaObj.ciclo();
  const consulta = (t) => ({ tipo: "primera", motivo_texto: t, enfermedad_actual: `Evolución ${t}`, examen_fisico: [{ sistema: "cardiovascular", hallazgo: "normal" }], signos_vitales: { ta: "120/80", fc: 72, peso: 70, talla: 1.7 }, conclusiones: "Apto" });
  const guardar = (t) => pedir("/rest/v1/rpc/guardar_consulta", { metodo: "POST", token: tokenMed, cuerpo: { p_id: cid, p_consulta: consulta(t), p_diagnosticos: [{ cie10: "Z00.0", descripcion: "Examen general", principal: true }], p_aptitud: { clasificacion: "elegible" }, p_reposo: null, p_cerrar: false } });
  const motivoNube = async () => (await enBase(NUBE_DB, "select motivo_texto from clinico.consultas where id = $1", [cid]))[0]?.motivo_texto;
  const motivoPC = async () => (await enBase(motor.url(), "select motivo_texto from clinico.consultas where id = $1", [cid]))[0]?.motivo_texto;
  const revisar = async () => (await enBase(motor.url(), "select estado, motivo, tabla from local.bandeja where estado <> 'pendiente'"));

  // Tres ritmos: sin espera (la subida y la réplica se cruzan con cada guardado), con la nube lenta (200 ms: las
  // subidas se solapan con varios guardados) y sin internet a mitad (se funden y suben al volver)
  for (const [ritmo, latencia] of [["rápido", 0], ["nube lenta", 200]]) {
    nube.estado.latenciaMs = latencia;
    for (let i = 0; i < 20; i++) {
      const r = await guardar(`${ritmo} ${i}`);
      assert.ok([200, 204].includes(r.status), JSON.stringify(r.json));
      assert.equal(await motivoPC(), `${ritmo} ${i}`, "la PC muestra siempre lo último que se guardó");
    }
    const r = await vaciar();
    nube.estado.latenciaMs = 0;
    assert.deepEqual(await revisar(), [], `${ritmo}: ningún conflicto ni rechazo en la bandeja`);
    assert.equal(r.pendientes, 0, `${ritmo}: la bandeja quedó vacía`);
    assert.equal(await motivoNube(), `${ritmo} 19`, `${ritmo}: la nube quedó con el último guardado`);
    await replicaObj.ciclo();
    assert.equal(await motivoPC(), `${ritmo} 19`, `${ritmo}: la copia sigue con lo último tras bajar la nube`);
  }

  nube.estado.caida = true; await nubeObj.comprobar();
  for (let i = 0; i < 5; i++) assert.ok([200, 204].includes((await guardar(`sin internet ${i}`)).status));
  nube.estado.caida = false; await nubeObj.comprobar();
  for (let i = 5; i < 10; i++) assert.ok([200, 204].includes((await guardar(`sin internet ${i}`)).status));
  await vaciar();
  if (process.env.DEPURAR) console.log(JSON.stringify(await enBase(motor.url(), "select b.id, b.version_base, b.estado, b.datos->>'motivo_texto' m, (select version from local.version_nube v where v.tabla=b.tabla and v.fila_id=b.fila_id) vn from local.bandeja b")), JSON.stringify(registroB));
  assert.deepEqual(await revisar(), [], "sin internet a mitad: ningún conflicto ni rechazo");
  assert.equal(await motivoNube(), "sin internet 9");

  assert.equal(await conflictosEnNube([cid, trab]), 0, "la nube no anotó conflictos de esta consulta");
});
