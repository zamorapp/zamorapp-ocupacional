// Cuadre de los reportes de zamorApp con el SAME (base Integral). Solo lectura en los dos lados.
// Uso en la PC de Cesar (la misma DATABASE_URL del respaldo):
//   node scripts/cuadre-same/cuadre.mjs [desde AAAA-MM-DD] [hasta AAAA-MM-DD]
// Por defecto: del 2015-01-01 al 2026-10-24 (el día antes de cargar el SAME en zamorApp: desde entonces
// las consultas nuevas solo existen en un lado y no son diferencias).
//
// SAME: cada cifra es UNA consulta pequeña (conteos agrupados por mes, sin nombres ni datos clínicos),
// una a la vez, WITH (NOLOCK) para no bloquear al SAME, y solo si la PC tiene al menos 1 GB libre
// (el 27-oct el SAME se cayó por falta de memoria). Nunca cambia nada en SQL Server.
// zamorApp: transacción de solo lectura, con los permisos del administrador, llamando a las MISMAS
// funciones que usan los reportes en pantalla, PDF y Excel.
//
// Escribe cuadre-same-<fecha>.md en %USERPROFILE%\.zamorapp\ (solo cifras: se puede compartir).
// Pruebas sin la PC: --sin-same (solo zamorApp) o --same <archivo.json> (cifras del SAME ya leídas).
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import pg from "pg";
import { configuracion } from "../conexion-segura.mjs";

const args = process.argv.slice(2);
const opcion = (n) => { const i = args.indexOf(n); return i >= 0 ? args.splice(i, 2)[1] ?? true : null; };
const archivoSame = opcion("--same");
const sinSame = args.includes("--sin-same") ? (args.splice(args.indexOf("--sin-same"), 1), true) : false;
const salida = opcion("--salida") ?? path.join(os.homedir(), ".zamorapp");
const [desde = "2015-01-01", hasta = "2026-10-24"] = args;
for (const f of [desde, hasta]) if (!/^\d{4}-\d{2}-\d{2}$/.test(f)) throw new Error(`Fecha inválida: ${f} (use AAAA-MM-DD)`);

// Mismas equivalencias que usó la carga (scripts/importar-integral/cargar.mjs)
const MOTIVO = { PreEmpleo: "PRE", Periodico: "PER", PreVacacional: "PREV", PostVacacional: "POSV", Egreso: "EGR", PostReposo: "REI", ReinsercionPerm: "RIN",
  ReinsercionTemp: "RIN", ReubicacionTemp: "REU", PreNatal: "PRN", PostNatal: "PSN", ConsultaGral: "MOR", AccLaboral: "ACL", AccComun: "ACC", Emergencia: "EME",
  Telemedicina: "TEL", ConfReposo: "CRE", ConsultaEspe: "ESP", ConsultaExterna: "EXT", EvalEspeciales: "EVE" };
const APTITUD = { Elegible: "elegible", ElegibleRest: "elegible_con_restricciones", NoElegible: "no_elegible", EspResultado: "espera_resultados", Diferido: "diferido" };

// ─── Las cifras ─────────────────────────────────────────────
// Cada una: SAME (T-SQL que devuelve mes|clave|valor) y zamorApp (SQL que devuelve mes, clave, valor).
// $1 = desde, $2 = hasta. En el SAME las fechas van escritas (ya validadas arriba).
const MES = "convert(char(7), c.fecha, 126)";
const RANGO = `c.fecha >= '${desde}' and c.fecha < dateadd(day, 1, '${hasta}')`;
const filas = (tipo, opciones = "{}") => `jsonb_array_elements(public.reporte_listado('${tipo}', null, $1::date, $2::date, '${opciones}'::jsonb)) x`;
const mesDe = (campo) => `left(x ->> '${campo}', 7)`;

