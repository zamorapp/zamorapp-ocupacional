// Analizador del informe de vigilancia: cada indicador tiene su lectura y la redacción cambia con la variante.
// Uso: node --test scripts/pruebas/vigilancia-analisis.test.mjs
import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";

const raiz = fileURLToPath(new URL("../../src/", import.meta.url));
const jiti = createJiti(import.meta.url, { alias: { "@/": raiz } });
const { generarAnalisis } = await jiti.import("../../src/lib/vigilancia-analisis.ts");

// El ejemplo de Cesar: 5 preempleos, 4 prevacacionales y 2 egresos
const datos = {
  empresa: "Empresa", etiqueta: "III trimestre 2026", desde: "2026-07-01", hasta: "2026-09-30",
  s: { por_mes: [{ mes: "2026-07", consultas: 10, preventivas: 5, diagnosticos: 4, dias_reposo: 3 }, { mes: "2026-08", consultas: 12, preventivas: 6, diagnosticos: 5, dias_reposo: 9 }], piramide: [{ grupo: "25-34", F: 4, M: 10, n: 14 }], capitulos: [{ nombre: "Osteomuscular", n: 6 }] },
  anterior: null, anioAnterior: null, pct: 1.4, pad: 0.3, acc: null, causas: { enfermedad_comun: "Enfermedad común" }, aptitudes: {}, entes: { ivss: "IVSS", interno: "Servicio médico interno" },
  r: {
    poblacion: { total: 23, femenino: 9, masculino: 14, por_tipo: [] },
    consultas: {
      total: 22, pacientes: 18, preventivas: 11, no_preventivas: 11, sanos: 10, por_tipo: {}, por_sexo: { F: 8, M: 14 }, por_edad: [],
      por_motivo: [{ nombre: "Pre-empleo", n: 5, grupo: "preventivo" }, { nombre: "Pre vacacional", n: 4, grupo: "preventivo" }, { nombre: "Egreso", n: 2, grupo: "preventivo" }, { nombre: "Morbilidad", n: 11, grupo: "no_preventivo" }],
      por_dependencia: [{ nombre: "Proyección", n: 12, personal: 5 }, { nombre: "Taquilla", n: 6, personal: 10 }],
    },
    morbilidad: { total: 9, pacientes: 8, por_sistema: [{ nombre: "Osteomuscular", n: 6 }], por_origen: { comun: 9 }, por_tipo_consulta: { primera: { n: 7, pacientes: 7 }, sucesiva: { n: 2, pacientes: 2 } }, primeras_causas: [{ cie10: "M54.5", descripcion: "Lumbago", n: 5, pacientes: 4 }, { cie10: "J00", descripcion: "Rinofaringitis", n: 3, pacientes: 3 }] },
    ausentismo: { reposos: 3, dias_perdidos: 12, dias_periodo: 92, dias_computables: 12, por_causa: [{ nombre: "enfermedad_comun", n: 3, dias: 12 }], por_ente: [{ nombre: "ivss", n: 2, dias: 9 }, { nombre: "interno", n: 1, dias: 3 }], por_dependencia: [{ nombre: "Proyección", n: 3, dias: 12 }] },
    aptitud: {},
  },
};

test("evaluaciones por motivo: reparto, ingresos/egresos, periódicas y vacacionales", () => {
  const t = generarAnalisis(datos, 0).secciones.evaluaciones;
  assert.match(t, /11 evaluaciones/);
  assert.match(t, /pre-empleo 5 \(45,5 %\)/);
  assert.match(t, /5 frente a 2|5 preempleos y 2 egresos/);
  assert.match(t, /periódicas/);
  assert.match(t, /prevacacional/);
});

test("dependencias, causas y reposos tienen su lectura", () => {
  const a = generarAnalisis(datos, 0).secciones;
  assert.match(a.dependencias, /Proyección/);
  assert.match(a.causas, /tres primeras/);
  assert.match(a.reposos, /4 días/);
});

test("otra variante cambia la redacción, no las cifras", () => {
  const textos = new Set(Array.from({ length: 6 }, (_, v) => generarAnalisis(datos, v).secciones.evaluaciones));
  assert.ok(textos.size >= 3, `solo ${textos.size} redacciones distintas`);
  for (const t of textos) assert.match(t, /11 evaluaciones|11 evaluaciones ocupacionales/);
});
