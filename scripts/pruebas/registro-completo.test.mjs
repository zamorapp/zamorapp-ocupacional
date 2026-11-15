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
  assert.match(mensajePaciente("Gilberto Gómez", "OcupaVida", true), /^Hola Gilberto Gómez, .*Toma 5 minutos/);
  assert.match(mensajePaciente("Gilberto Gómez", "OcupaVida", true), /30 minutos para bajarlos todos.*enviar sus resultados/);
  assert.doesNotMatch(mensajePaciente("Gilberto Gómez", "OcupaVida", false), /30 minutos/);
  // Trabajador ya registrado: no llena datos; el enlace es para sus documentos y resultados
  assert.match(mensajePaciente("Rosa Mar", "OcupaVida", true, true), /^Hola Rosa Mar, OcupaVida le envía sus documentos\..*resultados.*30 minutos/);
  assert.doesNotMatch(mensajePaciente("Rosa Mar", "OcupaVida", true, true), /llene sus datos/);
  // El nombre va tal como lo escribió el servicio (Cesar, 12-nov: saludaba «Hola Sra.,»)
  assert.match(mensajePaciente("Sra. Francis", "OcupaVida"), /^Hola Sra\. Francis, /);
  assert.match(mensajePaciente(null, "OcupaVida"), /^Hola, /);
});

test("la pantalla final saluda con el nombre completo o neutro", async () => {
  const { saludoListo } = await jiti.import("../../src/lib/registro-documentos.ts");
  assert.equal(saludoListo("Sra. Francis", "Francis María"), "¡Listo, Sra. Francis!");
  assert.equal(saludoListo("  ", "Francis  María"), "¡Listo, Francis María!");
  assert.equal(saludoListo(null, ""), "¡Listo!");
});

test("«Otros» exámenes escritos a mano: varios a la vez, sin repetir", async () => {
  const { partirOtros } = await jiti.import("../../src/lib/registro-documentos.ts");
  assert.deepEqual(partirOtros("Electrolitos, coprocultivo; urocultivo\nelectrolitos ,  ,x"), ["Electrolitos", "Coprocultivo", "Urocultivo"]);
  assert.equal(partirOtros(Array.from({ length: 40 }, (_, i) => `Examen ${i}`).join(",")).length, 30);
});

test("«conversaste en consulta» solo cuando ya lo atendió", async () => {
  const { fraseIndicaciones } = await jiti.import("../../src/lib/registro-documentos.ts");
  assert.equal(fraseIndicaciones("Dr. César Zamora", true), "Aquí tiene las indicaciones que conversó en consulta con el Dr. César Zamora.");
  assert.equal(fraseIndicaciones("Dr. César Zamora", false), "Aquí tiene las indicaciones que le envía el Dr. César Zamora.");
});
