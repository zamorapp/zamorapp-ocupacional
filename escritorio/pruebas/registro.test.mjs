// Registros con tope: puerta.log y base.log nunca pasan de dos archivos de a lo más el tope (más una línea).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { abrirRegistro, rotarSiPasa } from "../puerta/registro.mjs";

test("puerta.log rota mientras el programa sigue abierto y guarda solo la copia anterior", () => {
  const carpeta = fs.mkdtempSync(path.join(os.tmpdir(), "registro-"));
  const ruta = path.join(carpeta, "puerta.log");
  const { write: escribir } = abrirRegistro(ruta, 1000);
  for (let i = 0; i < 100; i++) escribir(`${String(i).padStart(3, "0")} ${"x".repeat(45)}\n`);
  assert.deepEqual(fs.readdirSync(carpeta).sort(), ["puerta.1.log", "puerta.log"]);
  for (const f of fs.readdirSync(carpeta)) assert.ok(fs.statSync(path.join(carpeta, f)).size <= 1050, f);
  assert.match(fs.readFileSync(ruta, "utf8"), /099 x+\n$/, "la última línea está en el registro actual");
  fs.rmSync(carpeta, { recursive: true, force: true });
});

test("al abrir, un registro grande de antes pasa a .1.log; uno chico sigue igual", () => {
  const carpeta = fs.mkdtempSync(path.join(os.tmpdir(), "registro-"));
  const base = path.join(carpeta, "base.log");
  fs.writeFileSync(base, "y".repeat(2000));
  assert.equal(rotarSiPasa(base, 1000), true);
  assert.equal(fs.existsSync(base), false);
  assert.equal(fs.statSync(path.join(carpeta, "base.1.log")).size, 2000);
  fs.writeFileSync(base, "corto");
  assert.equal(rotarSiPasa(base, 1000), false);
  assert.equal(rotarSiPasa(path.join(carpeta, "no-existe.log")), false);
  fs.rmSync(carpeta, { recursive: true, force: true });
});
