// Restaura un respaldo de zamorApp (.json.gz de respaldo.mjs) en una base PostgreSQL y verifica que quedó completo.
// Uso: DATABASE_URL="postgresql://..." node scripts/restaurar.mjs <respaldo.json.gz> [--verificar]
//   La base de destino debe tener ya la estructura (supabase/migrations aplicadas). Las tablas del respaldo se vacían
//   y se cargan dentro de una transacción: si algo falla no queda nada a medias.
//   --verificar: solo compara las filas de cada tabla del respaldo con las de la base, sin cambiar nada.
//   Por seguridad no escribe en la nube de Supabase salvo con RESTAURAR_EN_LA_NUBE=si (recuperación de desastre).
// El catálogo CIE-10 no viaja en el respaldo: se recarga con scripts/cargar-cie10.mjs.
import fs from "node:fs";
import zlib from "node:zlib";
import pg from "pg";
import { configuracion } from "./conexion-segura.mjs";

const [archivo, ...opciones] = process.argv.slice(2);
if (!archivo) throw new Error("Indica el archivo de respaldo (.json.gz)");
const soloVerificar = opciones.includes("--verificar");
const url = process.env.DATABASE_URL ?? "";
if (!soloVerificar && /supabase\.(co|com)/.test(url) && process.env.RESTAURAR_EN_LA_NUBE !== "si") {
  throw new Error("La base de destino es la nube de Supabase: define RESTAURAR_EN_LA_NUBE=si solo si es una recuperación de desastre");
}

const respaldo = JSON.parse(zlib.gunzipSync(fs.readFileSync(archivo)));
const tablas = Object.keys(respaldo.tablas);
const cliente = new pg.Client(configuracion(url));
await cliente.connect();

try {
  if (!soloVerificar) {
    await cliente.query("begin");
    // Sin disparadores ni llaves foráneas durante la carga: los datos ya fueron validados cuando se guardaron
    await cliente.query("set local session_replication_role = replica");
    await cliente.query(`truncate ${tablas.map(nombreSql).join(", ")} cascade`);
    for (const tabla of tablas) {
      const filas = respaldo.tablas[tabla];
      if (!filas.length) continue;
      const columnas = await columnasCargables(tabla, Object.keys(Object.assign({}, ...filas)));
      const lista = columnas.map((c) => `"${c}"`).join(", ");
      // De a 500 filas para no armar consultas gigantes
      for (let i = 0; i < filas.length; i += 500) {
        await cliente.query(
          `insert into ${nombreSql(tabla)} (${lista}) overriding system value
           select ${lista} from json_populate_recordset(null::${nombreSql(tabla)}, $1)`,
          [JSON.stringify(filas.slice(i, i + 500))],
        );
      }
      await ajustarSecuencias(tabla);
    }
    await cliente.query("commit");
  }

  // Verificación: cada tabla del respaldo debe tener exactamente sus filas
  const diferencias = [];
  let total = 0;
  for (const tabla of tablas) {
    const { rows: [r] } = await cliente.query(`select count(*)::int as n from ${nombreSql(tabla)}`);
    total += r.n;
    if (r.n !== respaldo.tablas[tabla].length) diferencias.push(`${tabla}: respaldo ${respaldo.tablas[tabla].length}, base ${r.n}`);
  }
  if (diferencias.length) {
    console.error(`Restauración INCOMPLETA (${diferencias.length} tablas no coinciden): ${diferencias.join(" · ")}`);
    process.exitCode = 1;
  } else {
    console.log(`Restauración ${soloVerificar ? "verificada" : "completa"}: ${tablas.length} tablas, ${total} filas, respaldo del ${respaldo.fecha}`);
  }
} catch (e) {
  await cliente.query("rollback").catch(() => {});
  throw e;
} finally {
  await cliente.end();
}

function nombreSql(tabla) {
  const [esquema, nombre] = tabla.split(".");
  return `"${esquema}"."${nombre}"`;
}

// Columnas del respaldo que existen en la tabla y no son calculadas (las generadas se recalculan solas)
async function columnasCargables(tabla, delRespaldo) {
  const [esquema, nombre] = tabla.split(".");
  const { rows } = await cliente.query(
    `select column_name from information_schema.columns
     where table_schema = $1 and table_name = $2 and is_generated = 'NEVER'`,
    [esquema, nombre],
  );
  const existentes = new Set(rows.map((r) => r.column_name));
  return delRespaldo.filter((c) => existentes.has(c));
}

// Las secuencias (bigserial, identity) siguen después del mayor id restaurado
async function ajustarSecuencias(tabla) {
  const [esquema, nombre] = tabla.split(".");
  const { rows } = await cliente.query(
    `select a.attname as columna, pg_get_serial_sequence(format('%I.%I', $1::text, $2::text), a.attname) as secuencia
     from pg_attribute a where a.attrelid = format('%I.%I', $1::text, $2::text)::regclass and a.attnum > 0 and not a.attisdropped`,
    [esquema, nombre],
  );
  for (const { columna, secuencia } of rows.filter((r) => r.secuencia)) {
    await cliente.query(`select setval($1, coalesce((select max("${columna}") from ${nombreSql(tabla)}), 0) + 1, false)`, [secuencia]);
  }
}
