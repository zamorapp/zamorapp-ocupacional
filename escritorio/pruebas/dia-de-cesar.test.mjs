// Prueba integrada «un día de Cesar»: las fases A (escritura local + bandeja + hora anclada), B (bloques de
// numeración), C (respaldo cifrado) y C.2 (adjuntos en el respaldo) juntas, en el orden en que pasan de verdad:
//   día 1 (con internet): registrar la PC, copia completa, bloque de números, carpeta de Drive y clave de respaldo
//   día 2 (SIN internet y con la fecha de Windows un año atrás): 3 pacientes nuevos, sus consultas con adjuntos,
//          intento de firmar (espera), intento de envío (espera)
//   vuelve internet: sincroniza, firma, envía y respalda (base + adjuntos cifrados en «Drive»)
//   PC nueva: se registra, restaura la copia de Drive y sigue trabajando con su propio bloque de números
// Corre con el mismo banco que puerta.test.mjs (correr.sh ANTES; nunca dos bancos a la vez).
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
const omitir = !NUBE_DB || !process.env.PG_BIN || !process.env.ZAMORAPP_POSTGREST ? "Faltan NUBE_DB, PG_BIN o ZAMORAPP_POSTGREST (PostgREST real)" : false;
const datos = fs.mkdtempSync(path.join(os.tmpdir(), "zamorapp-dia-"));
const CONTROL = crypto.randomBytes(24).toString("hex");
const ORG = "10000000-0000-0000-0000-000000000001";
const EMPRESA = "20000000-0000-0000-0000-00000000000a";
const ADMIN = "00000000-0000-0000-0000-0000000000a1";
const MED = "00000000-0000-0000-0000-0000000000a2";
const CLAVE_RESPALDO = "maturin-consultorio-2026";
const PDF = "%PDF-1.4\nexamen escaneado del dia de Cesar\n%%EOF\n";

let nube, puerta, motor, estado, replicaObj, nubeObj, bandejaObj, bloquesObj, respaldoObj, urlPuerta, CONFIG, mod;
const lineas = [];
const hallazgos = []; // lo que se anota en plan §9
const anotar = (t) => { hallazgos.push(t); console.error(`[hallazgo] ${t}`); };

async function pedirEn(url, ruta, { metodo = "GET", token, cuerpo, cabeceras = {} } = {}) {
  const r = await fetch(`${url}${ruta}`, {
    method: metodo,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...cabeceras },
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
  });
  const texto = await r.text();
  let json = null; try { json = texto ? JSON.parse(texto) : null; } catch { json = texto; }
  return { status: r.status, json };
}
const pedir = (ruta, o) => pedirEn(urlPuerta, ruta, o);
async function enBase(url, sql, params = []) {
  const c = new pg.Client({ connectionString: url });
  await c.connect();
  try { return (await c.query(sql, params)).rows; } finally { await c.end(); }
}
const enLocal = (sql, params) => enBase(motor.url(), sql, params);
const enNube = (sql, params) => enBase(NUBE_DB, sql, params);
const entrar = async (url, email, password) => (await pedirEn(url, "/auth/v1/token?grant_type=password", { metodo: "POST", cuerpo: { email, password } })).json?.access_token;

