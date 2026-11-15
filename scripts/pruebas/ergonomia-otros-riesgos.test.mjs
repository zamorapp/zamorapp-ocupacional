// DEB · otros riesgos del puesto y mediciones ambientales: alertas, nivel y hallazgos por departamento.
// Uso: node --test scripts/pruebas/ergonomia-otros-riesgos.test.mjs
import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";

const raiz = fileURLToPath(new URL("../../src/", import.meta.url));
const jiti = createJiti(import.meta.url, { alias: { "@/": raiz } });
const { DEB } = await jiti.import("../../src/lib/ergonomia-deb.ts");
const { proponerHallazgos } = await jiti.import("../../src/lib/ergonomia.ts");

test("sin peligros biomecánicos, los otros riesgos dejan alerta y hallazgos con su departamento", () => {
  const r = DEB.calcular({ o_sol: 1, o_destajo: 1, o_ruido: 0, m_ruido: 90, m_lux: 500 });
  assert.equal(r.urgencia, 1);
  assert.deepEqual(r.otros.map((c) => c.categoria), ["Riesgos físicos", "Riesgos psicosociales y de organización", "Mediciones ambientales"]);
  assert.match(r.otros[2].items[0].texto, /ruido de 85 dBA o más \(medido 90 dBA\)/);
  const h = proponerHallazgos(DEB, r, [], () => "x");
  assert.ok(h.some((x) => x.factor === "Radiación solar" && x.departamento === "sst"));
  assert.ok(h.some((x) => x.factor.startsWith("Trabajo a destajo") && x.departamento === "rrhh"));
  assert.ok(h.some((x) => x.factor.startsWith("Ruido de 85 dBA") && x.departamento === "ingenieria"));
  assert.ok(!h.some((x) => /iluminancia/i.test(x.factor)), "500 lux está dentro de la referencia");
});

test("los otros riesgos son opcionales: no cambian si el DEB está completo", () => {
  const sin = DEB.calcular({});
  const con = DEB.calcular({ o_polvo: 1 });
  assert.equal(sin.completo, con.completo);
  assert.equal(sin.otros.length, 0);
});
