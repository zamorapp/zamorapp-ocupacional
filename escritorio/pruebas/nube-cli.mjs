// Nube simulada como programa aparte, para la prueba de humo del instalador: el programa de escritorio
// instalado apunta a ella (ZAMORAPP_NUBE_URL=http://127.0.0.1:PUERTO) y se entra con los usuarios de prueba.
// Usa la base "nube" de prueba (NUBE_DB, con las migraciones reales y supabase/pruebas/10_datos.sql).
//   NUBE_DB=postgresql://... PUERTO=55500 [ZAMORAPP_POSTGREST=ruta/postgrest] node nube-cli.mjs
// Con ZAMORAPP_POSTGREST el REST lo atiende un PostgREST real (como la nube); sin él, un mini REST.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { simularNube } from "./simulador-nube.mjs";

export const USUARIOS_PRUEBA = {
  "admin@x": { id: "00000000-0000-0000-0000-0000000000a1", clave: "clave-admin" },
  "medA@x": { id: "00000000-0000-0000-0000-0000000000a2", clave: "clave-med" },
};

if (!process.env.NUBE_DB) {
  console.error("Falta NUBE_DB");
  process.exit(2);
}
const puerto = Number(process.env.PUERTO || 55500);
const nube = simularNube({ baseUrl: process.env.NUBE_DB, usuarios: USUARIOS_PRUEBA, postgrest: process.env.ZAMORAPP_POSTGREST });
// Mientras exista este archivo, la nube se comporta como migrada por delante del programa (quita el SELECT de
// trabajadores, como el 27/10/2026): la prueba de la ventana lo crea para comprobar que el programa avisa «actualizar».
const marcaMigrada = process.env.ZAMORAPP_NUBE_MARCA_MIGRADA || path.join(os.tmpdir(), "zamorapp-nube-migrada");
setInterval(() => { nube.estado.migradaPorDelante = fs.existsSync(marcaMigrada); }, 300).unref();
(nube.postgrestListo || Promise.resolve(null)).then(
  (p) => nube.servidor.listen(puerto, "127.0.0.1", () => console.log(`NUBE_LISTA http://127.0.0.1:${puerto}${p ? ` (PostgREST real en ${p.puerto})` : " (mini REST)"}; marca «migrada por delante»: ${marcaMigrada}`)),
  (e) => { console.error(e.message); process.exit(3); },
);
process.on("SIGINT", () => nube.cerrar().then(() => process.exit(0)));
process.on("SIGTERM", () => nube.cerrar().then(() => process.exit(0)));
