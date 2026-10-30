// «Mejorar con IA» del informe de vigilancia: el pedido no delata a nadie y la respuesta pegada se reparte bien.
// Uso: node --test scripts/pruebas/vigilancia-ia.test.mjs
import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";

const raiz = fileURLToPath(new URL("../../src/", import.meta.url));
const jiti = createJiti(import.meta.url, { alias: { "@/": raiz } });
const { pedidoIA, leerRespuestaIA } = await jiti.import("../../src/lib/vigilancia-ia.ts");

const datos = (extra = {}) => ({
  empresa: "Cines del Oriente C.A.", etiqueta: "III trimestre 2026", desde: "2026-07-01", hasta: "2026-09-30",
  s: { por_mes: [], piramide: [], capitulos: [] }, anterior: null, anioAnterior: null, pct: 1.2, pad: 0.1, acc: null,
  causas: {}, aptitudes: {},
  r: {
    poblacion: { total: 23, femenino: 2, masculino: 21, por_tipo: [] },
    consultas: { total: 30, pacientes: 20, preventivas: 12, no_preventivas: 18, sanos: 0, por_motivo: [{ nombre: "Preempleo", n: 5, grupo: null }], por_tipo: {}, por_sexo: { F: 2, M: 28 }, por_edad: [] },
    morbilidad: {
      total: 12, por_origen: { comun: 12 },
      por_sistema: [{ nombre: "Osteomuscular", n: 6 }, { nombre: "Trastornos mentales y del comportamiento", n: 4 }, { nombre: "Piel", n: 2 }],
      primeras_causas: [{ cie10: "M54.5", descripcion: "Lumbago", n: 6 }, { cie10: "B24", descripcion: "Enfermedad por VIH", n: 1 }, { cie10: "F41.1", descripcion: "Ansiedad generalizada", n: 4 }, { cie10: "L30.9", descripcion: "Dermatitis", n: 1 }],
    },
    ausentismo: { reposos: 1, dias_perdidos: 2, dias_periodo: 92, dias_computables: 2, por_causa: [], por_ente: [] },
    aptitud: {},
    ...extra,
  },
});

test("con 2 mujeres no sale la división por sexo", () => {
  const p = pedidoIA(datos(), "");
  assert.doesNotMatch(p, /mujeres/);
  assert.match(p, /Población: 23 trabajadores\./);
});

test("VIH y salud mental nunca salen por su nombre; los de 1 caso van en «otras»", () => {
  const p = pedidoIA(datos(), "");
  assert.doesNotMatch(p, /B24|VIH|F41|Ansiedad|Dermatitis|mentales/i);
  assert.match(p, /Lumbago \(M54\.5\): 6; otras: 6/);
  assert.match(p, /Osteomuscular: 6; otras: 6/);
});

test("el texto de riesgos pierde la razón social y el RIF", () => {
  const p = pedidoIA(datos(), "Puestos de Cines del Oriente C.A. (RIF J-00012651-8): ruido; J000126518 y CINES DEL ORIENTE C.A.", ["J-00012651-8"]);
  assert.doesNotMatch(p, /Cines del Oriente|J-?00012651-?8/i);
  assert.match(p, /\[empresa\]/);
});

test("la respuesta pegada se reparte por títulos, con o sin negritas y tildes", () => {
  const r = leerRespuestaIA("**Conclusión médico-ocupacional:**\nTexto.\n\n## RECOMENDACIONES MEDICO-OCUPACIONALES\n1. Uno\n\nRecomendaciones de seguridad y salud en el trabajo: 1. A");
  assert.deepEqual(r, { conclusiones: "Texto.", recomendaciones_medicas: "1. Uno", recomendaciones: "1. A" });
});
