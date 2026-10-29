// Guardián (Analizar, 29-oct): Cesar cambia la fecha de Windows para abrir el SAME, así que ningún plazo de la puerta
// (sesiones, 7 días sin conexión, equipo de confianza, firmas de enlaces) puede medirse con Date.now() ni con
// new Date() sin argumentos. Se usa nube.reloj (hora anclada a la nube) o performance.now() para duraciones.
// Única excepción: reloj.mjs (de donde sale la hora de Windows) y las líneas de registro marcadas abajo.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const carpeta = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../puerta");
// Solo texto para el registro de la PC (puerta.log y la copia aparte del estado ilegible al arrancar)
const PERMITIDAS = [/^const registro = \(m\) => bitacora\.write\(`\$\{new Date\(\)\.toISOString\(\)\}/, /-anterior-\$\{new Date\(\)\.toISOString\(\)/, /puerta\.log"\), `\$\{new Date\(\)\.toISOString\(\)\} \[puerta\] estado ilegible/];

test("la puerta no mide plazos con la fecha de Windows", () => {
  const malas = [];
  for (const archivo of fs.readdirSync(carpeta).filter((f) => f.endsWith(".mjs") && f !== "reloj.mjs")) {
    fs.readFileSync(path.join(carpeta, archivo), "utf8").split("\n").forEach((linea, i) => {
      const codigo = linea.replace(/\/\/.*$/, "").trim();
      if (!/Date\.now\(|new Date\(\s*\)/.test(codigo)) return;
      if (PERMITIDAS.some((r) => r.test(codigo))) return;
      malas.push(`${archivo}:${i + 1}: ${codigo}`);
    });
  }
  assert.deepEqual(malas, [], "usa nube.reloj.ahora() (o performance.now() para duraciones)");
});
