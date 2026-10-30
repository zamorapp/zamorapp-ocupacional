// Pantalla de inicio de la puerta: en una PC ya registrada nunca debe asomar el formulario de registro (29-oct:
// se veía en cada apertura mientras llegaba el estado y Cesar entró con su clave ahí, creyendo que lo pedía).
import assert from "node:assert/strict";
import { test } from "node:test";
import { PAGINA_INICIO } from "../puerta/inicio.mjs";

test("inicio: el formulario de registro empieza oculto y solo se muestra si la PC no está registrada", () => {
  assert.match(PAGINA_INICIO, /<form id="f" hidden>/);
  assert.doesNotMatch(PAGINA_INICIO, /<h1[^>]*>Preparar esta PC<\/h1>/, "el título de registro no sale antes de saber el estado");
  const decide = PAGINA_INICIO.slice(PAGINA_INICIO.indexOf("estado().then"));
  assert.match(decide, /s\.equipo && s\.copiaCompleta\) location\.href = app/);
  assert.match(decide, /else pedirRegistro\(s\)/);
});