before(async () => {
  if (omitir) return;
  nube = simularNube({ baseUrl: NUBE_DB, usuarios: {
    "admin@x": { id: ADMIN, clave: "clave-admin" },
    "meda@x": { id: MED, clave: "clave-med", usuario: "richard" },
  } });
  await new Promise((ok) => nube.servidor.listen(0, "127.0.0.1", ok));
  Object.assign(process.env, {
    ZAMORAPP_DATOS: datos,
    ZAMORAPP_NUBE_URL: `http://127.0.0.1:${nube.servidor.address().port}`,
    ZAMORAPP_NUBE_ANON: "anon-prueba",
    ZAMORAPP_LLAVE: crypto.randomBytes(32).toString("hex"),
    ZAMORAPP_PG_BIN: process.env.PG_BIN,
    ZAMORAPP_MIGRACIONES: path.join(raiz, "supabase/migrations"),
    ZAMORAPP_BASE_EXTRA: path.join(raiz, "escritorio/base"),
    ZAMORAPP_STUBS: path.join(raiz, "supabase/pruebas/00_stubs_supabase.sql"),
    PUERTO_BASE: "55429", PUERTO_POSTGREST: "55430",
  });
  mod = {
    Estado: (await import("../puerta/estado.mjs")).Estado, Motor: (await import("../puerta/motor.mjs")).Motor,
    Nube: (await import("../puerta/nube.mjs")).Nube, Replica: (await import("../puerta/replica.mjs")).Replica,
    Bandeja: (await import("../puerta/bandeja.mjs")).Bandeja, Bloques: (await import("../puerta/bloques.mjs")).Bloques,
    Respaldo: (await import("../puerta/respaldo.mjs")).Respaldo, crearPuerta: (await import("../puerta/servidor.mjs")).crearPuerta,
  };
  ({ CONFIG } = await import("../puerta/config.mjs"));
  ({ estado, motor, nubeObj, replicaObj, bandejaObj, bloquesObj, respaldoObj, puerta, urlPuerta } = await armarPC(datos, motor));
}, { timeout: 300_000 });

// Arma una PC completa (base local, nube, réplica, bandeja, bloques, respaldo y puerta). Para la «PC nueva» se
// cambia la carpeta de la base: config.mjs es global, así que la carpeta de adjuntos y el registro quedan en
// CONFIG.datos (en una PC real solo hay una).
async function armarPC(carpeta, motorPrevio) {
  const estado = new mod.Estado(carpeta, CONFIG.llave);
  const motor = new mod.Motor(estado);
  motor.carpetaBase = path.join(carpeta, "base");
  await motor.iniciar();
  const nubeObj = new mod.Nube(estado);
  await nubeObj.comprobar();
  const replicaObj = new mod.Replica(estado, nubeObj, motor);
  const bandejaObj = new mod.Bandeja(estado, nubeObj, motor, replicaObj);
  const bloquesObj = new mod.Bloques(estado, nubeObj, motor, replicaObj);
  let puerta;
  const sincronizar = async () => {
    await nubeObj.comprobar(); await bandejaObj.subir(); await replicaObj.ciclo();
    await puerta.adjuntos.subir().catch((e) => lineas.push(`[adjuntos] ${e.message}`));
    await bloquesObj.reponer(); await respaldoObj.anotarPendientes();
  };
  const respaldoObj = new mod.Respaldo({ estado, nube: nubeObj, motor, replica: replicaObj, sincronizar, registro: (l) => lineas.push(l) });
  puerta = mod.crearPuerta({ estado, nube: nubeObj, motor, replica: replicaObj, bandeja: bandejaObj, bloques: bloquesObj, respaldo: respaldoObj, origen: "http://127.0.0.1:54332", control: CONTROL, registro: (l) => lineas.push(l) });
  await new Promise((ok) => puerta.listen(0, "127.0.0.1", ok));
  return { estado, motor, nubeObj, replicaObj, bandejaObj, bloquesObj, respaldoObj, puerta, urlPuerta: `http://127.0.0.1:${puerta.address().port}`, sincronizar };
}

let pc2 = null;
after(async () => {
  for (const p of [pc2, { puerta, motor }]) { p?.puerta?.closeAllConnections?.(); p?.puerta?.close(); p?.motor?.detener(); }
  await nube?.cerrar();
  fs.rmSync(datos, { recursive: true, force: true });
  if (pc2?.carpeta) fs.rmSync(pc2.carpeta, { recursive: true, force: true });
  if (hallazgos.length) console.error(`\nHallazgos (${hallazgos.length}):\n- ${hallazgos.join("\n- ")}`);
  if (process.env.DEPURAR_DIA) {
    console.error(`\nRegistro de la puerta:\n${lineas.join("\n")}`);
    try { console.error(`\nbase.log (final):\n${fs.readFileSync(path.join(datos, "base.log"), "utf8").split("\n").slice(-40).join("\n")}`); } catch { /* sin log */ }
  }
});

