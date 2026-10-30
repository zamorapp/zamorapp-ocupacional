import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { estaEnMain, lineaBase, refsDeEtiquetas, revisarOrden, leerManifiesto, pendientes, resumen, respuestaSi, sha256, ultimaEtiqueta, verificar, MANIFIESTO } from "../migraciones/aprobadas.mjs";

const sql = "select 1;";
const m = (extra = {}) => JSON.stringify({ etiqueta: "migraciones-20261030-1", aprobado: "Cesar", migraciones: [
  { archivo: "20261030420000_b.sql", sha256: sha256(sql), descripcion: "B" },
  { archivo: "20261030410000_a.sql", sha256: sha256(sql), descripcion: "A" },
], ...extra });

test("la etiqueta más nueva va por fecha y número, no alfabético", () => {
  assert.equal(ultimaEtiqueta(["migraciones-20261030-9", "migraciones-20261030-10", "v0.1.2", "migraciones-20261029-99"]), "migraciones-20261030-10");
  assert.equal(ultimaEtiqueta(["v1", "migraciones-x"]), null);
});

test("el manifiesto se valida entero y se ordena por versión", () => {
  const x = leerManifiesto(m(), "migraciones-20261030-1");
  assert.deepEqual(x.migraciones.map((y) => y.archivo), ["20261030410000_a.sql", "20261030420000_b.sql"]);
  assert.throws(() => leerManifiesto(m(), "migraciones-20261030-2"), /se bajó de/);
  assert.throws(() => leerManifiesto(m({ migraciones: [{ archivo: "../x.sql", sha256: sha256(sql), descripcion: "x" }] }), "migraciones-20261030-1"), /no válido/);
  assert.throws(() => leerManifiesto(m({ migraciones: [{ archivo: "20261030410000_a.sql", sha256: "abc", descripcion: "x" }] }), "migraciones-20261030-1"), /SHA-256/);
  assert.throws(() => leerManifiesto(m({ migraciones: [] }), "migraciones-20261030-1"), /no trae/);
  const rep = { archivo: "20261030410000_a.sql", sha256: sha256(sql), descripcion: "A" };
  assert.throws(() => leerManifiesto(m({ migraciones: [rep, { ...rep, archivo: "20261030410000_otra.sql" }] }), "migraciones-20261030-1"), /repetida/);
});

test("solo quedan las que la base no tiene; un archivo cambiado aborta", () => {
  const x = leerManifiesto(m(), "migraciones-20261030-1");
  assert.deepEqual(pendientes(x, ["20261030410000"]).map((y) => y.archivo), ["20261030420000_b.sql"]);
  assert.equal(verificar(x.migraciones[0], sql), sql);
  assert.throws(() => verificar(x.migraciones[0], sql + " "), /no coincide/);
});

test("la pregunta a Cesar: lista en palabras y solo «S» aplica", () => {
  assert.match(resumen([]), /al día/);
  assert.match(resumen([{ archivo: "20261030410000_a.sql", descripcion: "Constancias sin internet" }]), /Se aplicará 1 cambio aprobado:\n {2}1\. Constancias sin internet/);
  for (const r of ["S", "s", "si", "Sí", " s "]) assert.ok(respuestaSi(r), r);
  for (const r of ["", "n", "no", "sii", "yes"]) assert.ok(!respuestaSi(r), r);
});

test("el manifiesto del repo coincide con sus archivos", () => {
  if (!fs.existsSync(MANIFIESTO)) return;
  const texto = fs.readFileSync(MANIFIESTO, "utf8");
  const x = leerManifiesto(texto, JSON.parse(texto).etiqueta);
  for (const y of x.migraciones) verificar(y, fs.readFileSync(`supabase/migrations/${y.archivo}`, "utf8"));
});

test("solo etiquetas migraciones-* (también anotadas) y solo si el commit está en main", () => {
  const r = refsDeEtiquetas([
    { ref: "refs/tags/migraciones-20261030-1", object: { type: "commit", sha: "a" } },
    { ref: "refs/tags/migraciones-20261030-2", object: { type: "tag", sha: "b" } },
    { ref: "refs/tags/migraciones-x", object: { type: "commit", sha: "c" } },
  ]);
  assert.deepEqual(r, [{ nombre: "migraciones-20261030-1", tipo: "commit", sha: "a" }, { nombre: "migraciones-20261030-2", tipo: "tag", sha: "b" }]);
  assert.ok(estaEnMain({ status: "ahead" }) && estaEnMain({ status: "identical" }));
  for (const st of ["behind", "diverged", undefined]) assert.ok(!estaEnMain({ status: st }), String(st));
});

test("una pendiente anterior a la última aplicada aborta", () => {
  const l = [{ archivo: "20261030405000_x.sql" }];
  assert.throws(() => revisarOrden(l, ["20261030410000", "20261030400000"]), /anterior a la última aplicada \(20261030410000\)/);
  revisarOrden([{ archivo: "20261030420000_x.sql" }], ["20261030410000"]);
  revisarOrden(l, []);
});

test("primera vez sin registro: lo anterior del commit se anota como hecho y solo se aplica lo del manifiesto", () => {
  const man = leerManifiesto(m(), "migraciones-20261030-1");
  const base = lineaBase(["20261029400000_x.sql", "README.md", "20261030410000_a.sql", "20261030420000_b.sql", "20261028390000_y.sql"], man);
  assert.deepEqual(base, [{ version: "20261028390000", nombre: "y" }, { version: "20261029400000", nombre: "x" }]);
  const aplicadas = base.map((x) => x.version);
  assert.deepEqual(pendientes(man, aplicadas).map((x) => x.archivo), ["20261030410000_a.sql", "20261030420000_b.sql"]);
  assert.doesNotThrow(() => revisarOrden(pendientes(man, aplicadas), aplicadas));
  // ya anotadas en una segunda corrida: no se repite nada (lo que pasó el 30-oct con el aplicador viejo)
  assert.deepEqual(pendientes(man, [...aplicadas, "20261030410000", "20261030420000"]), []);
});
