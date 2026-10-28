// Conexión a la base de zamorApp con el certificado verificado contra la raíz de Supabase
// (supabase-ca-2021.crt, pública, vence en 2031): nadie en la red puede hacerse pasar por la base
// y quedarse con la clave ni con las historias. La usan respaldo.mjs, cargar-cie10.mjs y cargar.mjs.
import fs from "node:fs";

export const SSL = { ca: fs.readFileSync(new URL("./supabase-ca-2021.crt", import.meta.url), "utf8"), rejectUnauthorized: true };

// pg da prioridad a los parámetros ssl* de la URL sobre el objeto ssl: un «?sslmode=require» guardado
// apagaría la verificación del certificado. Se quitan siempre; solo se permite sslmode=disable hacia
// esta misma máquina (bancos de prueba locales), nunca hacia un servidor remoto.
const PARAMETROS_SSL = ["sslmode", "sslrootcert", "sslcert", "sslkey", "sslcrl", "sslpassword", "sslaccept", "uselibpqcompat", "ssl"];
const LOCALES = new Set(["localhost", "127.0.0.1", "[::1]"]);

export function configuracion(url) {
  const u = new URL(url);
  const local = LOCALES.has(u.hostname) && u.searchParams.get("sslmode") === "disable";
  for (const p of PARAMETROS_SSL) u.searchParams.delete(p);
  return { connectionString: u.toString(), ssl: local ? false : SSL };
}
