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

test("encuentra funciones por lo que se hace, no solo pantallas", () => {
  const medico = { clinico: true, rol: "administrador" };
  assert.equal(buscarSecciones("nueva cita", medico)[0].titulo, "Nueva cita");
  assert.equal(buscarSecciones("agendar", medico)[0].titulo, "Nueva cita");
  assert.equal(buscarSecciones("registrar trabajador", medico)[0].titulo, "Registrar trabajador");
  assert.equal(buscarSecciones("reportar accidente", medico)[0].titulo, "Reportar accidente");
  assert.equal(buscarSecciones("rula", medico)[0].href, "/ergonomia");
  assert.equal(buscarSecciones("ultimos atendidos", medico)[0].href, "/atencion?empresas=todas#consultas");
  assert.equal(buscarSecciones("vacaciones", medico)[0].href, "/configuracion/horario");
  assert.equal(buscarSecciones("papelera", medico)[0].href, "/configuracion/papelera");
});

test("las funciones respetan los permisos de su pantalla", () => {
  const recepcion = todo({ clinico: false, rol: "recepcion" });
  for (const h of ["/configuracion/papelera", "/atencion?empresas=todas#consultas"]) assert.ok(!recepcion.has(h), `recepción ve ${h}`);
  // Ergonomía se puede mirar, pero «Nueva evaluación» es solo de quien evalúa
  assert.ok(!buscarSecciones("rula", { clinico: false, rol: "recepcion" }).some((d) => d.titulo === "Nueva evaluación ergonómica"));
  // La papelera es del administrador clínico; Conflictos solo existe en el escritorio
  assert.ok(!todo({ clinico: false, rol: "administrador" }).has("/configuracion/papelera"));
  assert.ok(!todo({ clinico: true, rol: "administrador" }).has("/conflictos"), "Conflictos aparece en la web");
});

test("los roles de ergonomía del buscador son los de la pantalla", async () => {
  const { ROLES_ERGONOMIA } = await jiti.import("../../src/lib/ergonomia.ts");
  const { ERGONOMIA } = await jiti.import("../../src/lib/atajos.ts");
  assert.deepEqual([...ERGONOMIA].sort(), [...ROLES_ERGONOMIA].sort());
});

test("ergonomía, psicosocial y el mapa de riesgos se encuentran bajo «Evaluaciones de riesgos» (Cesar, 06-nov)", async () => {
  const medico = { clinico: true, rol: "medico" };
  assert.equal(buscarSecciones("mapa de riesgos", medico)[0].href, "/riesgos");
  assert.ok(buscarSecciones("ergonomia", medico).some((d) => d.href === "/ergonomia"));
  assert.ok(buscarSecciones("psicosocial", medico).some((d) => d.href === "/psicosocial"));
  assert.ok(buscarSecciones("evaluaciones de riesgos", medico).some((d) => d.href === "/evaluaciones"));
  const { ROLES_RIESGOS } = await jiti.import("../../src/lib/riesgos-puesto.ts");
  const { ERGONOMIA } = await jiti.import("../../src/lib/atajos.ts");
  assert.deepEqual([...ROLES_RIESGOS].sort(), [...ERGONOMIA].sort());
});
