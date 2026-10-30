// Aplica en Supabase las migraciones aprobadas que la base aún no tiene, bajándolas de la última etiqueta
// «migraciones-AAAAMMDD-N» del repo. Verifica el SHA-256 de cada archivo contra el manifiesto de esa etiqueta,
// muestra la lista y pide «S» antes de tocar nada. Todo dentro de UNA transacción: o todas o ninguna.
// No toca el SAME. El registro no lleva cédulas ni nombres.
import path from "node:path";
import readline from "node:readline/promises";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { MANIFIESTO, estaEnMain, leerManifiesto, pendientes, refsDeEtiquetas, resumen, respuestaSi, revisarOrden, ultimaEtiqueta, verificar } from "./aprobadas.mjs";

const REPO_GITHUB = "zamorapp/zamorapp-ocupacional";
const repo = process.cwd();
const pg = createRequire(path.join(repo, "package.json"))("pg");
const { configuracion } = await import(pathToFileURL(path.join(repo, "scripts", "conexion-segura.mjs")).href);
const hora = () => new Date().toISOString();

async function bajar(url, tipo = "text") {
  const r = await fetch(url, { headers: { "User-Agent": "zamorapp-aplicar-migraciones" } });
  if (!r.ok) throw new Error(`no se pudo bajar ${url} (HTTP ${r.status})`);
  return tipo === "json" ? r.json() : r.text();
}

// Cualquier error antes de conectar (red, etiqueta, manifiesto) sale con un mensaje claro: no se cambió nada
const fallar = (e) => { console.error(`${hora()} ERROR (no se cambió nada): ${e.message}`); process.exit(1); };
process.on("uncaughtException", fallar);
process.on("unhandledRejection", fallar);

// La etiqueta se resuelve a su commit y todo se baja de ese commit: no cambia entre un archivo y otro.
// Ese commit tiene que estar en main (revisado y unido): una etiqueta sobre una rama suelta no vale.
const API = `https://api.github.com/repos/${REPO_GITHUB}`;
const refs = refsDeEtiquetas(await bajar(`${API}/git/matching-refs/tags/migraciones-`, "json"));
const etiqueta = ultimaEtiqueta(refs.map((r) => r.nombre));
if (!etiqueta) throw new Error("no hay ninguna etiqueta de migraciones aprobadas en el repo");
const ref = refs.find((r) => r.nombre === etiqueta);
const commit = ref.tipo === "tag" ? (await bajar(`${API}/git/tags/${ref.sha}`, "json")).object.sha : ref.sha;
if (!/^[0-9a-f]{40}$/.test(commit ?? "")) throw new Error(`la etiqueta ${etiqueta} no apunta a un commit`);
if (!estaEnMain(await bajar(`${API}/compare/${commit}...main`, "json"))) throw new Error(`la etiqueta ${etiqueta} (${commit.slice(0, 7)}) no está en main: no se aplica nada que no esté revisado y unido`);
const crudo = (ruta) => `https://raw.githubusercontent.com/${REPO_GITHUB}/${commit}/${ruta}`;
const manifiesto = leerManifiesto(await bajar(crudo(MANIFIESTO)), etiqueta);
console.log(`${hora()} fuente aprobada: ${etiqueta} (${commit.slice(0, 7)}), ${manifiesto.migraciones.length} migraciones en el manifiesto`);

const c = new pg.Client(configuracion(process.env.DATABASE_URL));
await c.connect();
try {
  const { rows: [t] } = await c.query("select to_regclass('supabase_migrations.schema_migrations') is not null as hay");
  if (!t.hay) throw new Error("la base no tiene supabase_migrations.schema_migrations: no se puede saber qué falta (no se aplicó nada)");
  const { rows: ya } = await c.query("select version from supabase_migrations.schema_migrations");
  const lista = pendientes(manifiesto, ya.map((r) => r.version));
  revisarOrden(lista, ya.map((r) => r.version));
  console.log(`\n${resumen(lista)}\n`);
  if (lista.length === 0) { console.log(`${hora()} OK (nada que hacer)`); process.exit(0); }

  // Se baja y verifica TODO antes de preguntar: si un archivo no coincide, no se pregunta ni se aplica nada
  for (const x of lista) x.sql = verificar(x, await bajar(crudo(`supabase/migrations/${x.archivo}`)));
  console.log(`${hora()} SHA-256 verificado en las ${lista.length}`);

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const r = await rl.question("¿Aplicar ahora? Escribe S y Enter para sí, o N para no: ");
  rl.close();
  if (!respuestaSi(r)) { console.log(`${hora()} cancelado por el usuario: no se cambió nada`); process.exitCode = 2; }
  else {
    await c.query("begin");
    await c.query("set local lock_timeout = '15s'; set local statement_timeout = '120s'");
    // Dos pasos: el freno de la base arranca APAGADO; se enciende cuando el administrador ya activó su código
    await c.query("create table if not exists public.ajustes_seguridad (clave text primary key, valor boolean not null default false)");
    await c.query("insert into public.ajustes_seguridad (clave, valor) values ('dos_pasos_en_base', false) on conflict (clave) do nothing");
    for (const x of lista) {
      await c.query(x.sql);
      await c.query("insert into supabase_migrations.schema_migrations (version, name) values ($1, $2)", [x.archivo.slice(0, 14), x.archivo.slice(15, -4)]);
      console.log(`${hora()} aplicada: ${x.archivo}`);
    }
    // Solo lectura, informativo: historias repetidas por organización (solo los números, sin cédulas ni nombres)
    const { rows: rep } = await c.query(`select numero_historia, count(*)::int as n from public.trabajadores
      where numero_historia is not null group by org_id, numero_historia having count(*) > 1 order by 1`);
    console.log(`${hora()} historias repetidas (solo informativo): ${rep.length}${rep.length ? " · " + rep.map((x) => `${x.numero_historia}×${x.n}`).join(", ") : ""}`);
    await c.query("commit");
    console.log(`${hora()} OK: ${lista.length} aplicada${lista.length === 1 ? "" : "s"} de ${etiqueta}`);
  }
} catch (e) {
  await c.query("rollback").catch(() => {});
  console.error(`${hora()} ERROR (no se cambió nada): ${e.message}`);
  process.exitCode = 1;
} finally {
  await c.end();
}
