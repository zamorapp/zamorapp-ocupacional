// La vigilancia que se envía a la empresa no nombra la discapacidad (decisión de Cesar, #41).
// Uso: node --test scripts/pruebas/vigilancia-empresa.test.mjs
import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";

const raiz = fileURLToPath(new URL("../../src/", import.meta.url));
const jiti = createJiti(import.meta.url, { alias: { "@/": raiz } });
const { generarAnalisis, sinDiscapacidad, mencionaDiscapacidad } = await jiti.import("../../src/lib/vigilancia-analisis.ts");

const c = (nombre, n) => ({ nombre, n });
const r = {
  poblacion: { total: 40, femenino: 15, masculino: 25, por_tipo: [], discapacidad: 2, vigilancia_ocupacional: 3, vigilancia_no_ocupacional: 1 },
  consultas: {
    total: 60, pacientes: 30, preventivas: 20, no_preventivas: 40, sanos: 18, patologicos: 12,
    por_motivo: [{ ...c("Consulta", 40), grupo: null }], por_tipo: {}, por_sexo: { F: 25, M: 35 }, por_edad: [{ grupo: "25-34", n: 30 }],
  },
  morbilidad: { total: 25, pacientes: 12, por_sistema: [c("Respiratorio", 10)], por_origen: { comun: 25 }, primeras_causas: [{ cie10: "J00", descripcion: "Rinofaringitis", n: 8, pacientes: 6 }] },
  ausentismo: { reposos: 4, dias_perdidos: 12, dias_periodo: 90, dias_computables: 12, por_causa: [{ ...c("enfermedad_comun", 4), dias: 12 }], por_ente: [] },
  aptitud: { apto: 18 },
};
const s = { por_mes: [], piramide: [{ grupo: "25-34", n: 30, F: 12, M: 18 }], capitulos: [c("Respiratorio", 10)] };
const datos = (rep) => ({
  empresa: "Empresa A", etiqueta: "III trimestre 2026", desde: "2026-07-01", hasta: "2026-09-30", r: rep, s,
  anterior: null, anioAnterior: null, pct: 1, pad: 0.1, acc: null, causas: {}, aptitudes: {},
});
const VARIANTES = Array.from({ length: 25 }, (_, i) => i);

test("el análisis del servicio puede nombrar la discapacidad (control)", () => {
  assert.ok(VARIANTES.some((v) => mencionaDiscapacidad(generarAnalisis(datos(r), v))));
});

test("la versión para la empresa nunca nombra la discapacidad, en ninguna redacción", () => {
  const rEmpresa = sinDiscapacidad(r);
  assert.equal(rEmpresa.poblacion.discapacidad, undefined);
  assert.equal(r.poblacion.discapacidad, 2, "no toca el reporte original (está en la memoria de 3 minutos)");
  for (const v of VARIANTES) assert.equal(mencionaDiscapacidad(generarAnalisis(datos(rEmpresa), v)), false, `variante ${v}`);
});

test("un texto guardado que nombra la discapacidad se detecta", () => {
  assert.equal(mencionaDiscapacidad({ resumen: "Hay 2 trabajadores con Discapacidad registrada" }), true);
  assert.equal(mencionaDiscapacidad({ analisis: { poblacion: "Sin novedades." } }), false);
  assert.equal(mencionaDiscapacidad(null), false);
});
