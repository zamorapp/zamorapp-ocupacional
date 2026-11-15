// El manual trae la guía de cada método de ergonomía (el botón «¿Cómo se hace?» abre /ayuda#guia-<método>)
// y nombra los botones reales de las pantallas. Uso: node --test scripts/pruebas/manual-evaluaciones.test.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";

const raiz = fileURLToPath(new URL("../../src/", import.meta.url));
const jiti = createJiti(import.meta.url, { alias: { "@/": raiz } });
const { MANUAL, NOVEDADES } = await jiti.import("../../src/lib/manual.ts");
const { METODOS } = await jiti.import("../../src/lib/ergonomia.ts");
const { GRUPO_EVALUACIONES } = await jiti.import("../../src/lib/manual-evaluaciones.ts");

test("cada método de ergonomía tiene su guía con las cinco partes y su fuente", () => {
  for (const clave of Object.keys(METODOS)) {
    const t = MANUAL.find((x) => x.id === `guia-${clave}`);
    assert.ok(t, `falta la guía de ${clave}`);
    const titulos = t.partes.map((p) => p.titulo);
    for (const p of ["Qué mide", "Cuándo usarlo", "Cómo se aplica en el puesto", "Cómo se llena en zamorApp", "Cómo se interpreta", "Fuente"]) assert.ok(titulos.includes(p), `${clave}: falta «${p}»`);
    // La tarjeta que nombra el paso existe en «Nueva evaluación»
    const nueva = readFileSync(new URL("../../src/app/(app)/ergonomia/nueva-evaluacion.tsx", import.meta.url), "utf8");
    const tarjeta = t.partes.find((p) => p.titulo === "Cómo se llena en zamorApp").items[0].match(/tarjeta «([^»]+)»/)?.[1];
    assert.ok(tarjeta && nueva.includes(`titulo: "${tarjeta}"`), `${clave}: la tarjeta «${tarjeta}» no existe en Nueva evaluación`);
  }
});

test("ids únicos, grupo contiguo y novedades que apuntan a un tema", () => {
  const ids = MANUAL.map((t) => t.id);
  assert.equal(new Set(ids).size, ids.length);
  const pos = MANUAL.flatMap((t, i) => (t.grupo === GRUPO_EVALUACIONES ? [i] : []));
  assert.ok(pos.length >= 9);
  assert.equal(pos[pos.length - 1] - pos[0] + 1, pos.length, "las guías deben ir juntas");
  for (const n of NOVEDADES) assert.ok(ids.includes(n.tema), `novedad sin tema: ${n.tema}`);
});

test("los botones que nombra la guía existen en el editor", () => {
  const editor = readFileSync(new URL("../../src/app/(app)/ergonomia/[id]/editor-ergonomia.tsx", import.meta.url), "utf8");
  for (const b of ["Proponer desde el resultado", "Cerrar evaluación", "Reabrir para corregir", "Informe completo", "Fotos de la tarea", "Trabajadores expuestos", "Lado evaluado", "Cómo se calculó", "Otros riesgos del puesto"]) assert.ok(editor.includes(b), `no existe «${b}»`);
});
