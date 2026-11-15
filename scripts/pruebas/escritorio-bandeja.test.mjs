// Pantalla «Conflictos y rechazados» del escritorio: motivos en palabras simples y comparación lado a lado.
// Uso: node --test scripts/pruebas/escritorio-bandeja.test.mjs
import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";

const raiz = fileURLToPath(new URL("../../src/", import.meta.url));
const jiti = createJiti(import.meta.url, { alias: { "@/": raiz } });
const { comparar, explicarMotivo, nombreTabla, textoValor } = await jiti.import("../../src/lib/escritorio-bandeja.ts");

test("cada motivo de aplicar_cambios tiene su explicación", () => {
  const casos = [
    ["La ficha clínica cambió en otro lugar; la revisa el médico", "Se cambió en dos lugares a la vez"],
    ["Otro usuario cambió los mismos campos", "Se cambió en dos lugares a la vez"],
    ["Se editó en otro lugar; la edición gana y no se borra", "Se borró aquí, pero se editó en otro lugar"],
    ["Sin permiso para modificarla (por ejemplo, consulta firmada) o cambió en este instante", "La consulta ya estaba firmada"],
    ["Sin permiso para borrarla", "No tienes permiso para borrarlo"],
    ["La fila no existe o no tienes acceso", "Falta algo de lo que depende"],
    ['insert or update on table "consultas" violates foreign key constraint', "Falta algo de lo que depende"],
    ['duplicate key value violates unique constraint "trabajadores_cedula_key"', "Ya existe uno igual"],
    ["La fila no es de la organización del equipo", "Es de otra organización"],
    ["La nube no respondió por este cambio", "La nube no respondió"],
    ["Esta tabla no se modifica desde un equipo", "Esto solo se cambia en la web"],
  ];
  for (const [motivo, titulo] of casos) assert.equal(explicarMotivo(motivo, "rechazado").titulo, titulo, motivo);
  assert.equal(explicarMotivo(null, "conflicto").titulo, "Cambió en otro lugar");
  assert.equal(explicarMotivo("algo raro", "rechazado").titulo, "La nube no aceptó el cambio");
});

test("lado a lado: solo los campos del cambio, sin técnicos, los distintos primero", () => {
  const filas = comparar(
    { telefono: "0414-1", correo: "a@x.com", version: 3, org_id: "x" },
    { telefono: "0414-1", correo: "b@x.com", version: 4, org_id: "x" },
  );
  assert.deepEqual(filas.map((f) => [f.etiqueta, f.pc, f.nube, f.distinto]), [
    ["Correo", "a@x.com", "b@x.com", true],
    ["Teléfono", "0414-1", "0414-1", false],
  ]);
  assert.ok(comparar({ motivo_texto: "x" }, null)[0].distinto, "sin versión en la nube todo es distinto");
});

test("valores legibles y nombres de tabla", () => {
  assert.equal(textoValor(null), "—");
  assert.equal(textoValor(true), "Sí");
  assert.equal(textoValor("2026-10-29"), "29/10/2026");
  assert.equal(textoValor("2026-10-29T14:05:00-04:00"), "29/10/2026 14:05");
  assert.equal(textoValor("2026-10-29T18:05:00.000Z"), "29/10/2026 14:05", "hora de la base en UTC → Caracas");
  assert.equal(textoValor("2026-10-29 18:05:00+00"), "29/10/2026 14:05");
  assert.equal(textoValor(["a", "b"]), "a, b");
  assert.equal(nombreTabla("clinico.consultas"), "Consulta");
  assert.equal(nombreTabla("public.cosa_nueva"), "Cosa nueva");
});
