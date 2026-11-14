// Puerta para agentes, lado web: la llave nunca se acepta mal formada, el protocolo MCP responde lo justo, el catálogo
// coincide con la lista cerrada de la base y los enlaces salen completos. La base (permisos) se prueba en
// supabase/pruebas/237_puerta_agentes.sql.
// Uso: node --test scripts/pruebas/puerta-agentes.test.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";

const raiz = fileURLToPath(new URL("../../src/", import.meta.url));
const vacio = fileURLToPath(new URL("./puerta-agentes.vacio.mjs", import.meta.url));
process.env.NEXT_PUBLIC_SUPABASE_URL = "http://base.prueba";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon";
delete process.env.NEXT_PUBLIC_ESCRITORIO;
delete process.env.ZAMORAPP_URL_PUBLICA;
const jiti = createJiti(import.meta.url, { alias: { "@/": raiz, "server-only": vacio } });
const { ACCIONES } = await jiti.import("../../src/lib/agentes/acciones.ts");
const { atenderMcp, leerLlave, llamarPuerta, responderMcp } = await jiti.import("../../src/lib/agentes/puerta.ts");

const LLAVE = "zk_" + "a1".repeat(32);
const pedir = (cabeceras = {}, cuerpo = {}) => new Request("http://x/api/agentes/mcp", { method: "POST", headers: cabeceras, body: JSON.stringify(cuerpo) });

// Base de mentira: anota lo que recibe y responde lo que se le diga
let recibido = [];
let respuesta = () => ({ ok: true, accion: "resumen", ensayo: false, resultado: {} });
globalThis.fetch = async (url, opciones) => {
  recibido.push({ url: String(url), cabeceras: opciones.headers, cuerpo: JSON.parse(opciones.body) });
  return new Response(JSON.stringify(respuesta()), { status: 200, headers: { "Content-Type": "application/json" } });
};

test("la llave se lee de Bearer, de x-api-key o de la dirección, y solo con su forma exacta", () => {
  assert.equal(leerLlave(pedir({ Authorization: `Bearer ${LLAVE}` })), LLAVE);
  assert.equal(leerLlave(pedir({ "x-api-key": LLAVE })), LLAVE);
  assert.equal(leerLlave(pedir(), LLAVE), LLAVE);
  for (const mala of ["", "zk_corta", LLAVE + "0", LLAVE.toUpperCase(), "Bearer", `${LLAVE}' or 1=1`, "../" + LLAVE]) {
    assert.equal(leerLlave(pedir({ Authorization: `Bearer ${mala}` })), null, mala);
    assert.equal(leerLlave(pedir(), mala), null, mala);
  }
});

test("sin llave responde 401 y no llama a la base", async () => {
  recibido = [];
  const r = await responderMcp(pedir({}, { jsonrpc: "2.0", id: 1, method: "tools/list" }));
  assert.equal(r.status, 401);
  assert.equal(recibido.length, 0);
  assert.ok(!(await r.text()).includes("zk_"));
});

test("el catálogo es la misma lista cerrada de la base", () => {
  const sql = fs.readFileSync(new URL("../../supabase/migrations/20261030938000_puerta_agentes.sql", import.meta.url), "utf8");
  const lista = (re) => [...sql.match(re)[1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]).sort();
  const leen = lista(/when v_acc in \(([^)]+)\) then false/);
  const crean = lista(/when v_acc in \(([^)]+)\) then true/);
  const generales = ACCIONES.filter((a) => !a.vigilancia);
  assert.deepEqual(generales.filter((a) => !a.crea).map((a) => a.nombre).sort(), leen);
  assert.deepEqual(generales.filter((a) => a.crea).map((a) => a.nombre).sort(), crean);
  // Las de vigilancia van a su propia puerta (public.puerta_vigilancia, 20261030960000) con su lista cerrada
  const vig = fs.readFileSync(new URL("../../supabase/migrations/20261030960000_vigilancia_agentes.sql", import.meta.url), "utf8");
  const listaV = (re) => [...vig.match(re)[1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]).sort();
  const vigilancia = ACCIONES.filter((a) => a.vigilancia);
  assert.ok(vigilancia.every((a) => a.rpc === "puerta_vigilancia"));
  assert.deepEqual(vigilancia.filter((a) => !a.crea).map((a) => a.nombre).sort(), listaV(/when v_acc in \(([^)]+)\) then false/));
  assert.deepEqual(vigilancia.filter((a) => a.crea).map((a) => a.nombre).sort(), listaV(/when v_acc in \(([^)]+)\) then true/));
  for (const a of ACCIONES) {
    assert.equal(a.esquema.additionalProperties, false, a.nombre);
    assert.equal("ensayo" in a.esquema.properties, a.crea, `${a.nombre}: solo lo que crea lleva ensayo`);
    assert.ok(!/borra|elimin|modific|actualiz/i.test(a.nombre), a.nombre);
  }
});

