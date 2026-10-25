// Carga el catálogo CIE-10 (supabase/datos/cie10.json) en la tabla public.cie10.
// Uso: DATABASE_URL="postgresql://..." node scripts/cargar-cie10.mjs
// Fuente: paquete npm "cie10" (MIT), 14.204 códigos en español.
import fs from "node:fs";
import pg from "pg";

const sinAcentos = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const datos = JSON.parse(fs.readFileSync(new URL("../supabase/datos/cie10.json", import.meta.url), "utf8"));

const cliente = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await cliente.connect();
await cliente.query("begin");
for (let i = 0; i < datos.length; i += 1000) {
  const lote = datos.slice(i, i + 1000);
  const valores = lote.map((_, k) => `($${k * 3 + 1}, $${k * 3 + 2}, $${k * 3 + 3})`).join(",");
  const params = lote.flatMap(([c, d]) => [c, d, sinAcentos(`${c} ${c.replace(".", "")} ${d}`)]);
  await cliente.query(
    `insert into public.cie10 (codigo, descripcion, busqueda) values ${valores}
     on conflict (codigo) do update set descripcion = excluded.descripcion, busqueda = excluded.busqueda`,
    params,
  );
}
await cliente.query("commit");
const { rows } = await cliente.query("select count(*) from public.cie10");
console.log("Códigos CIE-10 cargados:", rows[0].count);
await cliente.end();
