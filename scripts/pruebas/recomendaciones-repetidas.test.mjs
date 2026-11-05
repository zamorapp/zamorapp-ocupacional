// Recomendaciones repetidas entre empresa y trabajador (05-nov): la misma indicación sale una sola vez aunque venga
// con otra numeración, viñetas, artículos o erratas; si cambia un número (kg, meses) no se toca.
// Uso: node --test scripts/pruebas/recomendaciones-repetidas.test.mjs
import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";

const raiz = fileURLToPath(new URL("../../src/", import.meta.url));
const jiti = createJiti(import.meta.url, { alias: { "@/": raiz } });
const { partirPuntos, dicenLoMismo, puntosUnicos, sinRepetidas, categoriaDe } = await jiti.import("../../src/lib/recomendaciones-categorias.ts");

// Textos reales del catálogo (traídos del SAME)
const INICIO = "1. Uso de EPP\r\n2. Control y monitorización de procesos peligrosos por servicio de SSL\r\n3. Evaluación de puestos de trabajo para el control de riesgos y efectos nocivos sobre la salud.\r\n7. Avisar eventualidad";
const APTO = "1. Uso de los EPP\r\n2. Control de los procesos peligrosos o riesgos laborales que se encuentran en el área o ambiente de trabajo.";
const PREVAC_EMPRESA = "1. Sin limitación para el disfrute de sus vacaciones 2. En caso de alguna situación de salud consultar al centro de salud más cercano y avisar el servicio de seguridad y salud en el trabajo de la empresa. 3. Ser preventivos en el caso de realizar algunas actividades  de entretenimiento que puedan incurrir en ocasionar alguna lesión. \n4. Acudir al servicio de seguridad y salud en el trabajo al término de sus vacaciones para la evaluación ocupacional antes de su reinserción laboral";
const VACACIONAL = "1. Sin limitación para el disfrute de sus vacaciones\n\n\r\n2. En caso de alguna situación de salud consultar al centro de salud más cercano y avisar el servicio de seguridad y salud en el trabajo de la empresa. \r\n\n\n3. Ser preventivos en el caso de realizar algunas actividades  de entretenimiento que puedan incurrir en ocasionar alguna lesión.\r\n \n\n4. Acudir al servicio de seguridad y salud en el trabajo al término de sus vacaciones para la evaluación ocupacional antes de su reinserción laboral";

test("parte numeración corrida, viñetas y «2..» del SAME", () => {
  assert.deepEqual(partirPuntos(PREVAC_EMPRESA).length, 4);
  assert.deepEqual(partirPuntos("* Repetir examen de orina\r\n* Evaluación con urología."), ["Repetir examen de orina", "Evaluación con urología."]);
  assert.deepEqual(partirPuntos("1. Uno\r\n2.. Dos"), ["Uno", "Dos"]);
});
test("no parte «LOPCYMAT art. 56).» ni «12.5 kgs»", () => {
  assert.equal(partirPuntos("Notificar los riesgos (LOPCYMAT art. 56).\nConservar la notificación.").length, 2);
  assert.equal(partirPuntos("Cargas que no sobrepasen los 12.5 kgs en mujeres y 20 kgs en hombres.").length, 1);
});
test("«Uso de EPP» y «Uso de los EPP» dicen lo mismo", () => assert.ok(dicenLoMismo("Uso de EPP", "Uso de los EPP")));
test("un número distinto nunca es repetido (8 kg ≠ 12,5 kg; audiometría ≠ espirometría)", () => {
  assert.equal(dicenLoMismo("Manejo adecuado de cargas que no sobrepasen los 8 kgs en mujeres y 10 kgs en hombres", "Manejo adecuado de cargas que no sobrepasen los 12.5 kgs en mujeres y 20 kgs en hombres"), false);
  assert.equal(dicenLoMismo("Repetir audiometría en 6 meses", "Repetir espirometría a los 6 meses"), false);
  assert.equal(dicenLoMismo("Evaluación con urología", "Evaluación con nefrología"), false);
});
test("misma frase con una errata cuenta como repetida", () => {
  assert.ok(dicenLoMismo("Ser preventivos en el caso de realizar algunas actividades de entretenimiento que puedan incurrir en ocasionar alguna lesión.", "Ser preventivos en el caso de realizar algunas actividades de entretenimiento que puedan incurir en ocasionar alguna lesión"));
});
test("prevacacional de la empresa igual al del trabajador: la empresa queda vacía", () => assert.equal(sinRepetidas(PREVAC_EMPRESA, VACACIONAL).trim(), ""));
test("solo quita lo repetido y deja lo propio de la empresa", () => {
  const empresa = "Dotar el EPP según la matriz de riesgos.\nUso de los EPP";
  assert.equal(sinRepetidas(empresa, INICIO), "Dotar el EPP según la matriz de riesgos.");
});
test("sin repetidas devuelve el texto tal cual (no cambia el formato)", () => {
  const empresa = "1. Investigar el accidente.\r\n2. Informar al Comité.";
  assert.equal(sinRepetidas(empresa, INICIO), empresa);
});
test("dos frases elegidas que comparten «Uso de EPP» lo imprimen una vez", () => {
  const p = puntosUnicos(`${INICIO}\n${APTO}`);
  assert.equal(p.filter((x) => /EPP/.test(x)).length, 1);
  assert.equal(p.length, 5);
});
test("las del SAME quedan en su categoría", () => {
  const c = (nombre) => categoriaDe({ nombre });
  assert.equal(c("Restricción Pulmonar (Leve)"), "respiratorio");
  assert.equal(c("Leucocitosis (Triglicéridos > 150, Con Vldl >  De 50)"), "laboratorio");
  assert.equal(c("Disminución De Los Espacios Intervertebrales"), "columna");
  assert.equal(c("Anillo Inguinal Amplio"), "partes_blandas");
  assert.equal(c("Recomendaciones Para Trabajador Con Defecto De Pared"), "partes_blandas");
  assert.equal(c("Post Natal"), "maternidad");
});
