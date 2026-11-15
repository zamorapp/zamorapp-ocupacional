// OCRA Checklist y KIM-PP: el cálculo coincide con ejemplos hechos a mano sobre las tablas publicadas.
// Uso: node --test scripts/pruebas/ergonomia-ocra-kim.test.mjs
import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";

const raiz = fileURLToPath(new URL("../../src/", import.meta.url));
const jiti = createJiti(import.meta.url, { alias: { "@/": raiz } });
const { OCRA, multiplicadorDuracion } = await jiti.import("../../src/lib/ergonomia-ocra.ts");
const { KIM, puntosMasa, puntosTiempo } = await jiti.import("../../src/lib/ergonomia-kim.ts");
const { proponerHallazgos } = await jiti.import("../../src/lib/ergonomia.ts");

test("OCRA: turno de 8 h con 2 pausas da ICKL 21,4 (inaceptable medio)", () => {
  const r = OCRA.calcular({ turno: 480, pausas: 20, almuerzo: 30, noRepetitivo: 10, fr: 4, atd: 6, ate: 0, fzMod: 2, fzInt: 0, fzMax: 0,
    hombro: 6, sobreCabeza: 0, codo: 2, muneca: 4, agarre: 2, estereo: 1.5, ocGuantes: 1, concurren: 0, fso: 1 });
  assert.equal(r.puntaje, 21.4);
  assert.equal(r.nivel, "Inaceptable medio");
  assert.equal(r.completo, true);
  assert.equal(r.texto, "ICKL 21,4");
  const h = proponerHallazgos(OCRA, r, [], () => "x");
  assert.ok(h.some((x) => x.factor === "Exposición a movimientos repetitivos"));
});

test("OCRA: multiplicador de duración en los bordes de la tabla", () => {
  assert.equal(multiplicadorDuracion(420), 0.95);
  assert.equal(multiplicadorDuracion(480), 1);
  assert.equal(multiplicadorDuracion(481), 1.2);
  assert.equal(multiplicadorDuracion(800), 4);
});

test("KIM-PP: carro de 250 kg, 3 km por jornada da 120 puntos (alto); con mujeres ×1,3", () => {
  const base = { equipo: 3, masa: 250, recorrido: 3000, piso: 1, pendiente: 5, kManiobra: 1, kPreciso: 1, kRapido: 1, kRuedasDanadas: 1, postura: 5, organizacion: 2, mujeres: 0 };
  const r = KIM.calcular(base);
  assert.equal(r.puntaje, 120);
  assert.equal(r.urgencia, 4);
  assert.equal(r.completo, true);
  assert.equal(KIM.calcular({ ...base, mujeres: 1 }).puntaje, 156);
});

test("KIM-PP: en grúas y monorrieles el piso no cuenta; tablas en sus bordes", () => {
  const r = KIM.calcular({ equipo: 8, masa: 500, recorrido: 40, piso: 6, pendiente: 25, postura: 3, organizacion: 0, mujeres: 0 });
  assert.equal(r.puntaje, 13);
  assert.equal(r.completo, true);
  assert.equal(puntosMasa(5, 50), 1);
  assert.equal(puntosMasa(5, 51), 1);
  assert.equal(puntosMasa(5, 101), 2);
  assert.equal(puntosMasa(7, 2000), 50);
  assert.equal(puntosTiempo(40), 1);
  assert.equal(puntosTiempo(41), 1.5);
  assert.equal(puntosTiempo(50000), 10);
});
