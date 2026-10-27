// Nube simulada como programa aparte, para la prueba de humo del instalador: el programa de escritorio
// instalado apunta a ella (ZAMORAPP_NUBE_URL=http://127.0.0.1:PUERTO) y se entra con los usuarios de prueba.
// Usa la base "nube" de prueba (NUBE_DB, con las migraciones reales y supabase/pruebas/10_datos.sql).
//   NUBE_DB=postgresql://... PUERTO=55500 node nube-cli.mjs
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
const nube = simularNube({ baseUrl: process.env.NUBE_DB, usuarios: USUARIOS_PRUEBA });
nube.servidor.listen(puerto, "127.0.0.1", () => console.log(`NUBE_LISTA http://127.0.0.1:${puerto}`));
process.on("SIGINT", () => nube.cerrar().then(() => process.exit(0)));
process.on("SIGTERM", () => nube.cerrar().then(() => process.exit(0)));
