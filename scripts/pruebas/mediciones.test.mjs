// Goniometría y espirometría con valores (opcionales): semáforo, resumen y limpieza de datos.
// Uso: node --test scripts/pruebas/mediciones.test.mjs
import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";

const raiz = fileURLToPath(new URL("../../src/", import.meta.url));
const jiti = createJiti(import.meta.url, { alias: { "@/": raiz } });
const M = await jiti.import("../../src/lib/mediciones.ts");
const { claseDeducida } = await jiti.import("../../src/lib/estudios.ts");

test("la goniometría se reconoce por el nombre y es estudio funcional", () => {
  assert.equal(claseDeducida("Goniometría"), "goniometria");
  assert.equal(claseDeducida("Rangos de movimiento articular"), "goniometria");
  assert.equal(M.tipoMedicion({ id: "x", nombre: "ESPIROMETRIA", grupo: null }, []), "espirometria");
  assert.equal(M.tipoMedicion({ id: "x", nombre: "Hematología", grupo: null }, []), null);
});

test("sin catálogo se agrega como examen libre; con catálogo usa el suyo", () => {
  assert.deepEqual(M.examenParaAgregar("goniometria", []), { id: "libre-goniometria", nombre: "Goniometría", grupo: "Estudios funcionales", resultado: "" });
  const cat = [{ id: "e1", nombre: "Espirometría basal", grupo: "Funcionales", datos: { clase: "espirometria" } }];
  assert.equal(M.examenParaAgregar("espirometria", cat).id, "e1");
});

test("goniometría: % del normal AAOS y extensión por grados que faltan", () => {
  assert.equal(M.estadoFila({ clave: "hombro.abd", lado: "D", grados: 170, normal: 180 }).estado, "normal");
  assert.equal(M.estadoFila({ clave: "hombro.abd", lado: "D", grados: 140, normal: 180 }).estado, "fuera");
  assert.equal(M.estadoFila({ clave: "hombro.abd", lado: "D", grados: 100, normal: 180 }).estado, "alterado");
  assert.equal(M.estadoFila({ clave: "rodilla.ext", lado: "I", grados: 5, normal: 0 }).estado, "normal");
  assert.equal(M.estadoFila({ clave: "rodilla.ext", lado: "I", grados: 20, normal: 0 }).estado, "alterado");
  const r = M.resumenMedicion({ tipo: "goniometria", filas: [
    { clave: "hombro.abd", lado: "D", grados: 120, normal: 180 },
    { clave: "hombro.abd", lado: "I", grados: 180, normal: 180 },
  ] });
  assert.equal(r.estado, "alterado");
  assert.match(r.texto, /^Limitación marcada: hombro der\. abducción 120° de 180°\.$/);
  const ok = M.resumenMedicion({ tipo: "goniometria", filas: [{ clave: "codo.flex", lado: "D", grados: 150, normal: 150 }] });
  assert.deepEqual(ok, { estado: "normal", texto: "Arcos de movimiento conservados (1 medido)." });
});

test("espirometría: patrón y gravedad (ATS/ERS 2005)", () => {
  const v = (o) => ({ fvc: null, fvcPct: null, fev1: null, fev1Pct: null, relacion: null, pef: null, ...o });
  assert.equal(M.interpretarEspiro(v({ fvc: 4, fev1: 3.4, fvcPct: 95, fev1Pct: 96 })).estado, "normal");
  const ob = M.interpretarEspiro(v({ fvc: 4, fev1: 2.4, fvcPct: 90, fev1Pct: 65 }));
  assert.deepEqual(ob, { estado: "alterado", patron: "Patrón obstructivo", gravedad: "moderado" });
  assert.equal(M.interpretarEspiro(v({ fvc: 2.5, fev1: 2.2, fvcPct: 70, fev1Pct: 74 })).patron, "Patrón restrictivo probable");
  assert.equal(M.interpretarEspiro(v({ fvcPct: 70, fev1Pct: 50, relacion: 60 })).patron, "Patrón mixto");
  assert.equal(M.relacionCalculada({ fvc: 4, fev1: 3 }), 75);
  assert.equal(M.interpretarEspiro(v({})).estado, "");
  const r = M.resumenMedicion({ tipo: "espirometria", valores: v({ fvc: 4.25, fev1: 3.4, fvcPct: 95, fev1Pct: 92 }) });
  assert.equal(r.texto, "Espirometría normal. FVC 4,25 L (95 %) · FEV1 3,4 L (92 %) · FEV1/FVC 80 %.");
});

test("en blanco no cuenta como dato: medición vacía", () => {
  assert.equal(M.medicionVacia(undefined), true);
  assert.equal(M.medicionVacia({ tipo: "goniometria", filas: [] }), true);
  assert.equal(M.medicionVacia({ tipo: "goniometria", filas: [], nota: "No colabora" }), false);
  assert.equal(M.medicionVacia({ tipo: "espirometria", valores: { fvc: null, fvcPct: null, fev1: null, fev1Pct: null, relacion: null, pef: null } }), true);
});

test("normalizar descarta basura, movimientos desconocidos y repetidos", () => {
  assert.equal(M.normalizarMedicion("x"), undefined);
  assert.equal(M.normalizarMedicion({ tipo: "otro" }), undefined);
  const g = M.normalizarMedicion({ tipo: "goniometria", filas: [
    { clave: "hombro.abd", lado: "D", grados: "120" }, { clave: "hombro.abd", lado: "D", grados: 90 },
    { clave: "inventado", lado: "D", grados: 10 }, { clave: "cervical.flex", lado: "I", grados: 40 }, { clave: "codo.flex", grados: 999 },
  ] });
  assert.deepEqual(g.filas, [{ clave: "hombro.abd", lado: "D", grados: 120, normal: 180 }, { clave: "cervical.flex", lado: "U", grados: 40, normal: 45 }]);
  const e = M.normalizarMedicion({ tipo: "espirometria", valores: { fvc: "3,5", fev1: -1, relacion: 300 } });
  assert.deepEqual(e.valores, { fvc: 3.5, fvcPct: null, fev1: null, fev1Pct: null, relacion: null, pef: null });
});
