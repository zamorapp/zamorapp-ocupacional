// Biblioteca de hojas para el paciente: la versión del servicio guarda solo lo de su hoja y se aplica debajo de los
// cambios de cada consulta. Uso: node --test scripts/pruebas/hojas-version.test.mjs
import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";

const raiz = fileURLToPath(new URL("../../src/", import.meta.url));
const jiti = createJiti(import.meta.url, { alias: { "@/": raiz } });
const { hojaEditable, soloDeLaHoja, conVersion, areasBienestar, alarmasQuitadas, HOJAS_EDITABLES } = await jiti.import("../../src/lib/hojas-version.ts");
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

test("al guardar, las señales de alarma no se pueden quitar ni dejar en blanco", () => {
  const ansiedad = hojaEditable("bienestar-ansiedad");
  const i = TEMAS.find((t) => t.clave === "ansiedad").grupos.findIndex((g) => g.alarma);
  assert.ok(i >= 0, "ansiedad tiene grupo de alarma");
  assert.equal(alarmasQuitadas(ansiedad, { [`ansiedad-${i}`]: [] }), true);
  assert.equal(alarmasQuitadas(ansiedad, { [`ansiedad-${i}`]: ["Si piensa en hacerse daño, busque ayuda.", "  "] }), true);
  assert.equal(alarmasQuitadas(ansiedad, { [`ansiedad-${i}`]: ["Si piensa en hacerse daño, busque ayuda hoy."] }), false);
  assert.equal(alarmasQuitadas(ansiedad, { "ansiedad-0": [] }), false, "un grupo que no es de alarma sí se puede vaciar");
  assert.equal(alarmasQuitadas(hojaEditable("dieta-hta"), { evitar: [] }), false);
  // Heridas, quemaduras, ansiedad y ánimo traen alarmas
  for (const k of ["heridas", "quemaduras", "ansiedad", "animo"]) assert.ok(TEMAS.find((t) => t.clave === k).grupos.some((g) => g.alarma), k);
});

test("dieta: los pasos del recuadro de azúcar baja no se pueden vaciar (Analizar #358)", () => {
  const dm = hojaEditable("dieta-diabetes");
  assert.equal(alarmasQuitadas(dm, { "g-dm-a1": "" }), true);
  assert.equal(alarmasQuitadas(dm, { "g-dm-a0": "   " }), true);
  assert.equal(alarmasQuitadas(dm, { "g-dm-a0": "Tome 15 g de azúcar." }), false);
  assert.equal(alarmasQuitadas(dm, { "g-dm-nota": "" }), false, "lo que no es alarma sí se puede vaciar");
});
