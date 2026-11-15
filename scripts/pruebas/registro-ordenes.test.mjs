// Enlace de registro: la orden sale separada por clase de estudio (sangre aparte; rayos X, eco, TAC… cada uno en la suya).
// Uso: node --test scripts/pruebas/registro-ordenes.test.mjs
import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";

const raiz = fileURLToPath(new URL("../../src/", import.meta.url));
const jiti = createJiti(import.meta.url, { alias: { "@/": raiz } });
const { partesOrden, filasRegistro, documentoDeRegistro } = await jiti.import("../../src/lib/registro-documentos.ts");

const perfil = [
  { nombre: "Hematología completa", grupo: "Hematología", clase: "laboratorio" },
  { nombre: "Glicemia" },
  { nombre: "Rx de tórax PA" },
  { nombre: "Eco abdominal", clase: "eco" },
  { nombre: "TAC de cráneo" },
  { nombre: "Espirometría" },
  { nombre: "Audiometría tonal" },
];

test("separa laboratorio, cada imagen y los funcionales juntos", () => {
  const p = partesOrden(perfil);
  assert.deepEqual(p.map((x) => x.parte), ["laboratorio", "rayos_x", "eco", "tomografia", "funcional"]);
  assert.deepEqual(p[0].examenes.map((e) => e.nombre), ["Hematología completa", "Glicemia"]);
  assert.equal(p[0].nombre, "Orden de laboratorio");
  assert.equal(p[4].examenes.length, 2);
});

test("la clase guardada manda sobre el nombre", () => {
  assert.deepEqual(partesOrden([{ nombre: "Perfil especial", clase: "resonancia" }]).map((x) => x.parte), ["resonancia"]);
});

test("el paciente ve una fila por orden y una por cada hoja", () => {
  const f = filasRegistro({ orden: { examenes: perfil }, control_ta: { dias: 14 } });
  assert.deepEqual(f.map((x) => x.parte ?? x.tipo), ["laboratorio", "rayos_x", "eco", "tomografia", "funcional", "control-ta"]);
  assert.equal(f.at(-1).detalle, "14 días");
});

test("cada orden lleva solo sus exámenes", () => {
  const v = {
    folio: "00000000-0000-4000-8000-000000000000", recibido: "2026-11-06T12:00:00Z", documentos: { orden: { examenes: perfil } },
    persona: { cedula: "V-1", nombres: "Gilberto", apellidos: "Gómez" }, org: { nombre: "Org", rif: null, direccion: null, telefono: null, correo: null, logo: null, ajustes: {} },
    empresa: null, motivo: null, medico: null, firmado: false,
  };
  assert.deepEqual(documentoDeRegistro(v, "2026-11-06", "rayos_x").datos.paraclinicos.map((p) => p.nombre), ["Rx de tórax PA"]);
  assert.equal(documentoDeRegistro(v, "2026-11-06").datos.paraclinicos.length, perfil.length);
});
