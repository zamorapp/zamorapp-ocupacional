// Respaldo completo de los datos de zamorApp (Supabase) en un archivo .json.gz.
// Uso: DATABASE_URL="postgresql://..." node scripts/respaldo.mjs <carpeta> [<carpeta2> ...]
// Guarda todas las tablas de los esquemas public y clinico, más las cuentas de usuario,
// y conserva los últimos 30 respaldos en cada carpeta. La estructura está en supabase/migrations.
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import pg from "pg";

const CONSERVAR = 30;
const OMITIR = new Set(["public.cie10"]); // catálogo fijo, se recarga con cargar-cie10.mjs
const carpetas = process.argv.slice(2);
if (!carpetas.length) throw new Error("Indica al menos una carpeta de destino");

const cliente = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await cliente.connect();
const { rows: tablas } = await cliente.query(
  `select table_schema || '.' || table_name as nombre from information_schema.tables
   where table_type = 'BASE TABLE' and (table_schema in ('public', 'clinico')
     or (table_schema = 'auth' and table_name in ('users', 'identities')))
   order by 1`,
);

const datos = { fecha: new Date().toISOString(), tablas: {} };
let filas = 0;
for (const { nombre } of tablas) {
  if (OMITIR.has(nombre)) continue;
  const [esquema, tabla] = nombre.split(".");
  const { rows } = await cliente.query(`select coalesce(json_agg(t), '[]') as filas from "${esquema}"."${tabla}" t`);
  datos.tablas[nombre] = rows[0].filas;
  filas += rows[0].filas.length;
}
await cliente.end();

const comprimido = zlib.gzipSync(JSON.stringify(datos));
const archivo = `respaldo-${datos.fecha.slice(0, 19).replace(/[T:]/g, "-")}.json.gz`;
for (const carpeta of carpetas) {
  fs.mkdirSync(carpeta, { recursive: true });
  fs.writeFileSync(path.join(carpeta, archivo), comprimido);
  const viejos = fs.readdirSync(carpeta).filter((f) => /^respaldo-.*\.json\.gz$/.test(f)).sort().slice(0, -CONSERVAR);
  for (const f of viejos) fs.unlinkSync(path.join(carpeta, f));
}
console.log(`Respaldo ${archivo}: ${Object.keys(datos.tablas).length} tablas, ${filas} filas, ${(comprimido.length / 1024).toFixed(0)} KB`);
