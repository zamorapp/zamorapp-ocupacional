// Medición «instantáneo como el SAME»: cuánto tarda abrir y guardar una consulta por la puerta cuando la PC
// responde desde su copia (local primero) frente a ir a la nube. La nube del banco está en la misma máquina, así
// que se le suma una ida y vuelta fija (LATENCIA_NUBE_MS) parecida a la medida desde Maturín (108-380 ms).
// Las cifras van al plan §9. Corre con el mismo banco que puerta.test.mjs (correr.sh antes).
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
const datos = fs.mkdtempSync(path.join(os.tmpdir(), "zamorapp-vel-"));
const LATENCIA_NUBE_MS = Number(process.env.LATENCIA_NUBE_MS || 200);
const VUELTAS = Number(process.env.VUELTAS || 20);
const ORG = "10000000-0000-0000-0000-000000000001", EMPRESA = "20000000-0000-0000-0000-00000000000a";
const MED = "00000000-0000-0000-0000-0000000000a2";

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
    ZAMORAPP_BASE_EXTRA: path.join(raiz, "escritorio/base"), ZAMORAPP_STUBS: path.join(raiz, "supabase/pruebas/00_stubs_supabase.sql"), PUERTO_BASE: "55529", PUERTO_POSTGREST: "55530" });
  const { Estado } = await import("../puerta/estado.mjs"); const { Motor } = await import("../puerta/motor.mjs"); const { Nube } = await import("../puerta/nube.mjs");
  const { Replica } = await import("../puerta/replica.mjs"); const { Bandeja } = await import("../puerta/bandeja.mjs"); const { Bloques } = await import("../puerta/bloques.mjs");
  const { crearPuerta } = await import("../puerta/servidor.mjs"); ({ CONFIG } = await import("../puerta/config.mjs"));
  estado = new Estado(datos, CONFIG.llave); motor = new Motor(estado); await motor.iniciar();
  nubeObj = new Nube(estado); await nubeObj.comprobar();
  replicaObj = new Replica(estado, nubeObj, motor); bandejaObj = new Bandeja(estado, nubeObj, motor, replicaObj); bloquesObj = new Bloques(estado, nubeObj, motor, replicaObj);
  puerta = crearPuerta({ estado, nube: nubeObj, motor, replica: replicaObj, bandeja: bandejaObj, bloques: bloquesObj, origen: "http://127.0.0.1:54332", control: "x", registro: () => {} });
  await new Promise((ok) => puerta.listen(0, "127.0.0.1", ok));
  urlPuerta = `http://127.0.0.1:${puerta.address().port}`;
}, { timeout: 300_000 });
after(async () => { puerta?.closeAllConnections?.(); puerta?.close(); motor?.detener(); await nube?.cerrar(); fs.rmSync(datos, { recursive: true, force: true }); });

const ms = (a) => { const s = [...a].sort((x, y) => x - y); const q = (p) => s[Math.min(s.length - 1, Math.floor(p * s.length))]; return { mediana: Math.round(q(0.5)), p95: Math.round(q(0.95)), max: Math.round(s[s.length - 1]) }; };
async function medir(veces, fn) { const t = []; for (let i = 0; i < veces; i++) { const a = performance.now(); await fn(i); t.push(performance.now() - a); } return ms(t); }
const resultados = {};

