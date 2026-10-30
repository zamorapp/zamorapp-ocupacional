// Escriba de la consulta: el dictado de corrido se ordena en sus campos y nunca borra lo escrito.
// Uso: node --test scripts/pruebas/escriba.test.mjs
import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";

const raiz = fileURLToPath(new URL("../../src/", import.meta.url));
const jiti = createJiti(import.meta.url, { alias: { "@/": raiz } });
const { ordenarDictado, aplicarDictado, faltantes, leerSignos, leerAptitud } = await jiti.import("../../src/lib/escriba.ts");

const fila = (clave, nombre, normal) => ({ clave, nombre, valor: normal, normal });
const fisico = [
  fila("cabeza", "Cabeza y cuello", "Normocéfalo, sin adenopatías."),
  fila("abdomen", "Abdomen", "Blando, depresible, no doloroso."),
  fila("columna", "Columna", "Sin deformidades."),
  fila("piel", "Piel", "Sin lesiones."),
];
const funcional = [fila("respiratorio", "Respiratorio", "Niega tos."), fila("osteo", "Osteomuscular", "Niega dolor.")];
const motivos = [{ id: "m1", nombre: "Pre-empleo" }, { id: "m2", nombre: "Egreso" }];
const opciones = { fisico, funcional, motivos };

const DICTADO = "Buenos días, vienes para una evaluación preempleo. Motivo de consulta evaluación pre empleo para operador de montacargas. " +
  "Enfermedad actual niega síntomas punto. Interrogatorio respiratorio niega disnea osteomuscular dolor lumbar ocasional. " +
  "Signos vitales tensión 120 sobre 80 frecuencia cardíaca 72 peso 80 kilos talla 1,70 saturación 98. " +
  "Examen físico abdomen blando sin hernias umbilicales ni inguinales columna normal. " +
  "Aptitud apto con restricciones para trabajo en altura. Recomendaciones al trabajador usar faja lumbar.";

test("ordena cada sección en su campo", () => {
  const d = ordenarDictado(DICTADO, opciones);
  assert.match(d.textos.motivoTexto, /^Evaluación pre empleo para operador/);
  assert.match(d.textos.enfermedadActual, /^Niega síntomas\.$/);
  assert.match(d.sinUbicar, /^Buenos días/);
  assert.match(d.funcional.respiratorio, /Niega disnea/);
  assert.match(d.funcional.osteo, /Dolor lumbar ocasional/);
  assert.match(d.fisico.abdomen, /^Blando sin hernias umbilicales ni inguinales/);
  assert.equal(d.fisico.columna, "Sin deformidades.", "«normal» toma el texto normal de la plantilla");
  assert.equal(d.fisico.cabeza, undefined);
  assert.equal(d.aptitud.clasificacion, "elegible_con_restricciones");
  assert.match(d.aptitud.observacion, /^Para trabajo en altura/);
  assert.match(d.textos.recomendacionesTrabajador, /Usar faja lumbar/);
  assert.equal(d.motivoId, "m1");
  assert.deepEqual(d.signos, { ta: "120/80", fc: "72", peso: "80", talla: "170", sat: "98" });
});

test("las regiones solo cuentan dentro del examen", () => {
  const d = ordenarDictado("Enfermedad actual dolor en el abdomen desde ayer", opciones);
  assert.match(d.textos.enfermedadActual, /Dolor en el abdomen desde ayer/);
  assert.deepEqual(d.fisico, {});
});

test("«examen físico normal» llena todas las regiones con su normal", () => {
  const d = ordenarDictado("examen físico sin alteraciones", opciones);
  assert.equal(d.fisico.abdomen, "Blando, depresible, no doloroso.");
  assert.equal(Object.keys(d.fisico).length, 4);
});

test("signos con distintas formas de decirlos", () => {
  assert.deepEqual(leerSignos("presión arterial de 130 con 85, frecuencia 80, frecuencia respiratoria 18, temperatura 36 coma 5"),
    { ta: "130/85", fc: "80", fr: "18", temp: "36.5" });
  assert.equal(leerSignos("mide 1 metro 65").talla, "165");
  assert.equal(leerSignos("talla 172").talla, "172");
});

test("aptitud", () => {
  assert.equal(leerAptitud("no apto"), "no_elegible");
  assert.equal(leerAptitud("apto"), "elegible");
  assert.equal(leerAptitud("en espera de resultados"), "espera_resultados");
});

test("faltantes marca lo que no se dictó", () => {
  const d = ordenarDictado(DICTADO, opciones);
  assert.deepEqual(faltantes(d, { fisico, preventivo: false }), ["Cabeza y cuello", "Piel"]);
});

test("aplicar no borra lo escrito", () => {
  const base = {
    motivoTexto: "", enfermedadActual: "Lo que ya había.", indicaciones: "", conclusiones: "", recomendacionesEmpresa: "", recomendacionesTrabajador: "",
    signos: { ta: "110/70" }, examenFuncional: funcional,
    examenFisico: [{ ...fisico[0] }, { ...fisico[1], valor: "Escrito a mano." }, fisico[2], fisico[3]],
    aptitud: { clasificacion: "", observacion: "", limitaciones: [], vigenteHasta: "" },
  };
  const c = aplicarDictado(base, {
    textos: { enfermedadActual: "Dictado nuevo." }, signos: { ta: "120/80", peso: "80" },
    funcional: {}, fisico: { abdomen: "Hernia umbilical.", cabeza: "Adenopatía cervical." },
    aptitud: { clasificacion: "elegible", observacion: "" },
  });
  assert.equal(c.enfermedadActual, "Lo que ya había.\nDictado nuevo.");
  assert.deepEqual(c.signos, { ta: "110/70", peso: "80" });
  assert.equal(c.examenFisico[0].valor, "Adenopatía cervical.", "la fila intacta se reemplaza");
  assert.equal(c.examenFisico[1].valor, "Escrito a mano.\nHernia umbilical.", "la fila escrita a mano se conserva");
  assert.equal(c.aptitud.clasificacion, "elegible");
});