let tokenAdmin, tokenMed, externa, bloque1, pacientes = [], consultas = [], rutas = [];
const serieLibre = () => String.fromCharCode(65 + crypto.randomInt(22)) + String.fromCharCode(65 + crypto.randomInt(26));

test("día 1 con internet: registrar la PC, copia completa, bloque de números, carpeta de Drive y clave", { skip: omitir, timeout: 180_000 }, async () => {
  tokenAdmin = await entrar(urlPuerta, "admin@x", "clave-admin");
  const eq = await pedir("/zamorapp/equipo", { metodo: "POST", token: tokenAdmin, cuerpo: { nombre: "PC consultorio", serie: serieLibre() } });
  assert.equal(eq.status, 200, JSON.stringify(eq.json));
  tokenMed = await entrar(urlPuerta, "meda@x", "clave-med");
  await replicaObj.ciclo();
  assert.ok(estado.d.copiaCompleta, replicaObj.error || "sin copia completa");
  assert.equal(await bloquesObj.reponer(), true, bloquesObj.ultimoError || "");
  [bloque1] = await enLocal("select desde, hasta from local.bloques order by id desc limit 1");
  assert.equal((await pedir("/zamorapp/estado")).json.numerosLibres, 100);
  const [pv] = await enLocal("select has_table_privilege('authenticated','public.trabajadores','insert') as ins, has_table_privilege('authenticated','clinico.consultas','insert') as cons, (select count(*)::int from sync.tablas where subible) as subibles");
  assert.deepEqual(pv, { ins: true, cons: true, subibles: pv.subibles }, JSON.stringify(pv));
  externa = fs.mkdtempSync(path.join(os.tmpdir(), "drive-dia-"));
  const conf = await pedir("/zamorapp/respaldo/configurar", { metodo: "POST", token: tokenAdmin, cuerpo: { carpeta: externa, clave: CLAVE_RESPALDO, confirmacion: CLAVE_RESPALDO } });
  assert.equal(conf.status, 200, JSON.stringify(conf.json));
  // Un primer respaldo del día 1: así el automático del día 2 no está vencido y la lista de copias tiene algo
  const r = await fetch(`${urlPuerta}/zamorapp/respaldar`, { method: "POST", headers: { "X-Zamorapp-Control": CONTROL } });
  assert.equal(r.status, 200, await r.text());
});

test("día 2 sin internet y con Windows un año atrás: la hora no retrocede y se avisa «sin verificar»", { skip: omitir }, async () => {
  const piso = nubeObj.reloj.ahora();
  // «Apagar y prender» la PC sin internet: se pierde el ancla y Windows amanece con la fecha de hace un año
  nubeObj.reloj.ancla = null;
  nubeObj.reloj.fecha = () => Date.now() - 400 * 864e5;
  nube.estado.caida = true;
  await nubeObj.comprobar();
  nubeObj.reloj.arranque(nubeObj.enLinea);
  const e = (await pedir("/zamorapp/estado")).json;
  assert.equal(e.enLinea, false);
  assert.equal(e.horaSinAncla, true);
  assert.ok(Date.parse(e.hora) >= piso - 1000, `la hora (${e.hora}) no retrocede al año pasado`);
  assert.equal(e.arranquesSinNube, 1);
  assert.equal(e.lecturaLocal, true, "la copia local está al día: se lee de la PC");
});

