// Clase de cada examen (laboratorio, imagen, funcional) y el perfil sugerido sin laboratorio por defecto.
// Uso: node --test scripts/pruebas/estudios.test.mjs
import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";

const raiz = fileURLToPath(new URL("../../src/", import.meta.url));
const jiti = createJiti(import.meta.url, { alias: { "@/": raiz } });
const { claseDe, claseDeducida, familiaDe, separarPorLaboratorio } = await jiti.import("../../src/lib/estudios.ts");

test("deduce la clase por el nombre, sin acentos ni mayúsculas", () => {
  assert.equal(claseDeducida("ECO ABDOMINAL"), "eco");
  assert.equal(claseDeducida("Ecografía mamaria"), "eco");
  assert.equal(claseDeducida("Ecocardiograma"), "eco");
  assert.equal(claseDeducida("Rx de tórax PA"), "rayos_x");
  assert.equal(claseDeducida("Radiografía de columna lumbosacra"), "rayos_x");
  assert.equal(claseDeducida("Mamografía bilateral"), "rayos_x");
  assert.equal(claseDeducida("TAC de cráneo"), "tomografia");
  assert.equal(claseDeducida("Tomografía de tórax"), "tomografia");
  assert.equal(claseDeducida("Resonancia magnética de rodilla"), "resonancia");
  assert.equal(claseDeducida("RMN columna"), "resonancia");
  assert.equal(claseDeducida("Espirometría"), "espirometria");
  assert.equal(claseDeducida("Audiometría tonal"), "audiometria");
  assert.equal(claseDeducida("Electrocardiograma"), "electrocardiograma");
  assert.equal(claseDeducida("ECG en reposo"), "electrocardiograma");
  assert.equal(claseDeducida("Prueba de esfuerzo"), "funcional");
  assert.equal(claseDeducida("PSICOLÓGICO ESPECIAL"), "funcional");
});

test("lo de laboratorio sigue siendo laboratorio", () => {
  for (const n of ["Hematología completa", "Glicemia", "Colesterol total", "Examen de orina", "Tiempo de protrombina (TP)", "Tiempo de coagulación (TC)", "VDRL", "HIV"])
    assert.equal(claseDeducida(n), "laboratorio", n);
});

test("el grupo ayuda si el nombre no dice nada, y la clase guardada manda", () => {
  assert.equal(claseDeducida("Columna", "Rayos X"), "rayos_x");
  assert.equal(claseDe({ nombre: "Columna", grupo: "Rayos X", datos: { clase: "tomografia" } }), "tomografia");
  assert.equal(claseDe({ nombre: "Rx tórax", datos: { clase: "inventada" } }), "rayos_x");
  assert.equal(familiaDe({ nombre: "Audiometría" }), "funcional");
  assert.equal(familiaDe({ nombre: "Eco renal" }), "imagen");
});

test("el perfil sugerido separa el laboratorio (opcional) de los estudios", () => {
  const catalogo = [
    { id: "a", nombre: "Hematología completa" },
    { id: "b", nombre: "Rx de tórax" },
    { id: "c", nombre: "Placa", datos: { clase: "rayos_x" } },
  ];
  const { estudios, laboratorio } = separarPorLaboratorio(
    [{ id: "a", nombre: "Hematología completa" }, { id: "b", nombre: "Rx de tórax" }, { id: "c", nombre: "Placa" }, { id: "x", nombre: "Audiometría" }],
    catalogo,
  );
  assert.deepEqual(estudios.map((e) => e.id), ["b", "c", "x"]);
  assert.deepEqual(laboratorio.map((e) => e.id), ["a"]);
});

test("historial: clasifica cada archivo por sus estudios o por el nombre del archivo", async () => {
  const { clasificarAdjunto } = await jiti.import("../../src/lib/estudios.ts");
  const catalogo = [{ id: "hc", nombre: "Hematología completa" }, { id: "rx", nombre: "Rx de tórax PA" }];
  assert.deepEqual(clasificarAdjunto({ nombre: "a.pdf", examenes: ["hc", "rx"] }, catalogo), { familia: "imagen", clase: "rayos_x", estudios: ["Hematología completa", "Rx de tórax PA"] });
  assert.equal(clasificarAdjunto({ nombre: "a.pdf", examenes: ["hc"] }, catalogo).familia, "laboratorio");
  assert.equal(clasificarAdjunto({ nombre: "a.pdf", examenes: ["libre-audiometria tonal"] }, catalogo).clase, "audiometria");
  assert.equal(clasificarAdjunto({ nombre: "eco_abdominal_2025.jpg", examenes: [] }, catalogo).clase, "eco");
  assert.equal(clasificarAdjunto({ nombre: "IMG_2031.jpg", examenes: [] }, catalogo).familia, null);
});
