// Guardián de seguridad de cada PR (auditoría A10). Corre gratis en el CI de Linux (repo público) y en local.
//   node scripts/guardian-seguridad.mjs cambios [rama-base]   → revisa lo que el PR agrega (sin base de datos)
//   node scripts/guardian-seguridad.mjs cruces [rama-base]    → números de migración/prueba que ya usa otro PR abierto
//   node scripts/guardian-seguridad.mjs catalogo              → arma una base con las migraciones, con los
//        permisos por defecto de Supabase (anon ejecuta toda función que no se le quite), y revisa el catálogo
//   node scripts/guardian-seguridad.mjs catalogo --actualizar → reescribe la línea base (solo con el visto bueno de Analizar)
// Errores: el PR no pasa. Avisos: se muestran y no frenan. Las reglas nacen de errores reales (ver cada una).
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const raiz = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const BASE = path.join(raiz, "supabase", "pruebas", "guardian-base.json");
const errores = [];
const avisos = [];
const error = (archivo, linea, texto) => errores.push({ archivo, linea, texto });
const aviso = (archivo, linea, texto) => avisos.push({ archivo, linea, texto });

const [modo = "cambios", ...resto] = process.argv.slice(2);

// ─── 1. Lo que el PR agrega ──────────────────────────────────────────────────────────────────────────
function git(...args) {
  const r = spawnSync("git", args, { cwd: raiz, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(`git ${args.join(" ")}: ${r.stderr}`);
  return r.stdout;
}

function revisarCambios(base) {
  const desde = git("merge-base", base, "HEAD").trim();
  const estados = git("diff", "--name-status", "--no-renames", desde, "HEAD").split("\n").filter(Boolean).map((l) => l.split("\t"));
  const enBase = new Set(git("ls-tree", "-r", "--name-only", desde, "supabase/migrations").split("\n").filter(Boolean));

  // Migraciones: una ya publicada no se edita ni se borra (producción no la vuelve a correr: el cambio nunca llega)
  for (const [estado, archivo] of estados) {
    if (archivo.startsWith("supabase/migrations/") && enBase.has(archivo) && estado !== "A")
      error(archivo, 1, "Migración ya existente en la rama base modificada o borrada: crea una migración nueva");
  }
  // Prefijos únicos y más nuevos que la última de la base (db push rechaza una más vieja que la última aplicada)
  const todas = fs.readdirSync(path.join(raiz, "supabase", "migrations")).filter((f) => f.endsWith(".sql"));
  const prefijo = (f) => f.split("_")[0];
  const vistos = new Map();
  for (const f of todas) vistos.set(prefijo(f), [...(vistos.get(prefijo(f)) ?? []), f]);
  for (const [p, fs_] of vistos) if (fs_.length > 1) error(`supabase/migrations/${fs_[1]}`, 1, `Prefijo de migración repetido ${p}: ${fs_.join(", ")}`);
  const ultimaBase = [...enBase].map((f) => prefijo(path.basename(f))).sort().pop() ?? "";
  for (const [estado, archivo] of estados) {
    if (estado === "A" && archivo.startsWith("supabase/migrations/") && prefijo(path.basename(archivo)) <= ultimaBase)
      error(archivo, 1, `Migración nueva más vieja que la última de la base (${ultimaBase}): ponle un número posterior`);
  }
  // Pruebas SQL: número único (correr.sh las ordena por número); las repetidas de antes quedan en la línea base
  const base_ = leerBase();
  const pruebas = fs.readdirSync(path.join(raiz, "supabase", "pruebas")).filter((f) => /^\d+_.*\.sql$/.test(f));
  const porNumero = new Map();
  for (const f of pruebas) porNumero.set(prefijo(f), [...(porNumero.get(prefijo(f)) ?? []), f]);
  for (const [n, fs_] of porNumero) if (fs_.length > 1 && !base_.pruebasRepetidas.includes(n)) error(`supabase/pruebas/${fs_[1]}`, 1, `Número de prueba repetido ${n}: ${fs_.join(", ")}`);

  // Línea por línea de lo agregado
  const diff = git("diff", "-U0", "--no-renames", desde, "HEAD");
  let archivo = "";
  let linea = 0;
  for (const l of diff.split("\n")) {
    if (l.startsWith("+++ ")) { archivo = l.slice(6); continue; }
    const h = /^@@ -\d+(?:,\d+)? \+(\d+)/.exec(l);
    if (h) { linea = Number(h[1]); continue; }
    if (!l.startsWith("+") || l.startsWith("+++")) { continue; }
    revisarLinea(archivo, linea, l.slice(1));
    linea += 1;
  }
}

const SECRETOS = [
  [/eyJ[A-Za-z0-9_-]{15,}\.eyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{10,}/, "un JWT (¿clave anon/service_role o token de sesión?)"],
  [/\bsb_secret_[A-Za-z0-9_-]{10,}/, "una clave secreta de Supabase"],
  [/-----BEGIN (?:RSA |EC |OPENSSH |)PRIVATE KEY-----/, "una llave privada"],
  [/\b(?:ghp|gho|ghs|github_pat)_[A-Za-z0-9_]{20,}/, "un token de GitHub"],
  [/\bAKIA[0-9A-Z]{16}\b/, "una llave de AWS/S3"],
  [/\bre_[A-Za-z0-9]{20,}\b|\bSG\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/, "una clave de servicio de correo"],
  [/postgres(?:ql)?:\/\/[^:\s/]+:(?!postgres@|\$\{|\$[A-Z_])[^@\s]{6,}@(?!127\.0\.0\.1|localhost)/, "una URL de base de datos con contraseña"],
];

function revisarLinea(archivo, n, texto) {
  if (/(^|\/)package-lock\.json$|\.(png|jpg|ico|woff2?)$/.test(archivo)) return;
  // Claves: en cualquier archivo (el repo es público: lo que entra queda en el historial para siempre)
  for (const [re, que] of SECRETOS) if (re.test(texto)) error(archivo, n, `Parece ${que}. Nunca va en el repo: usa un secreto del entorno`);

  if (archivo.startsWith("supabase/migrations/")) {
    const codigo = texto.replace(/--.*$/, "");
    // 28-oct: Supabase corre en UTC; current_date daba «mañana» de 20:00 a 24:00 en Caracas
    if (/\bcurrent_date\b|\bnow\(\)\s*::\s*date\b|\blocaltimestamp\b|\bcurrent_timestamp\s*::\s*date\b/i.test(codigo))
      error(archivo, n, "Fecha de negocio en UTC: usa public.hoy_caracas() o public.fecha_caracas(momento)");
    if (/at time zone\s+'UTC'/i.test(codigo)) aviso(archivo, n, "«at time zone 'UTC'» en una fecha de negocio: ¿no debería ser 'America/Caracas'?");
    // #41: los datos de salud del trabajador van con privilegio por columna; * o to_jsonb(t) los arrastra
    if (/to_jsonb\(\s*t\s*\)/.test(codigo) && /trabajadores/.test(codigo)) aviso(archivo, n, "to_jsonb() de una fila de trabajadores incluye grupo sanguíneo y discapacidad (#41)");
  }
  if (/^(src|escritorio\/puerta)\//.test(archivo)) {
    if (/from\(\s*["']trabajadores["']\s*\)\s*\.select\(\s*(["']\*["'])?\s*\)/.test(texto) || /trabajadores\?select=\*/.test(texto))
      error(archivo, n, "select * sobre trabajadores falla para quien no ve los datos de salud (#41): nombra las columnas");
    if (/trabajadores\s*\(\s*count\s*\)/.test(texto)) error(archivo, n, "trabajadores(count) exige SELECT de toda la tabla (#41): usa la RPC trabajadores_por_empresa");
    if (/dangerouslySetInnerHTML/.test(texto)) aviso(archivo, n, "dangerouslySetInnerHTML: confirma que el contenido no viene del usuario ni de la base");
    if (/service_role|SUPABASE_SERVICE_ROLE/.test(texto)) error(archivo, n, "La app no usa la llave service_role: todo pasa por la sesión del usuario y la RLS");
  }
  // El manual es para Cesar: nunca localhost (la app se usa desde Vercel o el programa de escritorio)
  if (archivo === "src/lib/manual.ts" && /localhost|127\.0\.0\.1/.test(texto)) error(archivo, n, "El manual no debe mandar a Cesar a localhost");
}

// ─── 2. El catálogo después de todas las migraciones ────────────────────────────────────────────────
function psql(db, sql, archivo) {
  const args = ["-v", "ON_ERROR_STOP=1", "-q", "-At", "-d", db, ...(archivo ? ["-1", "-f", archivo] : ["-c", sql])];
  const r = spawnSync("psql", args, { encoding: "utf8", env: { ...process.env, PGTZ: "America/Caracas" }, maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(`psql ${archivo ? path.basename(archivo) : sql.slice(0, 60)}: ${r.stderr}`);
  return r.stdout.split("\n").filter(Boolean);
}

function leerBase() {
  try { return JSON.parse(fs.readFileSync(BASE, "utf8")); } catch { return { anon: [], politicasPorFila: [], vistasDueño: [], pruebasRepetidas: [] }; }
}

// Funciones de alcance que consultan miembros: llamadas con columnas de la fila, corren UNA vez por fila
// (C14, 29-oct: un conteo de 4.200 pacientes tardaba 36 ms en vez de 1). Usar orgs_con/pares_limitados en (select …).
const POR_FILA = /\b(puede_ver_empresa|mi_rol|es_clinico|es_admin|es_empresa|es_servicio|puede_facturar|puede_enviar)\(\s*(org_id|[a-z_]+\.org_id)/;

function revisarCatalogo(actualizar) {
  const db = "zamorapp_guardian";
  psql("postgres", `drop database if exists ${db}`);
  psql("postgres", `create database ${db}`);
  psql(db, null, path.join(raiz, "supabase", "pruebas", "00_stubs_supabase.sql"));
  // Como en Supabase: toda función nueva del esquema public la ejecutan anon y authenticated si no se revoca
  psql(db, "alter default privileges in schema public grant execute on functions to anon, authenticated");
  for (const f of fs.readdirSync(path.join(raiz, "supabase", "migrations")).filter((f) => f.endsWith(".sql")).sort())
    psql(db, null, path.join(raiz, "supabase", "migrations", f));

  const esquemas = "('public', 'clinico', 'sync')";
  // a) security definer sin search_path fijo: cualquiera con permiso de crear objetos podría secuestrarla
  for (const f of psql(db, `select n.nspname || '.' || p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname in ${esquemas} and p.prosecdef and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')`))
    error("supabase/migrations", 1, `${f}: security definer sin «set search_path»`);
  // b) tablas sin RLS: Supabase da todos los permisos de tabla a anon y authenticated
  for (const t of psql(db, `select n.nspname || '.' || c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname in ('public', 'clinico') and c.relkind in ('r', 'p') and not c.relrowsecurity`))
    error("supabase/migrations", 1, `${t}: tabla sin «enable row level security»`);
  // c) funciones que puede llamar un anónimo (sin sesión): solo las de la línea base (ingreso, enlaces, invitaciones…)
  const anon = psql(db, `select n.nspname || '.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname in ('public', 'clinico') and p.prorettype <> 'trigger'::regtype and has_function_privilege('anon', p.oid, 'execute') order by 1`);
  // d) políticas que llaman funciones de alcance por cada fila al LEER (USING): el WITH CHECK de un INSERT corre una vez por fila escrita y no pesa
  const porFila = psql(db, `select schemaname || '.' || tablename || ' ' || policyname || E'\\t' || replace(coalesce(qual, ''), E'\\n', ' ') from pg_policies
      where schemaname in ('public', 'clinico') order by 1`).map((l) => l.split("\t")).filter(([, q]) => POR_FILA.test(q.replace(/\(\s*select[^)]*\)/g, ""))).map(([n]) => n);
  // e) vistas con permisos del dueño (no aplican la RLS de quien consulta): deben filtrar ellas mismas
  const vistas = psql(db, `select n.nspname || '.' || c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname in ('public', 'clinico') and c.relkind = 'v' and not coalesce(c.reloptions::text[] @> '{security_invoker=true}', false) order by 1`);
  psql("postgres", `drop database if exists ${db}`);

  const base = leerBase();
  if (actualizar) {
    fs.writeFileSync(BASE, JSON.stringify({ ...base, anon, politicasPorFila: porFila, vistasDueño: vistas }, null, 2) + "\n");
    console.log(`Línea base actualizada: ${anon.length} funciones para anon, ${porFila.length} políticas por fila, ${vistas.length} vistas del dueño`);
    return;
  }
  for (const f of anon.filter((f) => !base.anon.includes(f)))
    error("supabase/migrations", 1, `${f}: la ejecuta un anónimo. Agrega «revoke execute on function … from public, anon» (o, si de verdad es pública, súmala a la línea base con el visto bueno de Analizar)`);
  for (const p of porFila.filter((p) => !base.politicasPorFila.includes(p)))
    error("supabase/migrations", 1, `${p}: la política llama una función de alcance por cada fila (lento, C14). Usa org_id = any ((select public.orgs_con(…))::uuid[]) o pares_limitados()`);
  for (const v of vistas.filter((v) => !base.vistasDueño.includes(v)))
    aviso("supabase/migrations", 1, `${v}: vista con permisos del dueño (sin security_invoker): confirma que filtra por el usuario`);
  const menos = base.anon.filter((f) => !anon.includes(f)).length + base.politicasPorFila.filter((p) => !porFila.includes(p)).length;
  if (menos) aviso("supabase/pruebas/guardian-base.json", 1, `${menos} entradas de la línea base ya se corrigieron: actualízala con «catalogo --actualizar»`);
}

// ─── 3. Números que ya usa otro PR abierto ───────────────────────────────────────────────────────────
// Dos PRs abiertos con la misma migración o la misma prueba chocan al fusionar el segundo (y db push rechaza
// una migración más vieja que la última aplicada). Frena al PR más nuevo; al más viejo solo le avisa.
// Se consulta la API de GitHub con el GITHUB_TOKEN de solo lectura del flujo.
async function revisarCruces(base) {
  const desde = git("merge-base", base, "HEAD").trim();
  const propios = git("diff", "--name-only", "--diff-filter=A", "--no-renames", desde, "HEAD").split("\n").filter(Boolean);
  // Cada archivo va con su blob: el mismo archivo idéntico en dos PRs (el PR «solo migración» y la tanda que trae
  // su código) no es un choque, es la misma migración; solo choca un número igual con contenido distinto.
  const numeros = (archivos) => archivos.flatMap((x) => {
    const f = typeof x === "string" ? x : x.nombre;
    const m = /^supabase\/migrations\/(\d{14})_/.exec(f) ?? /^supabase\/pruebas\/(\d+)_[^/]*\.sql$/.exec(f);
    return m ? [{ clave: `${f.startsWith("supabase/migrations/") ? "migración" : "prueba"} ${m[1]}`, archivo: f, blob: typeof x === "string" ? null : x.blob }] : [];
  });
  const mios = numeros(propios.map((f) => ({ nombre: f, blob: git("rev-parse", `HEAD:${f}`).trim() })));
  if (!mios.length) return;
  const yo = Number(process.env.PR_NUMERO || 0);
  const otros = await prsAbiertos(yo);
  for (const pr of otros) {
    const suyos = numeros(pr.archivos);
    const choca = (m) => suyos.some((s) => s.clave === m.clave && !(s.archivo === m.archivo && s.blob && s.blob === m.blob));
    for (const m of mios.filter(choca)) {
      const texto = `La ${m.clave} ya la usa el PR #${pr.numero} (${pr.rama}). Reserva otro número en el registro de numeración`;
      if (!yo || pr.numero < yo) error(m.archivo, 1, `${texto}: este PR es el más nuevo y debe cambiarlo`);
      else aviso(m.archivo, 1, `${texto}: el #${pr.numero} es más nuevo y es el que debe cambiar`);
    }
  }
}

async function prsAbiertos(yo) {
  // Para probar sin red: GUARDIAN_PRS=archivo.json con [{ numero, rama, archivos: [...] }]
  if (process.env.GUARDIAN_PRS) return JSON.parse(fs.readFileSync(process.env.GUARDIAN_PRS, "utf8")).filter((p) => p.numero !== yo);
  const repo = process.env.GITHUB_REPOSITORY;
  const token = process.env.GITHUB_TOKEN;
  if (!repo || !token) { aviso("supabase/migrations", 1, "Sin GITHUB_TOKEN no se revisaron los números de los otros PRs abiertos"); return []; }
  const api = async (ruta) => {
    const r = await fetch(`https://api.github.com/repos/${repo}${ruta}`, { headers: { authorization: `Bearer ${token}`, accept: "application/vnd.github+json" } });
    if (!r.ok) throw new Error(`GitHub ${ruta}: ${r.status}`);
    return r.json();
  };
  const salida = [];
  for (const pr of (await api("/pulls?state=open&per_page=100")).filter((p) => p.number !== yo)) {
    const archivos = [];
    for (let pagina = 1; pagina <= 10; pagina++) {
      const lote = await api(`/pulls/${pr.number}/files?per_page=100&page=${pagina}`);
      archivos.push(...lote.filter((f) => f.status === "added" || f.status === "renamed").map((f) => ({ nombre: f.filename, blob: f.sha })));
      if (lote.length < 100) break;
    }
    salida.push({ numero: pr.number, rama: pr.head.ref, archivos });
  }
  return salida;
}

function informar() {
  const enCI = Boolean(process.env.GITHUB_ACTIONS);
  for (const [lista, tipo] of [[avisos, "warning"], [errores, "error"]])
    for (const e of lista) console.log(enCI ? `::${tipo} file=${e.archivo},line=${e.linea}::${e.texto}` : `${tipo === "error" ? "ERROR" : "aviso"} ${e.archivo}:${e.linea} ${e.texto}`);
  const resumen = `Guardián de seguridad (${modo}): ${errores.length} errores, ${avisos.length} avisos`;
  console.log(resumen);
  if (enCI && process.env.GITHUB_STEP_SUMMARY)
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### ${resumen}\n${[...errores, ...avisos].map((e) => `- ${errores.includes(e) ? "❌" : "⚠️"} \`${e.archivo}\` ${e.texto}`).join("\n")}\n`);
  if (errores.length) process.exitCode = 1;
}

if (modo === "cambios") revisarCambios(resto.find((a) => !a.startsWith("--")) ?? "origin/main");
else if (modo === "cruces") await revisarCruces(resto.find((a) => !a.startsWith("--")) ?? "origin/main");
else if (modo === "catalogo") revisarCatalogo(resto.includes("--actualizar"));
else throw new Error(`Modo desconocido: ${modo} (usa «cambios», «cruces» o «catalogo»)`);
informar();
