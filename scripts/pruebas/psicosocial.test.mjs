// CoPsoQ-istas21 versión corta: las 38 preguntas en orden, la corrección (preguntas 3, 27 y 37 al revés) y los
// cortes verde/amarillo/rojo del manual ISTAS 2010. La base (20261030898000) usa lo mismo: la prueba SQL 207 comprueba
// los mismos totales ({20,40,16,36,16,12} y {4,0,0,4,0,4}).
// Uso: node --test scripts/pruebas/psicosocial.test.mjs
import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";

const raiz = fileURLToPath(new URL("../../src/", import.meta.url));
const jiti = createJiti(import.meta.url, { alias: { "@/": raiz } });
const P = await jiti.import("../../src/lib/psicosocial.ts");

test("38 preguntas numeradas 1 a 38, cada una con 5 opciones", () => {
  const ns = P.APARTADOS.flatMap((a) => a.preguntas.map((q) => q.n));
  assert.deepEqual(ns, Array.from({ length: 38 }, (_, i) => i + 1));
  for (const a of P.APARTADOS) for (const q of a.preguntas) assert.equal(q.opciones.length, 5, `pregunta ${q.n}`);
  assert.deepEqual(P.APARTADOS.map((a) => a.preguntas.length), [6, 10, 4, 10, 4, 4]);
});

test("corrección: igual que la base", () => {
  assert.deepEqual(P.puntajes(Array(38).fill(0)), [20, 40, 16, 36, 16, 12]);
  assert.deepEqual(P.puntajes(Array(38).fill(4)), [4, 0, 0, 4, 0, 4]);
  assert.equal(P.puntajes(Array(37).fill(0)), null);
  assert.equal(P.puntajes([...Array(37).fill(0), null]), null);
});

test("cortes: cubren todo el rango sin huecos y coinciden con la tabla del manual", () => {
  for (const a of P.APARTADOS) {
    const vistos = new Set();
    for (let x = 0; x <= a.maximo; x++) vistos.add(P.nivel(a.n, x));
    assert.equal(vistos.size, 3, a.nombre);
    const tramos = [a.verde, a.amarillo, a.rojo].sort((m, n) => m[0] - n[0]);
    assert.equal(tramos[0][0], 0); assert.equal(tramos[2][1], a.maximo);
    assert.equal(tramos[1][0], tramos[0][1] + 1); assert.equal(tramos[2][0], tramos[1][1] + 1);
  }
  assert.equal(P.nivel(1, 12), 2); assert.equal(P.nivel(1, 7), 0); assert.equal(P.nivel(2, 26), 0); assert.equal(P.nivel(2, 18), 2);
  assert.equal(P.nivel(3, 10), 2); assert.equal(P.nivel(4, 31), 1); assert.equal(P.nivel(5, 2), 0); assert.equal(P.nivel(6, 12), 1);
});

test("conclusión sugerida: nunca nombres, solo apartados y grupos", () => {
  const d = (apartado, verde, amarillo, rojo) => ({ apartado, verde, amarillo, rojo, media: 0 });
  const t = P.conclusionSugerida({ total: 10, codigos: 12, usados: 10, minimo: 5, suficiente: true,
    dimensiones: [d(1, 1, 3, 6), d(2, 5, 3, 2), d(3, 3, 3, 4), d(4, 6, 2, 2), d(5, 6, 2, 2), d(6, 6, 2, 2)],
    grupos: [{ id: "g1", nombre: "Caja", n: 6, dimensiones: [d(1, 0, 1, 5)] }] });
  assert.match(t, /Exposiciones prioritarias: exigencias psicológicas \(60 % en rojo\)/);
  assert.match(t, /A vigilar: inseguridad sobre el futuro/);
  assert.match(t, /En Caja destaca exigencias psicológicas/);
  assert.equal(P.conclusionSugerida({ total: 2, codigos: 5, usados: 2, minimo: 5, suficiente: false }), "");
});

test("códigos: 8 caracteres sin 0, 1, I, L ni O", () => {
  assert.ok(P.CODIGO_PSICOSOCIAL.test("K7Q3M9TX"));
  for (const malo of ["K7Q3M9T", "K7Q3M9TO", "K7Q3M9T1", "K7Q3M9TI", "K7Q3M9TL", "k7q3m9tx"]) assert.ok(!P.CODIGO_PSICOSOCIAL.test(malo), malo);
  assert.equal(P.normalizarCodigo("k7q3-m9tx "), "K7Q3M9TX");
});
