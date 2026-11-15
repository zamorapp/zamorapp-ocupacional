// Motivo clínico del reposo (Cesar, 05-nov): «se indica reposo por presentar…» desde el motivo y los hallazgos positivos.
// Uso: node --test scripts/pruebas/reposo-motivo.test.mjs
import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";

const raiz = fileURLToPath(new URL("../../src/", import.meta.url));
const jiti = createJiti(import.meta.url, { alias: { "@/": raiz } });
const { proponerMotivoReposo, motivoReposoImpreso, MAXIMO_MOTIVO_REPOSO } = await jiti.import("../../src/lib/reposo-motivo.ts");

const fila = (nombre, valor, normal = "Normal") => ({ clave: nombre, nombre, valor, normal });
const base = { motivoTexto: "", enfermedadActual: "", examenFuncional: [], examenFisico: [], diagnosticos: [] };

test("motivo + solo los hallazgos positivos del examen físico", () => {
  const t = proponerMotivoReposo({ ...base, motivoTexto: "Dolor lumbar de 3 días de evolución.",
    examenFisico: [fila("Cardiopulmonar", "Normal"), fila("Columna lumbar", "Contractura paravertebral, Lasègue positivo"), fila("Abdomen", "")] });
  assert.equal(t, "Se indica reposo médico por presentar dolor lumbar de 3 días de evolución. Al examen físico: columna lumbar: contractura paravertebral, Lasègue positivo.");
});
test("sin motivo usa la primera oración de la enfermedad actual", () => {
  const t = proponerMotivoReposo({ ...base, enfermedadActual: "Fiebre de 39 °C y odinofagia desde ayer. Niega otros síntomas." });
  assert.equal(t, "Se indica reposo médico por presentar fiebre de 39 °C y odinofagia desde ayer.");
});
test("sin motivo ni examen, el diagnóstico; sin nada, vacío (no se imprime)", () => {
  assert.equal(proponerMotivoReposo({ ...base, diagnosticos: [{ cie10: "J06.9", descripcion: "Infección respiratoria aguda" }] }),
    "Se indica reposo médico por infección respiratoria aguda.");
  assert.equal(proponerMotivoReposo(base), "");
});
test("siglas en mayúsculas no se tocan", () => {
  assert.match(proponerMotivoReposo({ ...base, motivoTexto: "HTA descompensada" }), /por presentar HTA descompensada\./);
});
test("nunca pasa del tope aunque haya muchos hallazgos", () => {
  const examenFisico = Array.from({ length: 30 }, (_, i) => fila(`Región ${i}`, "Dolor a la palpación con limitación funcional moderada"));
  const t = proponerMotivoReposo({ ...base, motivoTexto: "x ".repeat(300), examenFisico });
  assert.ok(t.length <= MAXIMO_MOTIVO_REPOSO, `${t.length}`);
  assert.match(t, /Al examen físico: región 0/);
});
test("lo escrito por el médico gana; vacío vuelve al automático", () => {
  const c = { ...base, motivoTexto: "Cefalea", reposo: { motivoClinico: "  Texto del médico  " } };
  assert.equal(motivoReposoImpreso(c), "Texto del médico");
  assert.equal(motivoReposoImpreso({ ...c, reposo: { motivoClinico: "" } }), "Se indica reposo médico por presentar cefalea.");
});
test("«Sin alteraciones», «DLN» o «Niega» no cuentan como hallazgos", () => {
  const t = proponerMotivoReposo({ ...base, motivoTexto: "Cervicalgia",
    examenFisico: [fila("Cabeza", "Sin alteraciones."), fila("Tórax", "Dentro de límites normales"), fila("Abdomen", "DLN"), fila("Cuello", "Dolor a la rotación")] });
  assert.equal(t, "Se indica reposo médico por presentar cervicalgia. Al examen físico: cuello: dolor a la rotación.");
});
