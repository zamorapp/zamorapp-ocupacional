import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { etiquetasDeLsRemote, lineaBase, mensajeLimite, revisarOrden, leerManifiesto, pendientes, resumen, respuestaSi, sha256, ultimaEtiqueta, verificar, MANIFIESTO } from "../migraciones/aprobadas.mjs";

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

test("etiquetas por git ls-remote: la anotada vale por su commit (^{}), las de otro nombre se ignoran", () => {
  const a = "a".repeat(40), b = "b".repeat(40), c = "c".repeat(40), d = "d".repeat(40);
  const r = etiquetasDeLsRemote(`${a}\trefs/tags/migraciones-20261030-1\r\n${b}\trefs/tags/migraciones-20261030-2\n${c}\trefs/tags/migraciones-20261030-2^{}\n${d}\trefs/tags/migraciones-x\n`);
  assert.deepEqual(r, [{ nombre: "migraciones-20261030-1", commit: a }, { nombre: "migraciones-20261030-2", commit: c }]);
  assert.deepEqual(etiquetasDeLsRemote(""), []);
});

test("límite de GitHub: la hora sale de las cabeceras (Caracas), nunca del reloj de la PC", () => {
  const reset = Date.UTC(2026, 9, 31, 14, 5) / 1000; // 10:05 en Caracas
  assert.match(mensajeLimite(403, { "x-ratelimit-reset": String(reset) }), /intenta a las 10:05/);
  assert.match(mensajeLimite(429, new Headers({ "retry-after": "120", date: "Sat, 31 Oct 2026 14:00:00 GMT" })), /intenta a las 10:02/);
  assert.match(mensajeLimite(403, {}), /en unos minutos/);
  assert.equal(mensajeLimite(404, {}), null);
});

test("una pendiente anterior a la última aplicada aborta", () => {
  const l = [{ archivo: "20261030405000_x.sql" }];
  assert.throws(() => revisarOrden(l, ["20261030410000", "20261030400000"]), /anterior a la última aplicada \(20261030410000\)/);
  revisarOrden([{ archivo: "20261030420000_x.sql" }], ["20261030410000"]);
  revisarOrden(l, []);
});

test("primera vez sin registro: solo se anota lo que está bajo el corte verificado; lo dudoso aborta", () => {
  const nombres = ["20261029400000_x.sql", "README.md", "20261030410000_a.sql", "20261030420000_b.sql", "20261028390000_y.sql"];
  assert.throws(() => lineaBase(nombres, leerManifiesto(m(), "migraciones-20261030-1")), /linea_base_hasta/);
  assert.throws(() => leerManifiesto(m({ linea_base_hasta: "2026" }), "migraciones-20261030-1"), /linea_base_hasta no válida/);
  const man = leerManifiesto(m({ linea_base_hasta: "20261029400000" }), "migraciones-20261030-1");
  const base = lineaBase(nombres, man);
  assert.deepEqual(base, [{ version: "20261028390000", nombre: "y" }, { version: "20261029400000", nombre: "x" }]);
  // unida a main después del corte y fuera del manifiesto (aprobada pero sin aplicar): no se adivina
  assert.throws(() => lineaBase([...nombres, "20261029405000_z.sql"], man), /20261029405000.*no se sabe si se aplicó/);
  const aplicadas = base.map((x) => x.version);
  assert.deepEqual(pendientes(man, aplicadas).map((x) => x.archivo), ["20261030410000_a.sql", "20261030420000_b.sql"]);
  assert.doesNotThrow(() => revisarOrden(pendientes(man, aplicadas), aplicadas));
  // segunda corrida con todo anotado: no se repite nada (lo que pasó el 30-oct con el aplicador viejo)
  assert.deepEqual(pendientes(man, [...aplicadas, "20261030410000", "20261030420000"]), []);
});
