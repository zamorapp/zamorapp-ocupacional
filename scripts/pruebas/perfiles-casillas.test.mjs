// Perfil de paraclínicos sugerido por casilla (empresa × evaluación) elegido en el asistente de Ajustes clínicos.
// Uso: node --test scripts/pruebas/perfiles-casillas.test.mjs
import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";

const raiz = fileURLToPath(new URL("../../src/", import.meta.url));
const jiti = createJiti(import.meta.url, { alias: { "@/": raiz } });
const { perfilesSugeridos } = await jiti.import("../../src/lib/perfiles-paraclinicos.ts");

const it = (id, datos, grupo = null) => ({ id, codigo: null, nombre: id, grupo, texto: null, orden: 0, activo: true, datos });
const E = "e1", M = "m1", M2 = "m2";
const q = (ps, e, m) => perfilesSugeridos(ps, { empresaId: e, empresa: e ? "COSAPI SERVICIOS" : "", motivoId: m }).map((p) => p.id);
const gen = it("gen", { motivos: [M] });

test("sin casillas se comporta como antes", () => {
  assert.equal(q([gen, it("cos", { empresas: [E], motivos: [M] })], E, M)[0], "cos");
  assert.equal(q([it("viejo", {}, "cosapi")], E, M)[0], "viejo");
});

test("«Ninguno» en una empresa no toca a las demás ni borra el perfil", () => {
  const sinCosapi = { ...gen, datos: { motivos: [M], excluir: [{ e: E, m: M }] } };
  assert.deepEqual(q([sinCosapi], E, M), []);
  assert.equal(q([sinCosapi], "e2", M)[0], "gen");
});

test("el perfil elegido para la casilla va primero y solo ahí", () => {
  const lab = it("lab", { pares: [{ e: E, m: M }] });
  assert.equal(q([gen, lab], E, M)[0], "lab");
  assert.equal(q([gen, lab], "e2", M)[0], "gen");
});

test("lo propio de la empresa gana a lo elegido para todas", () => {
  assert.equal(q([it("gp", { pares: [{ e: null, m: M2 }] }), it("cos2", { empresas: [E] })], E, M2)[0], "cos2");
});

test("gana la casilla más precisa entre usar y excluir", () => {
  assert.equal(q([it("x", { pares: [{ e: E, m: M }], excluir: [{ e: null, m: M }] })], E, M)[0], "x");
  assert.deepEqual(q([it("x", { pares: [{ e: null, m: M }], excluir: [{ e: E, m: M }] })], E, M), []);
});
