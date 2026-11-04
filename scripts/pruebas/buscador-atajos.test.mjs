// El buscador (Ctrl+K) nunca ofrece pantallas que el rol no puede abrir ni datos clínicos a quien no es de salud.
// Uso: node --test scripts/pruebas/buscador-atajos.test.mjs
import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";

const raiz = fileURLToPath(new URL("../../src/", import.meta.url));
const jiti = createJiti(import.meta.url, { alias: { "@/": raiz } });
const { buscarSecciones, ATAJOS } = await jiti.import("../../src/lib/atajos.ts");
const { REPORTES } = await jiti.import("../../src/lib/reportes-catalogo.ts");
const { SECCIONES_EMPRESA } = await jiti.import("../../src/lib/navegacion.ts");

const todo = (o) => {
  // Todas las palabras de todos los atajos: lo que el rol podría llegar a encontrar
  const hrefs = new Set();
  for (const a of ATAJOS) for (const q of [a.titulo, ...(a.palabras ?? "").split(" ")]) for (const r of buscarSecciones(q, o, 999)) hrefs.add(r.href);
  return hrefs;
};

test("se encuentran los precios de servicios", () => {
  assert.equal(buscarSecciones("precios de servicios", { clinico: true, rol: "administrador" })[0].href, "/facturacion?vista=servicios");
  assert.equal(buscarSecciones("dónde coloco los precios", { rol: "recepcion" })[0].href, "/facturacion?vista=servicios");
});

test("el portal de empresas no ve atajos, solo su menú", () => {
  const permitidas = new Set(SECCIONES_EMPRESA.map((s) => s.href));
  for (const h of todo({ portal: true, rol: "gerente_empresa" })) assert.ok(permitidas.has(h), `portal ve ${h}`);
});

test("quien no es de salud no ve reportes ni listas clínicas", () => {
  const vistas = todo({ clinico: false, rol: "recepcion" });
  for (const r of REPORTES.filter((r) => r.clinico)) assert.ok(!vistas.has(`/reportes/${r.clave}`), `ve reporte clínico ${r.clave}`);
  for (const c of ["diagnostico", "medicina", "paraclinico", "grupo_paraclinicos", "antecedente_medico", "clasificacion_aptitud", "limitacion_ocupacional", "causa_reposo"])
    assert.ok(!vistas.has(`/configuracion/listas?l=${c}`), `ve lista clínica ${c}`);
  for (const h of ["/configuracion/clinica", "/configuracion/plantillas", "/atencion/citas-lote", "/envios/bitacora"]) assert.ok(!vistas.has(h), `ve ${h}`);
});

test("recepción no ve las pantallas de gerencia", () => {
  const vistas = todo({ clinico: false, rol: "recepcion" });
  for (const h of ["/configuracion/usuarios", "/configuracion/organizacion", "/configuracion/auditoria", "/configuracion/respaldo", "/configuracion/equipos", "/configuracion/cargos", "/configuracion/escaneados-same"])
    assert.ok(!vistas.has(h), `recepción ve ${h}`);
  // y el administrador clínico sí las ve
  const admin = todo({ clinico: true, rol: "administrador" });
  for (const h of ["/configuracion/usuarios", "/configuracion/equipos", "/configuracion/clinica", "/reportes/morbilidad"]) assert.ok(admin.has(h), `admin no ve ${h}`);
});
