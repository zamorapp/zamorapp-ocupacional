// Aplica en Supabase las migraciones aprobadas que la base aún no tiene, bajándolas de la última etiqueta
// «migraciones-AAAAMMDD-N» del repo. Verifica el SHA-256 de cada archivo contra el manifiesto de esa etiqueta,
// muestra la lista y pide «S» antes de tocar nada. Todo dentro de UNA transacción: o todas o ninguna.
// No toca el SAME. El registro no lleva cédulas ni nombres.
import path from "node:path";
import readline from "node:readline/promises";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";
import { MANIFIESTO, leerManifiesto, lineaBase, pendientes, refsDeLsRemote, resumen, respuestaSi, revisarOrden, ultimaEtiqueta, verificar } from "./aprobadas.mjs";

const REPO_GITHUB = "zamorapp/zamorapp-ocupacional";
const repo = process.cwd();
const pg = createRequire(path.join(repo, "package.json"))("pg");
const { configuracion } = await import(pathToFileURL(path.join(repo, "scripts", "conexion-segura.mjs")).href);
const hora = () => new Date().toISOString();

// git del sistema (el aplicador corre en Documents\zamorapp-ocupacional): la etiqueta y «está en main» salen de git, no
// de la API de GitHub, que sin cuenta permite 60 consultas por hora por IP y con ProtonVPN se agota (403 del 31-oct)
const git = (...args) => execFileSync("git", args, { cwd: repo, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 120000 });
const URL_REPO = `https://github.com/${REPO_GITHUB}.git`;

// Con token (GITHUB_TOKEN o la sesión de gh) el límite sube a 5000/h; si no hay, va sin cuenta
let token = process.env.GITHUB_TOKEN || "";
if (!token) try { token = execFileSync("gh", ["auth", "token"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 15000 }).trim(); } catch { /* sin gh */ }

async function bajar(url, tipo = "text") {
  for (let intento = 1; ; intento++) {
    const cabeceras = { "User-Agent": "zamorapp-aplicar-migraciones" };
    if (token && url.startsWith("https://api.github.com/")) cabeceras.Authorization = `Bearer ${token}`;
    const r = await fetch(url, { headers: cabeceras });
    if (r.ok) return tipo === "json" ? r.json() : r.text();
    // Límite de GitHub: espera lo que pide (hasta 1 minuto) y reintenta 3 veces; si no, dice a qué hora volver
    if ((r.status === 403 || r.status === 429) && intento <= 3) {
      const reset = Number(r.headers.get("x-ratelimit-reset")) * 1000;
      const espera = Math.min(60000, Number(r.headers.get("retry-after")) * 1000 || (reset ? Math.max(5000, reset - Date.now()) : 15000));
      console.log(`${hora()} GitHub limitó las consultas (HTTP ${r.status}); reintento en ${Math.round(espera / 1000)} s…`);
      await new Promise((ok) => setTimeout(ok, espera));
      continue;
    }
    const reset = Number(r.headers.get("x-ratelimit-reset"));
    const cuando = reset ? `; intenta otra vez después de las ${new Date(reset * 1000).toLocaleTimeString("es-VE", { hour: "2-digit", minute: "2-digit" })}` : "";
    throw new Error(`no se pudo bajar ${url} (HTTP ${r.status}${r.status === 403 || r.status === 429 ? ", GitHub limitó las consultas" + cuando : ""})`);
  }
}

// Cualquier error antes de conectar (red, etiqueta, manifiesto) sale con un mensaje claro: no se cambió nada
const fallar = (e) => { console.error(`${hora()} ERROR (no se cambió nada): ${e.message}`); process.exit(1); };
process.on("uncaughtException", fallar);
process.on("unhandledRejection", fallar);

