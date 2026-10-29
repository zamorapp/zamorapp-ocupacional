// «Completar con valores sugeridos» en Listas › Paraclínicos: solo llena lo vacío y nunca pisa lo escrito.
// Uso: node --test scripts/pruebas/paraclinicos-sugeridos.test.mjs
import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";

const raiz = fileURLToPath(new URL("../../src/", import.meta.url));
const jiti = createJiti(import.meta.url, { alias: { "@/": raiz } });
const { cambiosSugeridos, datosSugeridos, sugeridoPara, SUGERIDOS } = await jiti.import("../../src/lib/paraclinicos-sugeridos.ts");

test("reconoce por el nombre o por otro nombre, sin acentos ni mayúsculas", () => {
  assert.equal(sugeridoPara("GLUCOSA").nombre, "Glicemia");
  assert.equal(sugeridoPara("acido urico").nombre, "Ácido úrico");
  assert.equal(sugeridoPara("Leucocitos").nombre, "Glóbulos blancos");
  assert.equal(sugeridoPara("Colinesterasa"), null);
});

test("llena unidad, rango y otros nombres solo donde están vacíos", () => {
  const { cambios } = cambiosSugeridos([{ id: "1", nombre: "Hemoglobina", datos: { codigo_same: "7" } }]);
  assert.equal(cambios.length, 1);
  const { fuente, ...resto } = cambios[0].datos;
  assert.deepEqual(resto, { codigo_same: "7", tipo: "numero", unidad: "g/dL", rango_min: 13, rango_max: 16.5, rango_min_f: 12, rango_max_f: 16, sinonimos: ["Hb", "HGB"] });
  assert.match(fuente, /OMS 2024/, "la fuente acompaña al rango que se llenó");
});

test("no pisa lo que el médico escribió: unidad, rango, tipo ni otros nombres", () => {
  const datos = { tipo: "numero", unidad: "mmol/L", rango_max: 6.1, sinonimos: ["GLU"] };
  const { cambios } = cambiosSugeridos([{ id: "2", nombre: "Glicemia", datos }]);
  assert.equal(cambios[0].datos.unidad, "mmol/L");
  assert.equal(cambios[0].datos.rango_max, 6.1);
  assert.equal(cambios[0].datos.rango_min, undefined);
  assert.deepEqual(cambios[0].datos.sinonimos, ["GLU", "Glucosa", "Glicemia basal", "Glucosa en ayunas"]);
  assert.deepEqual(cambios[0].resumen, ["otros nombres: Glucosa, Glicemia basal, Glucosa en ayunas"]);
  assert.equal(cambios[0].datos.fuente, undefined, "si no se llenó el rango, no se le pone fuente ajena");
  // Un examen marcado «informe» no recibe rango
  const inf = cambiosSugeridos([{ id: "3", nombre: "Glicemia", datos: { tipo: "informe" } }]).cambios[0];
  assert.equal(inf.datos.rango_max, undefined);
});

test("nada que hacer si ya está completo; los que no están en el catálogo se listan", () => {
  const completo = cambiosSugeridos([{ id: "4", nombre: "VDRL", datos: { tipo: "informe", sinonimos: ["Serología", "RPR"] } }]);
  assert.equal(completo.cambios.length, 0);
  assert.equal(completo.sinCatalogo.length, SUGERIDOS.length - 1);
  const s = cambiosSugeridos([{ id: "5", nombre: "VDRL", datos: null }]).cambios[0];
  assert.equal(s.datos.tipo, "informe");
  assert.equal(s.datos.unidad, undefined);
});

test("los rangos de la tabla son coherentes (mínimo ≤ máximo) y todos dicen su fuente", () => {
  for (const x of SUGERIDOS) {
    assert.ok(x.fuente.length > 10, x.nombre);
    if (x.min !== undefined && x.max !== undefined) assert.ok(x.min <= x.max, x.nombre);
    if (x.minF !== undefined && x.maxF !== undefined) assert.ok(x.minF <= x.maxF, x.nombre);
  }
});

test("«Volver al valor sugerido» trae la tabla completa con su fuente", () => {
  const d = datosSugeridos(sugeridoPara("ALT"));
  assert.deepEqual([d.tipo, d.unidad, d.rango_min, d.rango_max, d.rango_max_f], ["numero", "U/L", null, 33, 25]);
  assert.match(d.fuente, /ACG 2017/);
  assert.equal(datosSugeridos(sugeridoPara("VDRL")).tipo, "informe");
});
