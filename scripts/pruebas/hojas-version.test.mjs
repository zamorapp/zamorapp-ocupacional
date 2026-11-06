// Biblioteca de hojas para el paciente: la versión del servicio guarda solo lo de su hoja y se aplica debajo de los
// cambios de cada consulta. Uso: node --test scripts/pruebas/hojas-version.test.mjs
import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";

const raiz = fileURLToPath(new URL("../../src/", import.meta.url));
const jiti = createJiti(import.meta.url, { alias: { "@/": raiz } });
const { hojaEditable, soloDeLaHoja, conVersion, areasBienestar, HOJAS_EDITABLES } = await jiti.import("../../src/lib/hojas-version.ts");
const { TEMAS } = await jiti.import("../../src/lib/bienestar.ts");

test("cada hoja guarda solo sus claves y nunca las indicaciones del paciente", () => {
  const c = { "lumbalgia-0": ["a"], "cuello-0": ["b"], intro: "x", indicaciones: "solo para Juan" };
  assert.deepEqual(soloDeLaHoja(hojaEditable("bienestar-lumbalgia"), c), { "lumbalgia-0": ["a"] });
  assert.deepEqual(soloDeLaHoja(hojaEditable("bienestar-pausas"), c), { intro: "x" });
  assert.deepEqual(soloDeLaHoja(hojaEditable("dieta-hta"), { evitar: ["sal"], indicaciones: "x" }), { evitar: ["sal"] });
  assert.equal(hojaEditable("historia-x"), null);
});

test("la versión del servicio va debajo de lo que se cambió en la consulta", () => {
  const versiones = { "bienestar-lumbalgia": { "lumbalgia-0": ["del servicio"] }, "dieta-hta": { evitar: ["cubitos"] }, "dieta-renal": { evitar: ["carambola"] } };
  assert.deepEqual(conVersion(versiones, { temas: ["pausas", "lumbalgia"] }, {}), { "lumbalgia-0": ["del servicio"] });
  assert.deepEqual(conVersion(versiones, { temas: ["lumbalgia"] }, { "lumbalgia-0": ["de este paciente"] }), { "lumbalgia-0": ["de este paciente"] });
  assert.deepEqual(conVersion(versiones, { dieta: "hta" }), { evitar: ["cubitos"] });
  assert.deepEqual(conVersion(null, { dieta: "hta" }, { evitar: ["x"] }), { evitar: ["x"] });
});

test("todos los temas tienen área y botón editable, con claves válidas para la base", () => {
  const enAreas = new Set(areasBienestar().flatMap((a) => a.claves));
  for (const t of TEMAS) {
    assert.ok(enAreas.has(t.clave), t.clave);
    assert.match(t.clave, /^[a-z_-]{1,30}$/);
    assert.ok(t.fuente.length > 20, `${t.clave} sin fuente`);
  }
  assert.equal(new Set(HOJAS_EDITABLES.map((h) => h.codigo)).size, HOJAS_EDITABLES.length);
  for (const h of HOJAS_EDITABLES) assert.match(h.codigo, /^(dieta|bienestar)-[a-z_-]{1,30}$/);
});