// La etiqueta se resuelve a su commit y todo se baja de ese commit: no cambia entre un archivo y otro.
// Ese commit tiene que estar en main (revisado y unido): una etiqueta sobre una rama suelta no vale.
const API = `https://api.github.com/repos/${REPO_GITHUB}`;
const refs = refsDeLsRemote(git("ls-remote", "--tags", URL_REPO, "refs/tags/migraciones-*"));
const etiqueta = ultimaEtiqueta(refs.map((r) => r.nombre));
if (!etiqueta) throw new Error("no hay ninguna etiqueta de migraciones aprobadas en el repo");
const commit = refs.find((r) => r.nombre === etiqueta).sha;
if (!/^[0-9a-f]{40}$/.test(commit ?? "")) throw new Error(`la etiqueta ${etiqueta} no apunta a un commit`);
// main de GitHub (no la copia local) tiene que contener ese commit; se baja a FETCH_HEAD sin tocar las ramas de la PC
git("fetch", "--quiet", "--no-tags", URL_REPO, "main");
let enMain = false;
try { git("merge-base", "--is-ancestor", commit, "FETCH_HEAD"); enMain = true; } catch { /* no es ancestro o no está */ }
if (!enMain) throw new Error(`la etiqueta ${etiqueta} (${commit.slice(0, 7)}) no está en main: no se aplica nada que no esté revisado y unido`);
const crudo = (ruta) => `https://raw.githubusercontent.com/${REPO_GITHUB}/${commit}/${ruta}`;
const manifiesto = leerManifiesto(await bajar(crudo(MANIFIESTO)), etiqueta);
console.log(`${hora()} fuente aprobada: ${etiqueta} (${commit.slice(0, 7)}), ${manifiesto.migraciones.length} migraciones en el manifiesto`);

const c = new pg.Client(configuracion(process.env.DATABASE_URL));
await c.connect();
try {
  // Registro de lo aplicado: sin él no se sabe qué falta y se volvería a aplicar todo (pasó el 30-oct con la 410000)
  const { rows: [t] } = await c.query("select to_regclass('supabase_migrations.schema_migrations') is not null as hay");
  const { rows: ya } = t.hay ? await c.query("select version from supabase_migrations.schema_migrations") : { rows: [] };
  let base = [];
  if (ya.length === 0) {
    const nombres = (await bajar(`${API}/contents/supabase/migrations?ref=${commit}`, "json")).map((f) => f.name);
    base = lineaBase(nombres, manifiesto);
    console.log(`${hora()} primera vez: el registro está vacío; con el corte ${manifiesto.linea_base_hasta} se anotarán ${base.length} cambios anteriores como ya hechos, sin ejecutarlos:`);
    console.log(base.map((x) => `    ${x.version} ${x.nombre}`).join("\n"));
  }
  const aplicadas = [...ya.map((r) => r.version), ...base.map((x) => x.version)];
  const lista = pendientes(manifiesto, aplicadas);
  revisarOrden(lista, aplicadas);
  console.log(`\n${resumen(lista)}\n`);
  if (lista.length === 0 && base.length === 0) { console.log(`${hora()} OK (nada que hacer)`); process.exit(0); }

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
    // Mismo formato que la CLI de Supabase, para que «supabase db push» también vea lo aplicado
    await c.query("create schema if not exists supabase_migrations");
    await c.query("create table if not exists supabase_migrations.schema_migrations (version text primary key, statements text[], name text)");
    for (const x of base) await c.query("insert into supabase_migrations.schema_migrations (version, name) values ($1, $2) on conflict (version) do nothing", [x.version, x.nombre]);
    for (const x of lista) {
      await c.query(x.sql);
      await c.query("insert into supabase_migrations.schema_migrations (version, name) values ($1, $2)", [x.archivo.slice(0, 14), x.archivo.slice(15, -4)]);
      console.log(`${hora()} aplicada: ${x.archivo}`);
    }
    // Solo lectura, informativo: historias repetidas por organización (solo los números, sin cédulas ni nombres)
    const { rows: rep } = await c.query(`select numero_historia, count(*)::int as n from public.trabajadores
      where numero_historia is not null group by org_id, numero_historia having count(*) > 1 order by 1`);
    console.log(`${hora()} historias repetidas (solo informativo): ${rep.length}${rep.length ? " · " + rep.map((x) => `${x.numero_historia}×${x.n}`).join(", ") : ""}`);
    const { rows: [k] } = await c.query("select count(*)::int as n from supabase_migrations.schema_migrations where version = any($1)", [lista.map((x) => x.archivo.slice(0, 14))]);
    if (k.n !== lista.length) throw new Error(`solo ${k.n} de ${lista.length} quedaron anotadas en el registro (no se aplicó nada)`);
    await c.query("commit");
    console.log(`${hora()} OK: ${lista.length} aplicada${lista.length === 1 ? "" : "s"} de ${etiqueta}${base.length ? `; ${base.length} anteriores anotadas` : ""}`);
  }
} catch (e) {
  await c.query("rollback").catch(() => {});
  console.error(`${hora()} ERROR (no se cambió nada): ${e.message}`);
  process.exitCode = 1;
} finally {
  await c.end();
}
