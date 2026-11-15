// Pantallas de error (31-oct): lo lanzado se muestra sin fallar aunque no sea un Error, y las partes de una versión
// anterior se reconocen en todas sus formas (Turbopack en Vercel dice «Failed to load chunk … from module»).
// La pantalla blanca de React #310 se reprodujo con Playwright (router.refresh() + reset() del reintento automático); esta prueba
// además vigila que el reintento siga siendo una recarga completa.
// Uso: node --test scripts/pruebas/pantalla-error.test.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";

const raiz = fileURLToPath(new URL("../../src/", import.meta.url));
const jiti = createJiti(import.meta.url, { alias: { "@/": raiz } });
const { normalizarError, esVersionVieja, SOLO_PARTES, detalle } = await jiti.import("../../src/lib/error-pantalla.ts");

test("lo lanzado nunca rompe la pantalla de error", () => {
  for (const x of [null, undefined, "texto", 42, { message: "de Supabase", code: "PGRST" }, { sinMensaje: 1 }, new TypeError("x")]) {
    const e = normalizarError(x);
    assert.equal(typeof e.nombre, "string");
    assert.equal(typeof e.mensaje, "string");
    assert.match(detalle(e), /^Detalle: /);
  }
  const conCodigo = Object.assign(new Error("fallo"), { digest: "123" });
  assert.match(detalle(normalizarError(conCodigo)), /^Código: 123 · Detalle: Error: fallo/);
});

test("partes de una versión anterior: Turbopack, webpack, Chrome y Safari", () => {
  const viejas = [
    "Failed to load chunk /_next/static/chunks/75d5f4b72b1d847c.js from module 64893",
    "Loading chunk 123 failed.",
    "Loading CSS chunk 9 failed",
    "Failed to fetch dynamically imported module: https://x/_next/static/chunks/a.js",
    "Importing a module script failed.",
  ];
  for (const m of viejas) {
    assert.ok(esVersionVieja(normalizarError(new Error(m))), m);
    assert.ok(SOLO_PARTES.test(m), m);
  }
  const chunk = new Error("x"); chunk.name = "ChunkLoadError";
  assert.ok(esVersionVieja(normalizarError(chunk)));
});

test("un fallo de red suelto no se trata como parte vieja fuera de la pantalla de error", () => {
  for (const m of ["Failed to fetch", "NetworkError when attempting to fetch resource.", "Load failed"]) {
    assert.ok(!SOLO_PARTES.test(m), m);
    assert.ok(esVersionVieja(normalizarError(new TypeError(m))), m); // en la pantalla de error sí recarga una vez
  }
  assert.ok(!esVersionVieja(normalizarError(new Error("Cannot read properties of undefined"))));
});

test("el reintento recarga completo, sin router.refresh+reset (pantalla blanca #310), y existe la pantalla de último recurso", () => {
  // Sin comentarios: el código, no la explicación
  const error = readFileSync(new URL("../../src/app/error.tsx", import.meta.url), "utf8").replace(/^\s*\/\/.*$/gm, "");
  assert.ok(!/startTransition\s*\(|router\.refresh\(\)|reset\(\)/.test(error));
  assert.match(error, /recargarUnaVez/);
  const global = readFileSync(new URL("../../src/app/global-error.tsx", import.meta.url), "utf8");
  assert.match(global, /<html/);
  assert.match(global, /Reintentar/);
});