test("medir abrir y guardar una consulta: PC (copia local) frente a nube", { skip: omitir, timeout: 600_000 }, async () => {
  const tokenAdmin = (await pedir("/auth/v1/token?grant_type=password", { metodo: "POST", cuerpo: { email: "admin@x", password: "clave-admin" } })).json.access_token;
  const serie = String.fromCharCode(65 + crypto.randomInt(22)) + String.fromCharCode(65 + crypto.randomInt(26));
  assert.equal((await pedir("/zamorapp/equipo", { metodo: "POST", token: tokenAdmin, cuerpo: { nombre: "PC velocidad", serie } })).status, 200);
  const tokenMed = (await pedir("/auth/v1/token?grant_type=password", { metodo: "POST", cuerpo: { email: "meda@x", password: "clave-med" } })).json.access_token;
  await replicaObj.ciclo(); assert.ok(estado.d.copiaCompleta, replicaObj.error || "");
  assert.equal(await bloquesObj.reponer(), true, bloquesObj.ultimoError || "");
  // Un paciente y una consulta de trabajo
  const trab = crypto.randomUUID(), cid = crypto.randomUUID();
  assert.ok([200, 201].includes((await pedir("/rest/v1/trabajadores", { metodo: "POST", token: tokenMed, cuerpo: { id: trab, org_id: ORG, empresa_id: EMPRESA, cedula: `7${crypto.randomInt(1e7)}`, nombres: "Velocidad", apellidos: "Prueba" } })).status));
  assert.ok([200, 201].includes((await pedir("/rest/v1/consultas", { metodo: "POST", token: tokenMed, cabeceras: { "Content-Profile": "clinico" }, cuerpo: { id: cid, org_id: ORG, empresa_id: EMPRESA, trabajador_id: trab, tipo: "primera" } })).status));
  await bandejaObj.subir(); await replicaObj.ciclo();
  const consulta = (i) => ({ tipo: "primera", motivo_texto: `Control ${i}`, enfermedad_actual: "Asintomático ".repeat(20), examen_fisico: [{ sistema: "cardiovascular", hallazgo: "normal" }], signos_vitales: { ta: "120/80", fc: 72, peso: 70, talla: 1.7 }, conclusiones: "Apto" });
  const guardar = (i) => pedir("/rest/v1/rpc/guardar_consulta", { metodo: "POST", token: tokenMed, cuerpo: { p_id: cid, p_consulta: consulta(i), p_diagnosticos: [{ cie10: "Z00.0", descripcion: "Examen general", principal: true }], p_aptitud: { clasificacion: "elegible" }, p_reposo: null, p_cerrar: false } });
  // «Abrir» = lo que pide la pantalla de atención: la consulta, el paciente y sus diagnósticos (tres lecturas)
  const abrir = async () => {
    const [a, b, c] = await Promise.all([
      pedir(`/rest/v1/consultas?id=eq.${cid}&select=*`, { token: tokenMed, cabeceras: { "Accept-Profile": "clinico" } }),
      pedir(`/rest/v1/trabajadores?id=eq.${trab}&select=id,cedula,nombres,apellidos,numero_historia`, { token: tokenMed }),
      pedir(`/rest/v1/diagnosticos?consulta_id=eq.${cid}&select=*`, { token: tokenMed, cabeceras: { "Accept-Profile": "clinico" } }),
    ]);
    assert.equal(a.status, 200, JSON.stringify(a.json)); assert.equal(b.status, 200); assert.equal(c.status, 200);
  };
  // 1) Local primero: lecturas de la copia al día y guardado en la PC (bandeja)
  await guardar(0); await abrir(); // calentar
  resultados.pc_abrir = await medir(VUELTAS, abrir);
  resultados.pc_guardar = await medir(VUELTAS, async (i) => { const r = await guardar(i); assert.ok([200, 204].includes(r.status), JSON.stringify(r.json)); });
  assert.ok((await bandejaObj.resumen()).pendientes >= 1, "los guardados quedaron en la bandeja (los de la misma fila se funden)");
  // 2) Nube: misma app apuntando a la nube con ida y vuelta de Venezuela (lecturas: copia «vieja»; escrituras: sin copia)
  nube.estado.latenciaMs = LATENCIA_NUBE_MS;
  // Lecturas: con la lectura local apagada, la app lee de la nube como la web (la bandeja que sube en segundo plano
  // vuelve a poner la copia «al día», por eso no basta con envejecerla)
  const lecturaLocal = CONFIG.lecturaLocal; CONFIG.lecturaLocal = false;
  await abrir(); await bandejaObj.enCurso;
  nube.estado.rest = [];
  resultados.nube_abrir = await medir(VUELTAS, abrir);
  // Al menos una por vuelta: la bandeja que sube en segundo plano también puede leer consultas de la nube
  const aNube = nube.estado.rest.filter((r) => r.includes("/rest/v1/consultas")).length;
  assert.ok(aNube >= VUELTAS, `todas las aperturas fueron a la nube (${aNube} de ${VUELTAS})`);
  CONFIG.lecturaLocal = lecturaLocal;
  const copia = estado.d.copiaCompleta; estado.d.copiaCompleta = null; // sin copia: guardar va a la nube
  await guardar(0);
  resultados.nube_guardar = await medir(VUELTAS, async (i) => { const r = await guardar(i); assert.ok([200, 204].includes(r.status), JSON.stringify(r.json)); });
  estado.d.copiaCompleta = copia; nube.estado.latenciaMs = 0;
  // 3) Y lo que tarda subir la bandeja después (no lo ve el médico: corre sola)
  const a = performance.now(); await bandejaObj.subir(); resultados.subir_bandeja_ms = Math.round(performance.now() - a);
  resultados.latencia_nube_simulada_ms = LATENCIA_NUBE_MS; resultados.vueltas = VUELTAS;
  console.error(`VELOCIDAD ${JSON.stringify(resultados)}`);
  if (process.env.VELOCIDAD_JSON) fs.writeFileSync(process.env.VELOCIDAD_JSON, JSON.stringify(resultados, null, 1));
  assert.ok(resultados.pc_guardar.mediana < 300 && resultados.pc_abrir.mediana < 300, "la PC responde en menos de 300 ms");
  assert.ok(resultados.pc_guardar.mediana < resultados.nube_guardar.mediana && resultados.pc_abrir.mediana < resultados.nube_abrir.mediana);
});
