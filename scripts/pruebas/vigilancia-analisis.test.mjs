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

test("RR. HH. no lee diagnósticos con menos de 3 casos ni confidenciales", () => {
  const d = structuredClone(datos);
  d.r.ausentismo.primeras_causas = [{ cie10: "F32.9", descripcion: "Episodio depresivo", n: 1, dias: 10 }];
  d.r.morbilidad.primeras_causas = [{ cie10: "B24", descripcion: "VIH", n: 4, pacientes: 4 }, { cie10: "L30.9", descripcion: "Dermatitis", n: 2, pacientes: 2 }];
  for (let v = 0; v < 8; v++) {
    const todo = JSON.stringify(generarAnalisis(d, v));
    assert.doesNotMatch(todo, /F32|depresiv|B24|VIH|L30|Dermatitis/i);
  }
});

test("otra variante cambia la redacción, no las cifras", () => {
  const textos = new Set(Array.from({ length: 6 }, (_, v) => generarAnalisis(datos, v).secciones.evaluaciones));
  assert.ok(textos.size >= 3, `solo ${textos.size} redacciones distintas`);
  for (const t of textos) assert.match(t, /11 evaluaciones|11 evaluaciones ocupacionales/);
});

// Pedido de Cesar (31-oct): todo cuadro tiene análisis, y sin datos lo dice con la misma frase
const { SECCIONES_ANALISIS } = await jiti.import("../../src/lib/vigilancia-analisis.ts");
const SIN = /Para este indicador no se encontraron registros en este trimestre\./;
const vacio = {
  ...datos, s: { por_mes: [], piramide: [], capitulos: [] }, acc: null, historial: [],
  r: {
    poblacion: { total: 10, femenino: 4, masculino: 6, por_tipo: [] },
    consultas: { total: 0, pacientes: 0, preventivas: 0, no_preventivas: 0, sanos: 0, por_tipo: {}, por_sexo: { F: 0, M: 0 }, por_edad: [], por_motivo: [] },
    morbilidad: { total: 0, por_sistema: [], por_origen: {}, primeras_causas: [] },
    ausentismo: { reposos: 0, dias_perdidos: 0, dias_periodo: 92, dias_computables: 0, por_causa: [], por_ente: [] },
    aptitud: {},
  },
};

test("cada sección tiene texto, y sin datos dice «no se encontraron registros»", () => {
  for (const d of [datos, vacio]) {
    const a = generarAnalisis(d, 0).secciones;
    for (const [k] of SECCIONES_ANALISIS) assert.ok(a[k]?.trim(), `sección vacía: ${k}`);
  }
  const a = generarAnalisis(vacio, 0).secciones;
  for (const k of ["uso", "evaluaciones", "dependencias", "morbilidad", "causas", "ausentismo", "reposos", "referencias", "aptitud", "externas", "reubicaciones", "anexo_tipo", "anexo_sexo", "anexo_reposo_dependencia", "integral"]) assert.match(a[k], SIN, k);
});

test("análisis integral: tendencia, prioridades, recomendaciones y conclusión final", () => {
  const d = { ...datos, historial: [{ etiqueta: "I trimestre 2026", consultas: 12, preventivas: 4, diagnosticos: 3, dias: 2, poblacion: 20 }, { etiqueta: "II trimestre 2026", consultas: 15, preventivas: 6, diagnosticos: 6, dias: 5, poblacion: 22 }] };
  const a = generarAnalisis(d, 0).secciones;
  assert.match(a.tendencias, /segundo período consecutivo/);
  assert.match(a.prioridades, /^Prioridad (alta|media)/m);
  assert.match(a.recomendaciones_empresa, /^1\. /);
  assert.match(a.recomendaciones_empresa, /Medir en el próximo informe/);
  assert.match(a.conclusion_final, /indicadores? en rango favorable/);
  assert.match(a.integral, /^• Proyección tiene a la vez/m);
});

test("anexo: con menos de 3 de un sexo no se comparan causas por sexo", () => {
  const d = structuredClone(datos);
  d.r.poblacion.femenino = 2;
  d.r.morbilidad.cortes = { sexo: { F: [{ cie10: "M54.5", descripcion: "Lumbago", n: 3, pacientes: 2 }], M: [{ cie10: "J00", descripcion: "Rinofaringitis", n: 4, pacientes: 4 }] } };
  const a = generarAnalisis(d, 0).secciones;
  assert.match(a.anexo_sexo, /menos de tres/);
  assert.doesNotMatch(a.anexo_sexo, /Lumbago|Rinofaringitis/);
});

test("siglas no se escriben en minúscula (IVSS, no iVSS)", () => {
  for (let v = 0; v < 6; v++) assert.doesNotMatch(JSON.stringify(generarAnalisis(datos, v)), /iVSS/);
});

test("RR. HH.: 1 enfermedad ocupacional y 1 reposo por accidente laboral no se cuentan con su cifra", () => {
  const d = structuredClone(datos);
  d.r.enfermedad_ocupacional = { casos: 1, dias: 12, casos_anteriores: 1, dias_anteriores: 20 };
  d.r.morbilidad.por_origen = { comun: 7, ocupacional: 2, accidente_laboral: 1 };
  d.r.ausentismo.detalle = [{ causa: "accidente_laboral", ente: "ivss", cie10: "S93.4", descripcion: "Esguince", n: 1, dias: 9 }];
  d.acc = { accidentes: 0, conTiempoPerdido: 0, diasPerdidos: 0, ifn: 0, is: 0, aTiempo: null, porDeclarar: 0, ifb: 0, hht: 30000 };
  for (let v = 0; v < 6; v++) {
    const todo = JSON.stringify(generarAnalisis(d, v).secciones);
    assert.doesNotMatch(todo, /\b1 caso\b|\b1 enfermedad|(?<![\d,.])[12] (caso|enfermedad|diagn|reposo|día|trabajador)/, `variante ${v}`);
    assert.doesNotMatch(todo, /Esguince|20 días/);
  }
});