test("día 2: tres pacientes nuevos con números del bloque, consultas cerradas y adjuntos, todo en la PC", { skip: omitir, timeout: 120_000 }, async () => {
  for (let i = 0; i < 3; i++) {
    const id = crypto.randomUUID();
    const alta = await pedir("/rest/v1/trabajadores", { metodo: "POST", token: tokenMed,
      cuerpo: { id, org_id: ORG, empresa_id: EMPRESA, cedula: `9${crypto.randomInt(1e7)}`, nombres: `Paciente ${i + 1}`, apellidos: "Del día" } });
    assert.ok([200, 201].includes(alta.status), JSON.stringify(alta.json));
    const [t] = await enLocal("select numero_historia from public.trabajadores where id = $1", [id]);
    assert.equal(Number(t.numero_historia), Number(bloque1.desde) + i, "números consecutivos del bloque de esta PC");
    pacientes.push(id);
    // La consulta: se abre, se guarda con guardar_consulta y se cierra (todo en la PC)
    const cid = crypto.randomUUID();
    const ap = await pedir("/rest/v1/consultas", { metodo: "POST", token: tokenMed, cabeceras: { "Content-Profile": "clinico", Prefer: "return=representation" },
      cuerpo: { id: cid, org_id: ORG, empresa_id: EMPRESA, trabajador_id: id, tipo: "primera" } });
    assert.ok([200, 201].includes(ap.status), JSON.stringify(ap.json));
    const g = await pedir("/rest/v1/rpc/guardar_consulta", { metodo: "POST", token: tokenMed, cuerpo: {
      p_id: cid, p_consulta: { tipo: "primera", motivo_texto: `Preempleo ${i + 1}`, enfermedad_actual: "Asintomático", conclusiones: "Apto" },
      p_diagnosticos: [{ cie10: "Z00.0", descripcion: "Examen médico general", principal: true }], p_aptitud: { clasificacion: "elegible" }, p_reposo: null, p_cerrar: true } });
    assert.ok([200, 204].includes(g.status), JSON.stringify(g.json));
    const [c] = await enLocal("select estado, fecha, hora_cierre from clinico.consultas where id = $1", [cid]);
    assert.equal(c.estado, "cerrada");
    consultas.push(cid);
    // El adjunto: el archivo a la carpeta de la PC y su fila a clinico.adjuntos
    const ruta = `${ORG}/${id}/examen-${i + 1}.pdf`;
    const f = new FormData(); f.append("cacheControl", "3600"); f.append("", new Blob([PDF], { type: "application/pdf" }), "archivo");
    const s = await fetch(`${urlPuerta}/storage/v1/object/adjuntos/${ruta}`, { method: "POST", headers: { Authorization: `Bearer ${tokenMed}` }, body: f });
    assert.equal(s.status, 200, await s.text());
    const fila = await pedir("/rest/v1/adjuntos", { metodo: "POST", token: tokenMed, cabeceras: { "Content-Profile": "clinico", Prefer: "return=representation" },
      cuerpo: { org_id: ORG, trabajador_id: id, consulta_id: cid, nombre: `examen-${i + 1}.pdf`, ruta, tipo_mime: "application/pdf", tamano: PDF.length } });
    assert.ok([200, 201].includes(fila.status), JSON.stringify(fila.json));
    rutas.push(ruta);
  }
  assert.equal((await pedir("/zamorapp/estado")).json.numerosLibres, 97);
  const [b] = await enLocal("select count(*)::int as n from local.bandeja where estado = 'pendiente'");
  assert.ok(b.n >= 9, `bandeja con pacientes, consultas, diagnósticos, aptitudes y adjuntos: ${b.n}`);
  const [hv] = await enLocal("select count(*)::int as n from local.bandeja where estado = 'pendiente' and hora_verificada");
  assert.equal(hv.n, 0, "sin ancla, ningún cambio lleva hora verificada");
  // La fecha y la hora de cierre de la consulta salen del now() de la base local (= la fecha de Windows en la PC)
  const [c0] = await enLocal("select fecha::text, hora_cierre from clinico.consultas where id = $1", [consultas[0]]);
  anotar("alta de paciente con Prefer: return=representation → 42501 en la PC: authenticated solo tiene SELECT por columnas en trabajadores (PR #41) y RETURNING * se niega; la app no debe pedir la fila completa al insertar (igual pasaría en la nube)");
  anotar(`consulta cerrada sin internet: fecha=${c0.fecha} hora_cierre=${c0.hora_cierre?.toISOString?.()} vienen de now() de la base local (en la PC de Cesar sería la fecha de Windows atrasada); lo corrige la migración hora-anclada (public.ahora), que NO está en esta rama`);
});

