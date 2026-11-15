// Arma supabase/migraciones-aprobadas.json para una etiqueta nueva (lo corre quien publica, nunca Cesar).
// Uso: node scripts/migraciones/preparar-etiqueta.mjs [--linea-base-hasta=AAAAMMDDHHMMSS] migraciones-AAAAMMDD-N "aprobado por" archivo.sql=Descripción ...
// --linea-base-hasta solo hace falta mientras producción no tenga registro: la última versión que se VERIFICÓ aplicada allá.
// Después: commit, `git tag <etiqueta>` y `git push origin <etiqueta>`. El aplicador de la PC toma la etiqueta más nueva.
import fs from "node:fs";
import path from "node:path";
import { ARCHIVO, ETIQUETA, MANIFIESTO, leerManifiesto, sha256 } from "./aprobadas.mjs";

const args = process.argv.slice(2);
const opcion = args.find((a) => a.startsWith("--linea-base-hasta="));
const [etiqueta, aprobado, ...pares] = args.filter((a) => a !== opcion);
const linea_base_hasta = opcion?.split("=")[1];
if (!ETIQUETA.test(etiqueta ?? "") || !aprobado || pares.length === 0) {
  console.error('uso: preparar-etiqueta.mjs migraciones-AAAAMMDD-N "Cesar, sí del AAAA-MM-DD HH:MM UTC" 2026..._x.sql="Qué hace" ...');
  process.exit(1);
}
const migraciones = pares.map((p) => {
  const i = p.indexOf("=");
  const archivo = p.slice(0, i), descripcion = p.slice(i + 1).trim();
  if (!ARCHIVO.test(archivo)) throw new Error(`nombre no válido: ${archivo}`);
  return { archivo, sha256: sha256(fs.readFileSync(path.join("supabase/migrations", archivo), "utf8")), descripcion };
});
const texto = JSON.stringify({ etiqueta, aprobado, ...(linea_base_hasta ? { linea_base_hasta } : {}), migraciones }, null, 2) + "\n";
leerManifiesto(texto, etiqueta); // la misma validación que hará la PC
fs.writeFileSync(MANIFIESTO, texto);
console.log(`${MANIFIESTO} listo para ${etiqueta}: ${migraciones.map((m) => m.archivo).join(", ")}`);