const CIFRAS = [
  { clave: "atendidos", reportes: "Relación de atendidos (resumen y detalle), Padrón por consultas",
    titulo: "Consultas atendidas",
    same: `select ${MES}, '', count(*) from Integral.consulta c with (nolock) where ${RANGO} group by ${MES}`,
    zam: `select ${mesDe("fecha")}, '', count(*) from ${filas("atendidos")} group by 1` },
  { clave: "pacientes_mes", reportes: "Relación de atendidos, Estadística médica",
    titulo: "Pacientes distintos atendidos en el mes",
    same: `select ${MES}, '', count(distinct c.cod_paciente) from Integral.consulta c with (nolock) where ${RANGO} group by ${MES}`,
    zam: `select ${mesDe("fecha")}, '', count(distinct x ->> 'cedula') from ${filas("atendidos")} group by 1` },
  { clave: "motivo", reportes: "Estadística médica (por motivo)",
    titulo: "Consultas por motivo",
    same: `select ${MES}, isnull(c.codmotivcons, ''), count(*) from Integral.consulta c with (nolock) where ${RANGO} group by ${MES}, c.codmotivcons`,
    mapa: (k) => MOTIVO[k] ?? (k || "Sin motivo"),
    zam: `select ${mesDe("fecha")}, coalesce(li.codigo, x ->> 'motivo', 'Sin motivo'), count(*) from ${filas("atendidos")}
          left join lateral (select codigo from public.lista_items where lista = 'motivo_consulta' and nombre = x ->> 'motivo' order by activo desc limit 1) li on true group by 1, 2` },
  { clave: "medicos", reportes: "Producción por médico", multiconjunto: true,
    titulo: "Consultas por médico (se comparan las cantidades: los nombres de usuario del SAME no son los de zamorApp)",
    same: `select 'total', isnull(c.cod_usrcreacion, ''), count(*) from Integral.consulta c with (nolock) where ${RANGO} group by c.cod_usrcreacion`,
    zam: `select 'total', x ->> 'medico', sum((x ->> 'consultas')::int) from jsonb_array_elements(public.reporte_listado('estadistica', null, $1::date, $2::date)) x group by 2` },
  { clave: "diagnosticos", reportes: "Diagnósticos, Morbilidad CIE-10",
    titulo: "Diagnósticos emitidos",
    same: `select ${MES}, '', count(*) from Integral.consultadiagnostico d with (nolock) join Integral.consulta c with (nolock) on c.codigo = d.cod_consulta where ${RANGO} group by ${MES}`,
    zam: `select ${mesDe("fecha")}, '', count(*) from ${filas("diagnosticos")} group by 1` },
  { clave: "morbilidad", reportes: "Morbilidad CIE-10 (total de casos)",
    titulo: "Casos de morbilidad en todo el período (debe igualar a los diagnósticos)",
    same: `select 'total', '', count(*) from Integral.consultadiagnostico d with (nolock) join Integral.consulta c with (nolock) on c.codigo = d.cod_consulta where ${RANGO}`,
    zam: `select 'total', '', coalesce(sum((x ->> 'casos')::int), 0) from ${filas("morbilidad")}` },
  { clave: "aptitud", reportes: "Aptitud emitida (constancias)",
    titulo: "Constancias de aptitud por clasificación",
    same: `select ${MES}, c.codaptitud, count(*) from Integral.consulta c with (nolock) where ${RANGO} and c.codaptitud in (${Object.keys(APTITUD).map((k) => `'${k}'`).join(", ")}) group by ${MES}, c.codaptitud`,
    mapa: (k) => APTITUD[k] ?? k,
    zam: `select ${mesDe("fecha")}, x ->> 'aptitud', count(*) from ${filas("aptitud")} group by 1, 2` },
  { clave: "limitaciones", reportes: "Limitaciones",
    titulo: "Consultas con limitaciones",
    same: `select ${MES}, '', count(distinct lb.cod_consulta) from Integral.limitacionLab lb with (nolock) join Integral.limitaciones l with (nolock) on l.cod_limitacionlab = lb.codigo
           join Integral.consulta c with (nolock) on c.codigo = lb.cod_consulta where ${RANGO} group by ${MES}`,
    zam: `select ${mesDe("fecha")}, '', count(*) from ${filas("limitaciones")} group by 1` },
  { clave: "reposos", reportes: "Reposos",
    titulo: "Reposos que empiezan en el mes",
    same: `select convert(char(7), c.fechareposodesde, 126), '', count(*) from Integral.consulta c with (nolock)
           where c.reposo = '1' and c.fechareposodesde >= '${desde}' and c.fechareposodesde < dateadd(day, 1, '${hasta}') and c.fechareposohasta is not null group by convert(char(7), c.fechareposodesde, 126)`,
    zam: `select ${mesDe("desde")}, '', count(*) from ${filas("reposos", '{"solo_iniciados":true}')} group by 1` },
  { clave: "dias_reposo", reportes: "Reposos (días)",
    titulo: "Días de reposo de los reposos que empiezan en el mes",
    same: `select convert(char(7), c.fechareposodesde, 126), '', sum(datediff(day, c.fechareposodesde, c.fechareposohasta) + 1) from Integral.consulta c with (nolock)
           where c.reposo = '1' and c.fechareposodesde >= '${desde}' and c.fechareposodesde < dateadd(day, 1, '${hasta}') and c.fechareposohasta >= c.fechareposodesde group by convert(char(7), c.fechareposodesde, 126)`,
    zam: `select ${mesDe("desde")}, '', sum((x ->> 'dias')::int) from ${filas("reposos", '{"solo_iniciados":true}')} group by 1` },
  { clave: "interconsultas", reportes: "Interconsultas",
    titulo: "Referencias a especialistas",
    same: `select ${MES}, '', count(*) from Integral.ordenreferencia r with (nolock) join Integral.consulta c with (nolock) on c.codigo = r.cod_consulta where ${RANGO} group by ${MES}`,
    zam: `select ${mesDe("fecha")}, '', count(*) from ${filas("interconsultas")} group by 1` },
  { clave: "examenes", reportes: "Exámenes aplicados",
    titulo: "Exámenes registrados en consultas",
    same: `select ${MES}, '', count(*) from Integral.consultaexamen ce with (nolock) join Integral.consulta c with (nolock) on c.codigo = ce.cod_consulta where ${RANGO} group by ${MES}`,
    zam: `select ${mesDe("fecha")}, '', count(*) from ${filas("examenes")} group by 1` },
  { clave: "accidentes", reportes: "Accidentabilidad (COVENIN 474)",
    titulo: "Accidentes por mes",
    same: `select convert(char(7), a.fecha, 126), '', count(*) from Integral.accidentelab a with (nolock) join Integral.consulta c with (nolock) on c.codigo = a.cod_consulta
           where a.fecha >= '${desde}' and a.fecha < dateadd(day, 1, '${hasta}') group by convert(char(7), a.fecha, 126)`,
    zam: `select left(x ->> 'mes', 7), '', sum((x ->> 'accidentes')::int) from jsonb_array_elements(public.reporte_indicadores('accidentalidad', null, $1::date, $2::date, '{"nivel":"consolidado"}'::jsonb)) x group by 1 having sum((x ->> 'accidentes')::int) > 0` },
  { clave: "padron", reportes: "Padrón de pacientes",
    titulo: "Pacientes registrados (todos, sin importar el período)",
    same: `select 'total', '', count(*) from Integral.paciente with (nolock)`,
    zam: `select 'total', '', count(*) from ${filas("pacientes")}` },
];