test("día 2: firmar y enviar esperan a internet (sin bloquear al médico)", { skip: omitir }, async () => {
  const fi = await pedir("/rest/v1/rpc/firmar_consulta", { metodo: "POST", token: tokenMed, cuerpo: { p_id: consultas[0] } });
  assert.equal(fi.status, 503, JSON.stringify(fi.json));
  anotar(`firmar sin internet → 503 «${fi.json?.message || fi.json}»: firmar va a la nube porque la base local no tiene public.ahora_de_la_puerta (migración hora-anclada); con ella firmaría en la PC solo con ancla`);
  const [c] = await enLocal("select estado from clinico.consultas where id = $1", [consultas[0]]);
  assert.equal(c.estado, "cerrada", "la consulta sigue cerrada, lista para firmar");
  const env = await pedir("/rest/v1/envios", { metodo: "POST", token: tokenMed, cabeceras: { Prefer: "return=representation" }, cuerpo: {
    org_id: ORG, empresa_id: EMPRESA, fecha_lote: "2026-10-29", canal: "correo", destinatario: "rrhh@empresa-a.com", consultas: [consultas[0]],
    documentos: ["constancia"], asunto: "Evaluaciones de hoy", mensaje: "Adjunto las evaluaciones realizadas el día de hoy", estado: "enviando" } });
  assert.equal(env.status, 503, JSON.stringify(env.json));
  anotar(`encolar un envío sin internet → ${env.status}: public.envios no es subible en esta rama (la fila de sync.tablas la trae arquitecto/copia-tablas-faltantes 20261030240000 y la cola real es #120 cola-envios)`);
});

