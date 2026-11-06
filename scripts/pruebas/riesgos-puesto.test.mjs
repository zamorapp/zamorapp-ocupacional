// Identificación de riesgos por puesto: lectura de las preguntas del catálogo, lo que falta por puesto, el resumen
// de las gráficas y «Pasar a los puestos» (agrega y actualiza, nunca borra).
// Uso: node --test scripts/pruebas/riesgos-puesto.test.mjs
import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";

const raiz = fileURLToPath(new URL("../../src/", import.meta.url));
const jiti = createJiti(import.meta.url, { alias: { "@/": raiz } });
const R = await jiti.import("../../src/lib/riesgos-puesto.ts");

const fila = (c) => ({ id: "x", pregunta: null, puestoId: "p1", puesto: "Soldador", area: "", tarea: "", grupo: "fisico", agente: "Calor", fuente: "", efecto: "", expuestos: 2, p: 0, s: 0, controles: "", medida: "", tipoMedida: "", responsable: "sst", plazo: "", ...c });

test("la pregunta del catálogo trae agente, daño, medida y fuente", () => {
  const q = R.preguntaDe({ id: "q1", nombre: "¿Trabaja al sol?", grupo: "fisico", texto: "Agente: Radiación solar\nDaño: Quemaduras\nMedida: Sombra\nFuente: NT-04-2023" });
  assert.deepEqual([q.agente, q.efecto, q.medida, q.fuente, q.grupo], ["Radiación solar", "Quemaduras", "Sombra", "NT-04-2023", "fisico"]);
  assert.equal(R.preguntaDe({ id: "q2", nombre: "¿X?", grupo: "inventado", texto: "Agente: Y" }), null);
});

test("lo que falta en el puesto: preguntas sin responder y riesgos sin valorar", () => {
  const preguntas = [{ id: "a" }, { id: "b" }];
  const p = { clave: "p1", puestoId: "p1", puesto: "Soldador", area: "", expuestos: 2, respuestas: { a: 1 } };
  const r = R.faltaEnPuesto(p, preguntas, [fila({ p: 3 })]);
  assert.equal(r.sinResponder, 1);
  assert.equal(r.sinValorar, 1);
  assert.equal(r.listo, false);
  assert.equal(R.faltaEnPuesto({ ...p, respuestas: { a: 1, b: 0 } }, preguntas, [fila({ p: 3, s: 4 })]).listo, true);
});

test("resumen para las gráficas: grupos, niveles y el máximo", () => {
  const r = R.resumen([fila({ p: 5, s: 5 }), fila({ id: "y", grupo: "quimico", agente: "Polvo", p: 1, s: 2 })]);
  assert.equal(r.porGrupo.length, 2);
  assert.equal(r.max.texto, "Crítico");
  assert.equal(r.porNivel.find((n) => n.texto === "Bajo").n, 1);
});

test("pasar a los puestos agrega lo que falta, actualiza lo valorado y no borra nada", () => {
  const puesto = { riesgos: { fisico: ["Ruido"], quimico: ["Humos"] }, evaluacion: { "fisico|Ruido": { p: 2, s: 2 } } };
  const r = R.aplicarAPuesto(puesto, [fila({ agente: "Ruido", p: 4, s: 3 }), fila({ id: "y", agente: "Calor", p: 3, s: 3 })]);
  assert.deepEqual(r.riesgos.fisico.sort(), ["Calor", "Ruido"]);
  assert.deepEqual(r.riesgos.quimico, ["Humos"]);
  assert.equal(r.evaluacion["fisico|Ruido"].p, 4);
  assert.equal(r.agregados, 1);
  assert.equal(r.actualizados, 1); // solo cuenta los que el puesto ya tenía
});

test("mediciones de oficina fuera de su valor de referencia", () => {
  const lux = R.MEDICIONES.find((m) => m.clave === "lux");
  assert.equal(R.fueraDeRango(lux, 300), true);
  assert.equal(R.fueraDeRango(lux, 600), false);
  assert.equal(R.fueraDeRango(lux, null), false);
});

test("qué fotografiar: las básicas y una por cada peligro marcado «Sí», sin repetir las ya tomadas", () => {
  const preguntas = [{ id: "a", agente: "Radiación solar" }, { id: "b", agente: "Polvo" }];
  const p = { clave: "p1", puestoId: null, puesto: "Obrero", area: "", expuestos: 1, respuestas: { a: 1, b: 0 }, fotos: [{ ruta: "o/e/f.jpg", nota: "Vista general del área" }] };
  const s = R.sugerirFotos(p, preguntas);
  assert.ok(s.includes("Radiación solar"));
  assert.ok(!s.includes("Polvo"));
  assert.ok(!s.includes("Vista general del área"));
  assert.ok(R.sugerirFotos({ ...p, fotos: [] }, [], true).includes("Pantalla, silla y mesa vistas de lado"));
});
