// Conexión con winspiroPRO por GDT 2.1: pedido 6301 bien medido y lectura del resultado 6310.
// Uso: node --test scripts/pruebas/gdt.test.mjs
import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";

const raiz = fileURLToPath(new URL("../../src/", import.meta.url));
const jiti = createJiti(import.meta.url, { alias: { "@/": raiz } });
const G = await jiti.import("../../src/lib/gdt.ts");
const { interpretarEspiro } = await jiti.import("../../src/lib/mediciones.ts");

const paciente = { id: "12345678", apellidos: "Muñoz Pérez", nombres: "José Ángel", nacimiento: "1975-06-05", sexo: "M", tallaCm: 180, pesoKg: 79.4, fecha: "2026-11-07" };

test("el pedido 6301: cada línea mide lo que dice y 8100 es el largo del archivo", () => {
  const bytes = G.armarPedido(paciente);
  const texto = G.deBytes(bytes);
  assert.ok(texto.endsWith("\r\n"));
  const lineas = texto.split("\r\n").slice(0, -1);
  const largos = [];
  let i = 0;
  for (const l of lineas) {
    const n = Number(l.slice(0, 3));
    // el largo cuenta bytes (CP437: 1 por letra) más CR LF
    assert.equal(bytes[i + n - 2], 13, `CR al final de ${l}`);
    assert.equal(bytes[i + n - 1], 10);
    i += n;
    largos.push(n);
  }
  assert.equal(i, bytes.length);
  assert.equal(lineas[0], "01380006301");
  assert.equal(Number(lineas[1].slice(7)), bytes.length);
  assert.ok(lineas.includes("017300012345678"));
  assert.ok(lineas.includes("017310305061975"));
  assert.ok(lineas.includes("01031101"));
  assert.ok(lineas.includes("0123622180"));
  assert.ok(lineas.includes("011362379"));
  assert.ok(lineas.includes("017620007112026"));
  assert.ok(lineas.includes("0178315MIRWPRO1"));
  // ñ y é existen en CP437; la Á no: pierde el acento
  assert.ok(texto.includes("3101Muñoz Pérez"));
  assert.ok(texto.includes("3102José Angel"));
  assert.equal(bytes[texto.indexOf("ñ")], 0xa4);
});

test("sin nacimiento, sexo, talla o peso no se mandan esas líneas (winspiroPRO los pregunta)", () => {
  const t = G.deBytes(G.armarPedido({ ...paciente, nacimiento: null, sexo: null, tallaCm: null, pesoKg: 0 }));
  for (const c of ["3103", "3110", "3622", "3623"]) assert.ok(!t.split("\r\n").some((l) => l.slice(3, 7) === c), c);
});

// Ejemplo del manual de winspiroPRO (FVC), recortado
const RESPUESTA = [
  "01380006310", "014810000871", "0178316MIRWPRO1", "01092062", "014921802.10", "011300019",
  "0163101MARTINS", "0153102DANIEL", "0158402LUFU00", "017620013042012",
  "0128410FVC", "01384205.01", "0108421l", "01384605.34",
  "0138410FEV1", "01384204.21", "0108421l", "01284604.4",
  "0168410FEV1/VC", "01384200.00", "0108421%", "014846082.68",
  "0148410FEV1%", "011842084", "0108421%", "014846082.68",
  "0128410PEF", "01384207.56", "0128421l/s", "01384609.67",
  "0278470Predicted: Knudson", "0428470Interpretation: Normal Spirometry", "",
].join("\r\n");

test("el resultado 6310 llena FVC, FEV1, sus % del previsto, FEV1/FVC y PEF", () => {
  const r = G.leerResultado(RESPUESTA);
  assert.ok(r);
  assert.equal(r.paciente, "19");
  assert.deepEqual(r.valores, { fvc: 5.01, fvcPct: 94, fev1: 4.21, fev1Pct: 96, relacion: 84, pef: 7.56 });
  assert.deepEqual(r.textos, ["Predicted: Knudson", "Interpretation: Normal Spirometry"]);
  assert.equal(G.notaDeResultado(r), "winspiroPRO · Predicted: Knudson · Interpretation: Normal Spirometry");
  assert.equal(interpretarEspiro(r.valores).estado, "normal");
});

test("con nombres en español y FEV1% vacío usa FEV1/VC", () => {
  const t = ["01380006310", "0128410CVF", "01384203.00", "01384604.00", "0138410VEF1", "01384201.80", "01384604.00", "0168410VEF1/CV", "0138420  60", ""].join("\r\n");
  const r = G.leerResultado(t);
  assert.deepEqual(r.valores, { fvc: 3, fvcPct: 75, fev1: 1.8, fev1Pct: 45, relacion: 60, pef: null });
});

test("un archivo que no es resultado (o vacío) no llena nada", () => {
  assert.equal(G.leerResultado(""), null);
  assert.equal(G.leerResultado("01380006301\r\n"), null);
});

test("la cédula queda solo en números", () => {
  assert.equal(G.idPaciente("V-12.345.678"), "12345678");
});
