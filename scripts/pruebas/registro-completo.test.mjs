// Enlace del paciente: hábitos en palabras del paciente y el nombre de quien lo atiende bien escrito en las frases.
// Uso: node --test scripts/pruebas/registro-completo.test.mjs
import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";

const raiz = fileURLToPath(new URL("../../src/", import.meta.url));
const jiti = createJiti(import.meta.url, { alias: { "@/": raiz } });
const { valorHabito, conArticulo, aQuien, mensajePaciente } = await jiti.import("../../src/lib/solicitudes-paciente.ts");

test("«No» guarda «Niega» como en la consulta; ejercicio, «No realiza»; «Sí» con el detalle", () => {
  assert.equal(valorHabito("tabaco", false, ""), "Niega");
  assert.equal(valorHabito("actividad_fisica", false, ""), "No realiza");
  assert.equal(valorHabito("tabaco", true, " 5 al día "), "Sí: 5 al día");
  assert.equal(valorHabito("cafe", true, ""), "Sí");
});

test("artículo correcto para el médico o el servicio", () => {
  assert.equal(conArticulo("Dr. César Zamora"), "el Dr. César Zamora");
  assert.equal(aQuien("Dr. César Zamora"), "al Dr. César Zamora");
  assert.equal(aQuien("Dra. Ana Pérez"), "a la Dra. Ana Pérez");
  assert.equal(aQuien("OcupaVida"), "a OcupaVida");
});

test("el WhatsApp dice cuánto toma llenarlo", () => {
  assert.match(mensajePaciente("Gilberto Gómez", "OcupaVida", true), /^Hola Gilberto, .*Toma 5 minutos/);
  assert.match(mensajePaciente("Gilberto Gómez", "OcupaVida", true), /30 minutos para bajarlos todos.*enviar tus resultados/);
  assert.doesNotMatch(mensajePaciente("Gilberto Gómez", "OcupaVida", false), /30 minutos/);
  // Trabajador ya registrado: no llena datos; el enlace es para sus documentos y resultados
  assert.match(mensajePaciente("Rosa Mar", "OcupaVida", true, true), /^Hola Rosa, OcupaVida te envía tus documentos\..*resultados.*30 minutos/);
  assert.doesNotMatch(mensajePaciente("Rosa Mar", "OcupaVida", true, true), /llenes tus datos/);
});

test("«conversaste en consulta» solo cuando ya lo atendió", async () => {
  const { fraseIndicaciones } = await jiti.import("../../src/lib/registro-documentos.ts");
  assert.equal(fraseIndicaciones("Dr. César Zamora", true), "Aquí tienes las indicaciones que conversaste en consulta con el Dr. César Zamora.");
  assert.equal(fraseIndicaciones("Dr. César Zamora", false), "Aquí tienes las indicaciones que te envía el Dr. César Zamora.");
});