test("MCP: initialize, notificación, lista de herramientas y método desconocido", async () => {
  const ini = await atenderMcp({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-03-26" } }, LLAVE);
  assert.equal(ini.estado, 200);
  assert.equal(ini.json.result.protocolVersion, "2025-03-26");
  assert.ok(ini.json.result.capabilities.tools);
  assert.match(ini.json.result.instructions, /ensayo/);
  const otra = await atenderMcp({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "1999-01-01" } }, LLAVE);
  assert.equal(otra.json.result.protocolVersion, "2025-06-18");
  assert.deepEqual(await atenderMcp({ jsonrpc: "2.0", method: "notifications/initialized" }, LLAVE), { estado: 202 });
  const lista = await atenderMcp({ jsonrpc: "2.0", id: "a", method: "tools/list" }, LLAVE);
  assert.equal(lista.json.result.tools.length, ACCIONES.length);
  for (const t of lista.json.result.tools) {
    assert.equal(t.inputSchema.type, "object");
    assert.equal(t.annotations.destructiveHint, false);
    assert.equal(t.annotations.readOnlyHint, !ACCIONES.find((a) => a.nombre === t.name).crea);
  }
  assert.equal((await atenderMcp({ jsonrpc: "2.0", id: 2, method: "resources/list" }, LLAVE)).json.error.code, -32601);
  assert.equal((await atenderMcp({ id: 2, method: "tools/list" }, LLAVE)).json.error.code, -32600);
  assert.equal((await atenderMcp([], LLAVE)).estado, 400);
});

test("MCP: tools/call pasa la llave y los datos a la base, y «ensayo» va aparte", async () => {
  recibido = [];
  respuesta = () => ({ ok: true, accion: "crear_empresa", ensayo: true, resultado: { ya_existia: false } });
  const r = await atenderMcp({ jsonrpc: "2.0", id: 7, method: "tools/call", params: { name: "crear_empresa", arguments: { rif: "J-1", razon_social: "X", ensayo: true } } }, LLAVE);
  assert.equal(r.json.result.isError, false);
  assert.equal(JSON.parse(r.json.result.content[0].text).ensayo, true);
  assert.equal(recibido.length, 1);
  assert.equal(recibido[0].url, "http://base.prueba/rest/v1/rpc/agente");
  assert.equal(recibido[0].cabeceras.Authorization, "Bearer anon"); // anónimo: nunca una clave de servicio
  assert.deepEqual(recibido[0].cuerpo, { p_llave: LLAVE, p_accion: "crear_empresa", p_datos: { rif: "J-1", razon_social: "X" }, p_ensayo: true });
  // «ensayo» solo vale con true exacto
  await atenderMcp({ jsonrpc: "2.0", id: 8, method: "tools/call", params: { name: "crear_empresa", arguments: { rif: "J-1", ensayo: "sí" } } }, LLAVE);
  assert.equal(recibido[1].cuerpo.p_ensayo, false);
});

test("MCP: un rechazo de la base llega como error de la herramienta, y una herramienta inventada no llega a la base", async () => {
  recibido = [];
  respuesta = () => ({ ok: false, accion: "crear_trabajador", error: "La cédula V-1 ya está registrada en «Otra»." });
  const r = await atenderMcp({ jsonrpc: "2.0", id: 9, method: "tools/call", params: { name: "crear_trabajador", arguments: {} } }, LLAVE);
  assert.equal(r.json.result.isError, true);
  assert.match(r.json.result.content[0].text, /ya está registrada/);
  const n = recibido.length;
  const mala = await atenderMcp({ jsonrpc: "2.0", id: 10, method: "tools/call", params: { name: "borrar_empresa", arguments: {} } }, LLAVE);
  assert.equal(mala.json.error.code, -32602);
  assert.equal((await llamarPuerta(LLAVE, "borrar_empresa", {}, false)).ok, false);
  assert.equal(recibido.length, n);
});

test("los enlaces salen completos, con sus parámetros, y sin la ruta interna", async () => {
  respuesta = () => ({ ok: true, accion: "enlaces", resultado: {
    presupuesto: { ruta: "/imprimir/cobro/abc" },
    ordenes: { ruta: "/imprimir/registro-previa", parametros: { nombre: "Ana Pérez", perfil: "p1", rec: "Lunes 7:30 a. m.\nAyunas" } },
    presupuestos: [{ numero: 4, ruta: "/imprimir/cobro/def" }], fuera: { ruta: "https://otro.sitio/x" } } });
  const r = await llamarPuerta(LLAVE, "enlaces", {}, false);
  assert.equal(r.resultado.presupuesto.enlace, "https://zamorapp-ocupacional.vercel.app/imprimir/cobro/abc");
  const u = new URL(r.resultado.ordenes.enlace);
  assert.equal(u.pathname, "/imprimir/registro-previa");
  assert.equal(u.searchParams.get("nombre"), "Ana Pérez");
  assert.equal(u.searchParams.get("rec"), "Lunes 7:30 a. m.\nAyunas");
  assert.equal(u.searchParams.has("firma"), false);
  assert.equal(r.resultado.presupuestos[0].enlace, "https://zamorapp-ocupacional.vercel.app/imprimir/cobro/def");
  assert.equal(r.resultado.fuera.enlace, undefined);
  assert.ok(!JSON.stringify(r).includes('"ruta"'));
});

test("la respuesta nunca repite la llave", async () => {
  respuesta = () => ({ ok: false, error: "Llave no válida, vencida o apagada." });
  const r = await responderMcp(pedir({ Authorization: `Bearer ${LLAVE}` }, { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "resumen", arguments: {} } }));
  assert.equal(r.status, 200);
  assert.equal(r.headers.get("cache-control"), "no-store");
  assert.ok(!(await r.text()).includes(LLAVE));
});