// Reportes sin cifra equivalente en el SAME: se explican en el informe
const SIN_EQUIVALENTE = [
  ["Citas", "El SAME no guardaba agenda de citas: el reporte solo tiene datos desde que se usa zamorApp."],
  ["Declaración obligatoria", "Usa la lista editable de diagnósticos declarables de zamorApp; el SAME no la tenía."],
  ["Potencial discapacidad", "Combina reposo acumulado, última aptitud, diagnósticos ocupacionales y la marca del médico; se revisa con Cesar caso por caso, no por cifra."],
  ["Vencimientos", "Depende de la periodicidad de examen por empresa, que el SAME no tenía."],
];

// ─── SAME ───────────────────────────────────────────────────
const UN_GB = 1024 ** 3;
async function memoriaLibre() {
  for (let intento = 1; intento <= 3; intento++) {
    if (os.freemem() >= UN_GB) return;
    console.log(`Memoria libre ${(os.freemem() / UN_GB).toFixed(2)} GB (< 1 GB). Espero 30 s antes de leer el SAME (intento ${intento}/3)…`);
    await new Promise((r) => setTimeout(r, 30_000));
  }
  throw new Error("La PC no tiene 1 GB libre: no se lee el SAME para no tumbarlo. Cierre programas y vuelva a correr.");
}

async function leerSame(sql) {
  await memoriaLibre();
  const texto = execFileSync("sqlcmd", ["-S", ".", "-E", "-d", "Integral", "-W", "-h", "-1", "-s", "|", "-b", "-Q",
    `SET NOCOUNT ON; SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED; ${sql.replace(/\s+/g, " ")}`], { encoding: "utf8", timeout: 120_000 });
  return texto.split(/\r?\n/).filter((l) => l.includes("|")).map((l) => { const [mes, clave, valor] = l.split("|").map((x) => x.trim()); return [mes, clave === "NULL" ? "" : clave, Number(valor) || 0]; });
}

// ─── zamorApp ───────────────────────────────────────────────
async function leerZamorapp() {
  const c = new pg.Client({ ...configuracion(process.env.DATABASE_URL), connectionTimeoutMillis: 30_000 });
  await c.connect();
  const datos = {};
  try {
    await c.query("begin read only");
    const { rows } = await c.query("select usuario_id from public.miembros where rol = 'administrador' and acceso_clinico order by creado_en limit 1");
    if (!rows.length) throw new Error("No hay un administrador con acceso clínico en zamorApp");
    await c.query("select set_config('request.jwt.claim.sub', $1, true)", [rows[0].usuario_id]);
    await c.query("set local role authenticated");
    for (const cifra of CIFRAS) {
      const r = await c.query({ text: cifra.zam, values: [desde, hasta], rowMode: "array" });
      datos[cifra.clave] = r.rows.map(([mes, clave, valor]) => [mes ?? "", clave ?? "", Number(valor) || 0]);
    }
  } finally {
    await c.query("rollback").catch(() => {});
    await c.end();
  }
  return datos;
}

