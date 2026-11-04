// Recomendaciones de varias líneas (04-nov): un clic las suma como bloque, otro las quita, y lo escrito a mano queda.
// Uso: node --test scripts/pruebas/frases.test.mjs
import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";

const raiz = fileURLToPath(new URL("../../src/", import.meta.url));
const jiti = createJiti(import.meta.url, { alias: { "@/": raiz } });
const { fraseUsada, sumarFrase, quitarFrase } = await jiti.import("../../src/lib/frases.ts");
const { aplicarPlantilla, PLANTILLA_VACIA } = await jiti.import("../../src/lib/plantillas.ts");

const larga = "Puede trabajar.\nUsar EPP.\nVolver al control.";

test("suma el bloque y queda marcada", () => {
  const v = sumarFrase("Nota del médico.", larga);
  assert.equal(v, "Nota del médico.\nPuede trabajar.\nUsar EPP.\nVolver al control.");
  assert.ok(fraseUsada(v, larga));
});
test("quitar deja solo lo escrito a mano", () => assert.equal(quitarFrase(sumarFrase("Nota del médico.", larga), larga), "Nota del médico."));
test("con una línea borrada a mano ya no cuenta como marcada (otro clic la completa)", () => {
  const v = "Puede trabajar.\nVolver al control.";
  assert.equal(fraseUsada(v, larga), false);
  assert.equal(sumarFrase(v, larga), "Puede trabajar.\nVolver al control.\nUsar EPP.");
});
test("los textos del SAME con \\r\\n se reconocen", () => {
  const same = "1. Uso de los EPP\r\n2. Avisar eventualidad.";
  const v = sumarFrase("", same);
  assert.equal(v, "1. Uso de los EPP\n2. Avisar eventualidad.");
  assert.ok(fraseUsada(v, same));
  assert.equal(quitarFrase(v, same), "");
});
test("dos frases que comparten una línea: quitar una no borra la de la otra", () => {
  const otra = "Usar EPP.\nHidratarse.";
  const v = sumarFrase(sumarFrase("", larga), otra);
  assert.equal(v, "Puede trabajar.\nUsar EPP.\nVolver al control.\nHidratarse.");
  assert.equal(quitarFrase(v, otra), "Puede trabajar.\nVolver al control.");
});
test("frase vacía nunca cuenta como usada", () => assert.equal(fraseUsada("algo", "  "), false));
test("la plantilla suma recomendaciones de varias líneas sin repetir", () => {
  const d = { aptitud: { observacion: "Usar EPP.", vigenteHasta: "" }, recomendacionesEmpresa: "", recomendacionesTrabajador: "", conclusiones: "", examenFuncional: [], examenFisico: [], fecha: "2026-11-04" };
  const r = aplicarPlantilla(d, { ...PLANTILLA_VACIA, aptitud: ["apto"] }, { recomendacion_aptitud: [{ codigo: "apto", nombre: "Apto", texto: larga }] });
  assert.equal(r.aptitud.observacion, "Usar EPP.\nPuede trabajar.\nVolver al control.");
});

const { sinRepetidas, categoriaDe } = await jiti.import("../../src/lib/recomendaciones-categorias.ts");
test("una recomendación elegida para empresa y trabajador sale una vez", () => {
  assert.equal(sinRepetidas("1. Usar EPP.\n2. Pausas activas cada 2 horas", "usar epp\nHidratarse."), "2. Pausas activas cada 2 horas");
  assert.equal(sinRepetidas(null, "x"), "");
  assert.equal(sinRepetidas("Igual.", ""), "Igual.");
});
test("categorías: la elegida manda; si no, por el nombre (hernia discal es columna, no pared)", () => {
  assert.equal(categoriaDe({ nombre: "Hernia discal L5-S1" }), "columna");
  assert.equal(categoriaDe({ nombre: "Hernia Umbilical" }), "partes_blandas");
  assert.equal(categoriaDe({ nombre: "Hernia Umbilical", datos: { categoria: "otras" } }), "otras");
  assert.equal(categoriaDe({ nombre: "Recomendaciones Post Vacacional" }), "evaluacion");
  assert.equal(categoriaDe({ nombre: "Obesidad I (con factores de riesgo cardiovascular)" }), "metabolico");
  assert.equal(categoriaDe({ nombre: "Algo sin tema", grupo: "" }), "otras");
});
