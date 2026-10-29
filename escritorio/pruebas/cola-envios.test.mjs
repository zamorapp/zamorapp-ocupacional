// Cola de envíos: la puerta pide a la web que envíe los correos en cola con la sesión de NUBE del usuario (nunca la local)
import assert from "node:assert/strict";
import http from "node:http";
import { after, before, test } from "node:test";
import { ColaEnvios } from "../puerta/cola-envios.mjs";

let web, url;
const pedidos = [];
before(async () => {
  web = http.createServer(async (req, res) => {
    let cuerpo = "";
    for await (const p of req) cuerpo += p;
    pedidos.push({ ruta: req.url, auth: req.headers.authorization, cuerpo: JSON.parse(cuerpo || "{}") });
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ resultados: [{ id: "e1", estado: "enviado" }, { id: "e2", estado: "en_cola" }] }));
  });
  await new Promise((ok) => web.listen(0, "127.0.0.1", ok));
  url = `http://127.0.0.1:${web.address().port}`;
});
after(() => web.close());

const nube = (o = {}) => ({ enLinea: true, confirmar: async () => o.enLinea ?? true, token: async () => ("token" in o ? o.token : "token-nube"), marcarCaida: () => {} });

test("con internet: llama a la web con el token de nube y devuelve lo que envió", async () => {
  const lineas = [];
  const cola = new ColaEnvios({ nube: nube(), motor: null, web: url, registro: (l) => lineas.push(l) });
  const r = await cola.despachar("u1", ["e1", "e2", 7]);
  assert.equal(r.enLinea, true);
  assert.deepEqual(r.resultados.map((x) => x.estado), ["enviado", "en_cola"]);
  const p = pedidos.at(-1);
  assert.equal(p.ruta, "/api/envios/correo");
  assert.equal(p.auth, "Bearer token-nube");
  assert.deepEqual(p.cuerpo, { ids: ["e1", "e2"] });
  assert.match(lineas.at(-1), /1 enviado\(s\), 0 fallido\(s\), 1 esperando el PDF/);
});

test("sin internet no llama a la web: el correo queda en cola", async () => {
  const antes = pedidos.length;
  const r = await new ColaEnvios({ nube: nube({ enLinea: false }), motor: null, web: url }).despachar("u1", ["e1"]);
  assert.equal(r.enLinea, false);
  assert.equal(pedidos.length, antes);
});

test("sin sesión de nube del usuario no llama a la web", async () => {
  const antes = pedidos.length;
  const r = await new ColaEnvios({ nube: nube({ token: null }), motor: null, web: url }).despachar("u1");
  assert.equal(r.sinSesion, true);
  assert.equal(pedidos.length, antes);
});

test("sin ids pide todos los del usuario", async () => {
  await new ColaEnvios({ nube: nube(), motor: null, web: url }).despachar("u1");
  assert.deepEqual(pedidos.at(-1).cuerpo, {});
});