test("vuelve internet: sincroniza sin conflictos, firma, envía y respalda base + adjuntos cifrados", { skip: omitir, timeout: 180_000 }, async () => {
  nube.estado.caida = false;
  nubeObj.reloj.fecha = () => Date.now();
  const { sincronizar } = { sincronizar: respaldoObj.sincronizar };
  await sincronizar();
  const e = (await pedir("/zamorapp/estado")).json;
  assert.equal(e.enLinea, true); assert.equal(e.horaSinAncla, false); assert.equal(e.arranquesSinNube, 0);
  assert.equal(e.bandeja.pendientes, 0, JSON.stringify(e.bandeja));
  assert.equal(e.bandeja.conflictos, 0, JSON.stringify(await bandejaObj.lista()));
  const n = await enNube("select t.numero_historia, c.estado from public.trabajadores t join clinico.consultas c on c.trabajador_id = t.id where t.id = any($1) order by t.numero_historia", [pacientes]);
  assert.equal(n.length, 3);
  assert.deepEqual(n.map((x) => Number(x.numero_historia)), [0, 1, 2].map((i) => Number(bloque1.desde) + i));
  assert.ok(n.every((x) => x.estado === "cerrada"));
  for (const r of rutas) assert.equal(nube.estado.archivos.get(`adjuntos/${r}`)?.cuerpo, PDF, `adjunto ${r} en la nube`);
  const [adj] = await enNube("select count(*)::int as n from clinico.adjuntos where trabajador_id = any($1)", [pacientes]);
  assert.equal(adj.n, 3);
  // Firmar: con internet va a la nube y la firma baja a la PC
  for (const cid of consultas) {
    const fi = await pedir("/rest/v1/rpc/firmar_consulta", { metodo: "POST", token: tokenMed, cuerpo: { p_id: cid } });
    assert.ok([200, 204].includes(fi.status), JSON.stringify(fi.json));
  }
  await replicaObj.ciclo();
  const [f] = await enLocal("select count(*)::int as n from clinico.consultas where id = any($1) and estado = 'firmada' and firmada_en is not null", [consultas]);
  assert.equal(f.n, 3, "las tres firmadas en la copia local");
  // Enviar (con internet, directo en la nube)
  const env = await pedir("/rest/v1/envios", { metodo: "POST", token: tokenMed, cabeceras: { Prefer: "return=representation" }, cuerpo: {
    org_id: ORG, empresa_id: EMPRESA, fecha_lote: "2026-10-29", canal: "correo", destinatario: "rrhh@empresa-a.com", consultas,
    documentos: ["constancia"], asunto: "Evaluaciones de hoy", mensaje: "Adjunto las evaluaciones realizadas el día de hoy", estado: "enlace" } });
  assert.ok([200, 201].includes(env.status), JSON.stringify(env.json));
  // Respaldar ahora
  const r = await fetch(`${urlPuerta}/zamorapp/respaldar`, { method: "POST", headers: { "X-Zamorapp-Control": CONTROL } });
  const j = await r.json();
  assert.equal(r.status, 200, JSON.stringify(j));
  assert.ok(j.ok && j.sincronizado && j.externo && j.adjuntos?.externo && j.probada?.ok, JSON.stringify(j));
  assert.equal(j.adjuntos.archivos, 3);
  const [anot] = await enNube("select count(*)::int as n from public.respaldos where tipo = 'restauracion' and estado = 'ok' and equipo = 'PC consultorio'");
  assert.ok(anot.n >= 1, "la prueba de restauración quedó anotada en la nube");
  pc1 = { externo: j.externo, adjuntosExterno: j.adjuntos.externo };
});
let pc1;