// ─── Comparación ────────────────────────────────────────────
const sumar = (filas, mapa = (k) => k) => {
  const m = new Map();
  for (const [mes, clave, valor] of filas) { const k = `${mes}|${mapa(clave)}`; m.set(k, (m.get(k) ?? 0) + valor); }
  return m;
};
const total = (m) => [...m.values()].reduce((s, v) => s + v, 0);
const n = (x) => x.toLocaleString("es-VE");

function comparar(cifra, same, zam) {
  if (cifra.multiconjunto) {
    const a = same.map((f) => f[2]).sort((x, y) => y - x), b = zam.map((f) => f[2]).sort((x, y) => y - x);
    const iguales = a.length === b.length && a.every((v, i) => v === b[i]);
    return { same: a.reduce((s, v) => s + v, 0), zam: b.reduce((s, v) => s + v, 0), iguales, detalle: iguales ? [] : [`SAME por usuario: ${a.join(", ")}`, `zamorApp por médico: ${b.join(", ")}`] };
  }
  const ms = sumar(same, cifra.mapa), mz = sumar(zam);
  const claves = [...new Set([...ms.keys(), ...mz.keys()])].sort();
  const distintas = claves.filter((k) => (ms.get(k) ?? 0) !== (mz.get(k) ?? 0));
  return { same: total(ms), zam: total(mz), iguales: distintas.length === 0,
    detalle: distintas.slice(0, 24).map((k) => { const [mes, clave] = k.split("|"); return `${mes}${clave ? ` · ${clave}` : ""}: SAME ${n(ms.get(k) ?? 0)}, zamorApp ${n(mz.get(k) ?? 0)}`; })
      .concat(distintas.length > 24 ? [`… y ${distintas.length - 24} diferencias más`] : []) };
}

async function principal() {
  if (!process.env.DATABASE_URL) throw new Error("Falta DATABASE_URL (la misma del respaldo)");
  console.log(`Cuadre del ${desde} al ${hasta}`);
  const zam = await leerZamorapp();
  console.log("zamorApp leído.");
  let same = {};
  if (archivoSame) same = JSON.parse(fs.readFileSync(archivoSame, "utf8"));
  else if (!sinSame) {
    for (const cifra of CIFRAS) {
      process.stdout.write(`SAME: ${cifra.titulo}… `);
      same[cifra.clave] = await leerSame(cifra.same);
      console.log("listo");
    }
    fs.mkdirSync(salida, { recursive: true });
    fs.writeFileSync(path.join(salida, `cuadre-same-cifras-${hasta}.json`), JSON.stringify(same));
  }

  const lineas = [`# Cuadre de reportes: zamorApp frente al SAME`, "",
    `Período: del ${desde} al ${hasta}. Generado el ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC.`,
    "Solo cifras (conteos por mes); sin nombres ni datos clínicos.", "",
    "| Cifra | Reportes que la usan | SAME | zamorApp | Resultado |", "|---|---|---:|---:|---|"];
  const detalles = [];
  let iguales = 0;
  for (const cifra of CIFRAS) {
    if (!same[cifra.clave]) { lineas.push(`| ${cifra.titulo} | ${cifra.reportes} | — | ${n(total(sumar(zam[cifra.clave] ?? [])))} | Sin leer el SAME |`); continue; }
    const r = comparar(cifra, same[cifra.clave], zam[cifra.clave] ?? []);
    if (r.iguales) iguales++;
    lineas.push(`| ${cifra.titulo} | ${cifra.reportes} | ${n(r.same)} | ${n(r.zam)} | ${r.iguales ? "✅ Cuadra" : r.zam === r.same ? "⚠️ Mismo total, distinto reparto" : `⚠️ ${r.zam > r.same ? "+" : ""}${n(r.zam - r.same)}`} |`);
    if (!r.iguales) detalles.push(`### ${cifra.titulo}`, "", ...r.detalle.map((d) => `- ${d}`), "");
  }
  lineas.push("", `**${iguales} de ${CIFRAS.length} cifras cuadran.**`, "");
  if (detalles.length) lineas.push("## Dónde no cuadra (por mes)", "", ...detalles);
  lineas.push("## Reportes sin cifra equivalente en el SAME", "", ...SIN_EQUIVALENTE.map(([r, d]) => `- **${r}:** ${d}`), "");

  fs.mkdirSync(salida, { recursive: true });
  const archivo = path.join(salida, `cuadre-same-${hasta}.md`);
  fs.writeFileSync(archivo, lineas.join("\n"));
  console.log(`Informe: ${archivo}`);
}

principal().catch((e) => { console.error(e.message); process.exit(1); });
