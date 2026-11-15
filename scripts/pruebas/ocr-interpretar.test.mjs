// Lector de laboratorio: de las líneas leídas a la propuesta de resultados (sin navegador ni Tesseract).
// Uso: node --test scripts/pruebas/ocr-interpretar.test.mjs
import assert from "node:assert/strict";
import { test } from "node:test";
import { identidad, interpretar, normalizarCedula, sinonimosDe } from "../../src/lib/ocr/interpretar.ts";

const CATALOGO = [
  { id: "hb", nombre: "Hemoglobina", grupo: "Hematología", sinonimos: ["HGB"], unidad: "g/dL", max: 16 },
  { id: "glu", nombre: "Glicemia", grupo: "Química", sinonimos: ["Glucosa en ayunas", "Glucosa"], unidad: "mg/dL", max: 110 },
  { id: "leu", nombre: "Leucocitos", grupo: "Hematología", sinonimos: ["Glóbulos blancos"], unidad: "mm3", max: 10000 },
  { id: "vdrl", nombre: "VDRL", grupo: "Serología", sinonimos: [], unidad: "", max: null },
];
const L = (texto, confianza = 95, pagina = 1) => ({ texto, confianza, pagina });

test("lee valor, unidad, rango y marca con coma decimal", () => {
  const { filas } = interpretar([L("HGB ........ 11,2 g/dL  L   12.0 - 16.0")], CATALOGO);
  assert.equal(filas.length, 1);
  assert.equal(filas[0].examenId, "hb");
  assert.equal(filas[0].valor, "11,2");
  assert.equal(filas[0].unidad, "g/dL");
  assert.equal(filas[0].marca, "L");
  assert.deepEqual([filas[0].min, filas[0].max], [12, 16]);
  assert.deepEqual(filas[0].dudas, []);
});

test("prefiere el sinónimo más largo y acepta «hasta»", () => {
  const { filas } = interpretar([L("Glucosa en ayunas: 98 mg/dL  hasta 110")], CATALOGO);
  assert.equal(filas[0].examenId, "glu");
  assert.equal(filas[0].valor, "98");
  assert.equal(filas[0].referencia, "< 110");
});

test("punto de miles según el rango del catálogo; si no se sabe, queda para revisar", () => {
  const { filas } = interpretar([L("Glóbulos blancos 7.450 /mm3 5000-10000")], CATALOGO);
  assert.equal(filas[0].valor, "7450");
  const dudoso = interpretar([L("Hemoglobina 1.250")], [{ ...CATALOGO[0], max: null }]).filas[0];
  assert.ok(dudoso.dudas.some((d) => d.includes("miles")));
});

test("resultados cualitativos y poca confianza", () => {
  const { filas } = interpretar([L("VDRL No reactivo", 60)], CATALOGO);
  assert.equal(filas[0].valor, "No reactivo");
  assert.ok(filas[0].dudas.includes("Lectura poco clara"));
});

test("líneas sin examen del catálogo o sin valor no se proponen", () => {
  const { filas } = interpretar([L("LABORATORIO CLÍNICO SANTA ANA"), L("Hemoglobina"), L("Firma del bioanalista")], CATALOGO);
  assert.equal(filas.length, 0);
});

test("cabecera: cédula, fecha y nombre; identidad con cédula normalizada", () => {
  const { cabecera } = interpretar([L("Laboratorio Clínico Santa Ana"), L("Paciente: Pérez Gómez, Ana María   C.I.: V-12.345.678"), L("Fecha de emisión 05/10/2026")], CATALOGO);
  assert.equal(normalizarCedula(cabecera.cedula), "12345678");
  assert.equal(cabecera.fecha, "2026-10-05");
  assert.match(cabecera.laboratorio, /Santa Ana/);
  assert.equal(identidad(cabecera, { cedula: "12345678", nombre: "Ana María Pérez" }).nivel, "ok");
  assert.equal(identidad(cabecera, { cedula: "9999999", nombre: "Ana María Pérez" }).nivel, "revisar");
  assert.equal(identidad(cabecera, { cedula: "9999999", nombre: "Luis Rojas" }).nivel, "alerta");
  assert.equal(identidad({ ...cabecera, cedula: "" }, { cedula: "12345678", nombre: "Luis Rojas" }).nivel, "revisar");
});

test("sinónimos con tope de cantidad y largo; un sinónimo con signos de RegExp no rompe nada", () => {
  assert.equal(sinonimosDe({ sinonimos: Array.from({ length: 50 }, (_, i) => `s${i}`) }).length, 20);
  assert.equal(sinonimosDe({ sinonimos: ["x".repeat(200)] })[0].length, 60);
  const { filas } = interpretar([L("T4 (libre)* 1,1 ng/dL")], [{ id: "t4", nombre: "T4 (libre)*", grupo: null, sinonimos: [".*"], unidad: "ng/dL", max: 1.8 }]);
  assert.equal(filas[0]?.examenId, "t4");
});

test("errores típicos de foto: barra leída como I y C.I. leída como C.l.", () => {
  const cat = [{ id: "leu", nombre: "Leucocitos", grupo: null, sinonimos: ["Glóbulos blancos"], unidad: "/mm3", max: 10000 }];
  const l = (texto) => ({ texto, confianza: 90, pagina: 1 });
  const r = interpretar([l("Paciente: Ana Pérez C.l.: V-12.345.678"), l("Glóbulos blancos 7.450 Imm3 5000 - 10000"), l("Leucocitos 7.450 I/mm3")], cat);
  assert.equal(r.cabecera.cedula, "V-12.345.678");
  assert.equal(r.filas[0].unidad, "/mm3");
  assert.equal(r.filas[1].unidad, "/mm3");
  assert.ok(!r.filas[0].dudas.some((d) => d.startsWith("Unidad")));
});