test("PC nueva: se registra, restaura la copia de Drive (base + adjuntos) y sigue con su propio bloque", { skip: omitir, timeout: 600_000 }, async () => {
  const carpeta2 = fs.mkdtempSync(path.join(os.tmpdir(), "zamorapp-pc2-"));
  // La carpeta de adjuntos es global (CONFIG.datos): se aparta la de la PC 1 para que la PC nueva arranque vacía
  fs.renameSync(path.join(datos, "adjuntos"), path.join(datos, "adjuntos-pc1"));
  pc2 = { carpeta: carpeta2, ...(await armarPC(carpeta2)) };
  const admin2 = await entrar(pc2.urlPuerta, "admin@x", "clave-admin");
  const eq = await pedirEn(pc2.urlPuerta, "/zamorapp/equipo", { metodo: "POST", token: admin2, cuerpo: { nombre: "PC nueva", serie: serieLibre() } });
  assert.equal(eq.status, 200, JSON.stringify(eq.json));
  assert.notEqual(pc2.estado.d.equipo.id, estado.d.equipo.id);
  // Registrar la PC dispara en segundo plano la primera copia completa: se espera a que termine antes de restaurar
  // (en una PC real la restauración corre al arrancar, antes de cualquier copia; aquí se aplica en caliente)
  for (let i = 0; i < 600 && (pc2.replicaObj.ocupada || !pc2.estado.d.copiaCompleta); i++) await new Promise((ok) => setTimeout(ok, 200));
  assert.ok(pc2.estado.d.copiaCompleta, pc2.replicaObj.error || "la PC nueva no terminó su primera copia");
  anotar("registrar la PC lanza replica.ciclo() en segundo plano: una restauración aplicada en caliente justo después mata esa conexión (57P01 sin manejar). En producción no pasa (la restauración corre al arrancar, antes de la réplica), pero el error de pg sin oyente tumbaría la puerta: conviene un c.on('error') en los clientes de la réplica");
  // Restaurar la copia de Drive con la clave de respaldo (la PC nueva no la tiene guardada: se escribe)
  const pr = await pedirEn(pc2.urlPuerta, "/zamorapp/restaurar", { metodo: "POST", token: admin2, cuerpo: { archivo: pc1.externo, clave: CLAVE_RESPALDO } });
  assert.equal(pr.status, 200, JSON.stringify(pr.json));
  assert.equal(pc2.estado.d.restaurar.origenAdjuntos, pc1.adjuntosExterno);
  assert.equal(await pc2.motor.restaurarSiPedida(), true, JSON.stringify(pc2.estado.d.respaldo?.restauracionFallida));
  const local2 = (sql, p) => enBase(pc2.motor.url(), sql, p);
  const [t] = await local2("select count(*)::int as n from public.trabajadores where id = any($1)", [pacientes]);
  assert.equal(t.n, 3, "los pacientes del día están en la PC nueva");
  const [bl] = await local2("select count(*)::int as n from local.bloques");
  assert.equal(bl.n, 0, "los bloques de la PC 1 no pasan a la PC nueva");
  for (const r of rutas) assert.equal(fs.readFileSync(path.join(datos, "adjuntos", "adjuntos", ...r.split("/")), "utf8"), PDF, `adjunto ${r} restaurado`);
  const [cola] = await local2("select count(*)::int as n from local.adjuntos_cola where estado = 'pendiente'");
  assert.equal(cola.n, 0, "nada por subir: los adjuntos del respaldo ya estaban en la nube");
  const [band] = await local2("select count(*)::int as n from local.bandeja");
  assert.equal(band.n, 0, "la bandeja de la PC 1 no revive");
  // Sigue el día en la PC nueva: baja lo más nuevo, pide su bloque y da de alta sin repetir números
  await pc2.sincronizar();
  assert.ok(pc2.estado.d.copiaCompleta, pc2.replicaObj.error || "");
  const e2 = (await pedirEn(pc2.urlPuerta, "/zamorapp/estado")).json;
  assert.equal(e2.numerosLibres, 100, pc2.bloquesObj.ultimoError || JSON.stringify(e2));
  const [b2] = await local2("select desde, hasta, equipo_id from local.bloques");
  assert.ok(Number(b2.desde) > Number(bloque1.hasta), "el bloque de la PC nueva está por encima del de la PC 1");
  assert.equal(b2.equipo_id, pc2.estado.d.equipo.id);
  const med2 = await entrar(pc2.urlPuerta, "meda@x", "clave-med");
  const id4 = crypto.randomUUID();
  const cuerpo4 = { id: id4, org_id: ORG, empresa_id: EMPRESA, cedula: `8${crypto.randomInt(1e7)}`, nombres: "Cuarto", apellidos: "En la PC nueva" };
  let alta = await pedirEn(pc2.urlPuerta, "/rest/v1/trabajadores", { metodo: "POST", token: med2, cuerpo: cuerpo4 });
  if (alta.json?.code === "57P01") { // la restauración en caliente cortó la conexión que PostgREST tenía abierta: en la PC real no pasa (restaura antes de arrancar PostgREST)
    anotar("tras una restauración en caliente, el primer pedido a PostgREST local responde 57P01 (su conexión fue terminada); en producción la restauración corre antes de arrancar PostgREST");
    alta = await pedirEn(pc2.urlPuerta, "/rest/v1/trabajadores", { metodo: "POST", token: med2, cuerpo: cuerpo4 });
  }
  assert.ok([200, 201].includes(alta.status), JSON.stringify(alta.json));
  assert.equal(Number((await local2("select numero_historia from public.trabajadores where id = $1", [id4]))[0].numero_historia), Number(b2.desde));
  // Y la PC 1 sigue viva: ve al cuarto paciente tras sincronizar
  await pc2.bandejaObj.subir();
  await replicaObj.ciclo();
  const [v] = await enLocal("select count(*)::int as n from public.trabajadores where nombres = 'Cuarto'");
  assert.equal(v.n, 1);
});
