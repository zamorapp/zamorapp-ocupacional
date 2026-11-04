// El informe impreso de ergonomía: una cuenta de la empresa siempre recibe la versión de RR. HH.
// (sin fotos ni detalle del método), aunque cambie ?para= en la dirección. Analizar 04-nov (#224).
// Uso: node --test scripts/pruebas/ergonomia-informe.test.mjs
import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";

const raiz = fileURLToPath(new URL("../../src/", import.meta.url));
const jiti = createJiti(import.meta.url, { alias: { "@/": raiz } });
const { vistaInforme } = await jiti.import("../../src/lib/ergonomia.ts");
const { ROLES_EMPRESA } = await jiti.import("../../src/lib/sesion-roles.ts");

test("cuentas de la empresa: siempre RR. HH., sin método ni fotos, con cualquier ?para=", () => {
  for (const rol of ROLES_EMPRESA)
    for (const para of [undefined, "", "ingenieria", "operaciones", "sst", "rrhh", "otro"]) {
      const v = vistaInforme(rol, para);
      assert.equal(v.depto?.clave, "rrhh", `${rol} con para=${para}`);
      assert.equal(v.conMetodo, false, `${rol} ve el método con para=${para}`);
      assert.equal(v.conFotos, false, `${rol} ve fotos con para=${para}`);
    }
});

test("el servicio: informe completo sin ?para=, y el de RR. HH. también sin método ni fotos", () => {
  for (const rol of ["administrador", "gerente_medico", "medico", "coordinador_sst"]) {
    assert.deepEqual(vistaInforme(rol, undefined), { depto: null, conMetodo: true, conFotos: true });
    assert.equal(vistaInforme(rol, "ingenieria").conMetodo, true);
    const rrhh = vistaInforme(rol, "rrhh");
    assert.equal(rrhh.conMetodo, false);
    assert.equal(rrhh.conFotos, false);
  }
});
