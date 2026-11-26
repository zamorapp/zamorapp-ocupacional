import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { alias: { "@/": fileURLToPath(new URL("../../src/", import.meta.url)) } });
const { cambiosFichaPersonal, puedeEditarFichaPersonal } = await jiti.import("../../src/lib/ficha-personal.ts");
const actual = { nombres: "Persona", apellidos: "Ficticia", cedula: "1", telefono: null, correo: "antiguo", version: 2 };
const editar = (campos) => {
  const f = new FormData();
  for (const [clave, valor] of Object.entries(campos)) f.set(clave, valor);
  return cambiosFichaPersonal(f, actual, "2026-11-25");
};

test("actualiza los campos permitidos y conserva el perfil laboral y clínico", () => {
  assert.deepEqual(editar({ nombres: "  Persona editada ", cedula: " e 12.345.678 ", telefono: "0412 555 0101",
    org_id: "otra", empresa_id: "otra", grupo_sanguineo: "AB+", discapacidad: "true" }), {
    ok: true, cambios: { nombres: "Persona editada", cedula: "E-12345678", telefono: "0412 555 0101" },
  });
});

test("respeta cédula y correo históricos si no se tocaron y permite borrar un contacto", () => {
  assert.deepEqual(editar({ cedula: "1", correo: "antiguo", telefono: "0412 555 0101" }), {
    ok: true, cambios: { telefono: "0412 555 0101" },
  });
  assert.deepEqual(editar({ correo: "" }), { ok: true, cambios: { correo: null } });
});

test("rechaza datos personales inválidos y fechas inexistentes o futuras", () => {
  for (const campos of [{ cedula: "texto" }, { nombres: " " }, { correo: "sin-arroba" }, { sexo: "X" },
    { lateralidad: "X" }, { fecha_nacimiento: "2025-02-29" }, { fecha_nacimiento: "2026-11-26" }]) {
    assert.equal(editar(campos).ok, false, JSON.stringify(campos));
  }
  assert.deepEqual(editar({ fecha_nacimiento: "2000-02-29", lateralidad: "Zurda" }), {
    ok: true, cambios: { fecha_nacimiento: "2000-02-29", lateralidad: "zurdo" },
  });
});

test("la edición de la ficha se reserva a los roles autorizados del servicio", () => {
  assert.equal(puedeEditarFichaPersonal("administrador"), true);
  assert.equal(puedeEditarFichaPersonal("recepcion"), true);
  assert.equal(puedeEditarFichaPersonal("gerente_empresa"), false);
  assert.equal(puedeEditarFichaPersonal("trabajador"), false);
});
