// Diagnóstico de las 4 cifras que no cuadraron en el cuadre B4 (29-oct): exámenes, limitaciones, consultas por médico y
// padrón. Solo lectura en los dos lados, con las mismas reglas que cuadre.mjs:
// - SAME: 7 consultas pequeñas de conteos, una a la vez, WITH (NOLOCK), READ UNCOMMITTED, 120 s, solo con 1 GB libre.
//   Nunca cambia nada en SQL Server.
// - zamorApp: transacción de solo lectura.
// Uso en la PC de Cesar: powershell -File scripts\cuadre-same\diagnostico.ps1 (toma la clave guardada del respaldo).
// Escribe %USERPROFILE%\.zamorapp\diagnostico-cuadre-<hasta>.md: solo cifras, sin nombres (los usuarios del SAME van
// como «usuario 1, 2, 3»).
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import pg from "pg";
import { configuracion } from "../conexion-segura.mjs";

const [desde = "2015-01-01", hasta = "2026-10-24"] = process.argv.slice(2);
for (const f of [desde, hasta]) if (!/^\d{4}-\d{2}-\d{2}$/.test(f)) throw new Error(`Fecha inválida: ${f} (use AAAA-MM-DD)`);
const salida = path.join(os.homedir(), ".zamorapp");

// Las mismas equivalencias que usó la carga (scripts/importar-integral/cargar.mjs)
const APTITUD = { Elegible: "elegible", ElegibleRest: "elegible_con_restricciones", NoElegible: "no_elegible", EspResultado: "espera_resultados", Diferido: "diferido" };
const MES = "convert(char(7), c.fecha, 126)";
const RANGO = `c.fecha >= '${desde}' and c.fecha < dateadd(day, 1, '${hasta}')`;
const CON_LIMITACION = "(select distinct lb.cod_consulta from Integral.limitacionLab lb with (nolock) join Integral.limitaciones l with (nolock) on l.cod_limitacionlab = lb.codigo)";

export const SAME = {
  // 1) Exámenes: cuántos renglones de consultaexamen hay de cada tipo, y cuántos no tienen examen en el catálogo.
  //    La carga solo pasó «Funcional» y «Fisico» (sin repetir el mismo examen en una consulta) y «Paraclinico».
  tipos: `select isnull(e.tipoexamen, '(sin tipo)'), case when e.codigo is null then 'sin examen en el catálogo' else '' end, count(*)
          from Integral.consultaexamen ce with (nolock) join Integral.consulta c with (nolock) on c.codigo = ce.cod_consulta
          left join Integral.examen e with (nolock) on e.codigo = ce.cod_examen
          where ${RANGO} group by e.tipoexamen, case when e.codigo is null then 'sin examen en el catálogo' else '' end`,
  sinRepetir: `select x.tipoexamen, '', count(*) from (select distinct ce.cod_consulta, ce.cod_examen, e.tipoexamen
          from Integral.consultaexamen ce with (nolock) join Integral.consulta c with (nolock) on c.codigo = ce.cod_consulta
          join Integral.examen e with (nolock) on e.codigo = ce.cod_examen where ${RANGO} and e.tipoexamen in ('Funcional', 'Fisico')) x group by x.tipoexamen`,
  paraMes: `select ${MES}, '', count(*) from Integral.consultaexamen ce with (nolock) join Integral.consulta c with (nolock) on c.codigo = ce.cod_consulta
          join Integral.examen e with (nolock) on e.codigo = ce.cod_examen where ${RANGO} and e.tipoexamen = 'Paraclinico' group by ${MES}`,
  // 2) Limitaciones: consultas con limitaciones o con aptitud «ElegibleRest», por aptitud
  limitaciones: `select isnull(c.codaptitud, '(vacía)'), case when x.cod_consulta is null then 'sin limitaciones' else 'con limitaciones' end, count(*)
          from Integral.consulta c with (nolock) left join ${CON_LIMITACION} x on x.cod_consulta = c.codigo
          where ${RANGO} and (x.cod_consulta is not null or c.codaptitud = 'ElegibleRest')
          group by c.codaptitud, case when x.cod_consulta is null then 'sin limitaciones' else 'con limitaciones' end`,
  // 3) Consultas por usuario del SAME (el código se compara con el del médico histórico; no sale en el informe)
  medicos: `select isnull(c.cod_usrcreacion, ''), '', count(*) from Integral.consulta c with (nolock) where ${RANGO} group by c.cod_usrcreacion`,
  // 4) Padrón
  padron: `select 'total', '', count(*) from Integral.paciente with (nolock)`,
};

export const ZAM = {
  // Renglones guardados en las consultas, por mes y por tipo (los mismos tres arreglos donde la carga puso consultaexamen)
  examenes: `select left(c.fecha::text, 7), coalesce(c.origen, 'zamorApp'),
               sum(jsonb_array_length(case when jsonb_typeof(c.examen_funcional) = 'array' then c.examen_funcional else '[]' end)),
               sum(jsonb_array_length(case when jsonb_typeof(c.examen_fisico) = 'array' then c.examen_fisico else '[]' end)),
               sum(jsonb_array_length(case when jsonb_typeof(c.paraclinicos) = 'array' then c.paraclinicos else '[]' end))
             from clinico.consultas c where c.estado <> 'borrador' and c.fecha between $1::date and $2::date group by 1, 2`,
  limitaciones: `select a.clasificacion, coalesce(array_length(a.restricciones, 1), 0) > 0, count(*)
             from clinico.aptitudes a join clinico.consultas c on c.id = a.consulta_id
             where c.estado <> 'borrador' and c.fecha between $1::date and $2::date
               and (coalesce(array_length(a.restricciones, 1), 0) > 0 or a.clasificacion = 'elegible_con_restricciones') group by 1, 2`,
  // Consultas del SAME sin constancia: la carga dejó sus restricciones en las conclusiones («Restricciones: …»)
  limitacionesSinAptitud: `select count(*) from clinico.consultas c
             where c.origen = 'integral' and c.estado <> 'borrador' and c.fecha between $1::date and $2::date
               and not exists (select 1 from clinico.aptitudes a where a.consulta_id = c.id) and c.conclusiones like '%Restricciones:%'`,
  medicos: `select coalesce(mh.codigo_origen, ''), c.medico_historico_id is not null, count(*) from clinico.consultas c
             left join public.medicos_historicos mh on mh.id = c.medico_historico_id
             where c.estado <> 'borrador' and c.fecha between $1::date and $2::date group by 1, 2`,
  padron: `select coalesce(t.origen, 'zamorApp'), count(*), count(*) filter (where t.creado_en >= '2026-10-25'),
             min(t.creado_en)::date::text, max(t.creado_en)::date::text from public.trabajadores t group by 1`,
};

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
  return texto.split(/\r?\n/).filter((l) => l.includes("|")).map((l) => { const [a, b, v] = l.split("|").map((x) => x.trim()); return [a, b === "NULL" ? "" : b, Number(v) || 0]; });
}

export async function leerZamorapp() {
  const c = new pg.Client({ ...configuracion(process.env.DATABASE_URL), connectionTimeoutMillis: 30_000 });
  await c.connect();
  const r = {};
  try {
    await c.query("begin read only");
    for (const [k, sql] of Object.entries(ZAM)) r[k] = (await c.query({ text: sql, values: sql.includes("$1") ? [desde, hasta] : [], rowMode: "array" })).rows;
  } finally {
    await c.query("rollback").catch(() => {});
    await c.end();
  }
  return r;
}

const n = (x) => Number(x).toLocaleString("es-VE");
const suma = (filas, f) => filas.reduce((s, x) => s + Number(f(x)), 0);

export function informe(S, Z) {
  const L = [`# Diagnóstico del cuadre con el SAME`, "", `Período: del ${desde} al ${hasta}. Solo cifras.`, ""];

  // 1) Exámenes
  const tipo = (t) => suma(S.tipos.filter((x) => x[0] === t && !x[1]), (x) => x[2]);
  const sinCat = suma(S.tipos.filter((x) => x[1]), (x) => x[2]);
  const otros = S.tipos.filter((x) => !x[1] && !["Funcional", "Fisico", "Paraclinico"].includes(x[0]));
  const sinRep = (t) => suma(S.sinRepetir.filter((x) => x[0] === t), (x) => x[2]);
  const zi = Z.examenes.filter((x) => x[1] === "integral");
  const [zf, zx, zp] = [2, 3, 4].map((i) => suma(zi, (x) => x[i]));
  L.push("## 1. Exámenes", "", "| Tipo en el SAME | Renglones en el SAME | Sin repetir en la consulta | En zamorApp (consultas del SAME) |", "|---|---:|---:|---:|",
    `| Funcional | ${n(tipo("Funcional"))} | ${n(sinRep("Funcional"))} | ${n(zf)} |`,
    `| Físico | ${n(tipo("Fisico"))} | ${n(sinRep("Fisico"))} | ${n(zx)} |`,
    `| Paraclínico | ${n(tipo("Paraclinico"))} | — | ${n(zp)} |`,
    ...otros.map((x) => `| ${x[0]} (la carga no lo pasó) | ${n(x[2])} | — | 0 |`),
    `| Sin examen en el catálogo (la carga no lo pasó) | ${n(sinCat)} | — | 0 |`, "");
  const pm = new Map(S.paraMes.map((x) => [x[0], x[2]]));
  const zm = new Map(); for (const x of zi) zm.set(x[0], (zm.get(x[0]) ?? 0) + Number(x[4]));
  const meses = [...new Set([...pm.keys(), ...zm.keys()])].sort().filter((m) => (pm.get(m) ?? 0) !== (zm.get(m) ?? 0));
  L.push(meses.length ? `Paraclínicos por mes que no cuadran (${meses.length}):` : "Paraclínicos: cuadran mes a mes.", ...meses.slice(0, 30).map((m) => `- ${m}: SAME ${n(pm.get(m) ?? 0)}, zamorApp ${n(zm.get(m) ?? 0)}`), "");

  // 2) Limitaciones
  L.push("## 2. Limitaciones", "", "| Aptitud en el SAME | Con limitaciones | Sin limitaciones (solo «ElegibleRest») | ¿Tiene constancia en zamorApp? |", "|---|---:|---:|---|");
  for (const ap of [...new Set(S.limitaciones.map((x) => x[0]))].sort()) {
    const con = suma(S.limitaciones.filter((x) => x[0] === ap && x[1] === "con limitaciones"), (x) => x[2]);
    const sin = suma(S.limitaciones.filter((x) => x[0] === ap && x[1] === "sin limitaciones"), (x) => x[2]);
    L.push(`| ${ap} | ${n(con)} | ${n(sin)} | ${APTITUD[ap] ? "sí" : "no: quedan en las conclusiones"} |`);
  }
  L.push("", "| zamorApp (constancias del período) | Con restricciones | Sin restricciones |", "|---|---:|---:|");
  for (const cl of [...new Set(Z.limitaciones.map((x) => x[0]))].sort())
    L.push(`| ${cl} | ${n(suma(Z.limitaciones.filter((x) => x[0] === cl && x[1]), (x) => x[2]))} | ${n(suma(Z.limitaciones.filter((x) => x[0] === cl && !x[1]), (x) => x[2]))} |`);
  L.push("", `Consultas del SAME sin constancia con «Restricciones:» en las conclusiones: ${n(Z.limitacionesSinAptitud[0][0])}.`, "");

  // 3) Médicos: los códigos se comparan aquí y no se escriben
  const zPorCod = new Map(Z.medicos.filter((x) => x[1]).map((x) => [x[0], Number(x[2])]));
  const sinHist = suma(Z.medicos.filter((x) => !x[1]), (x) => x[2]);
  L.push("## 3. Consultas por médico", "", "| Usuario del SAME | Consultas en el SAME | En zamorApp con ese médico histórico |", "|---|---:|---:|");
  S.medicos.sort((a, b) => b[2] - a[2]).forEach((x, i) => L.push(`| usuario ${i + 1} | ${n(x[2])} | ${zPorCod.has(x[0]) ? n(zPorCod.get(x[0])) : "—"} |`));
  const porHist = Z.medicos.filter((x) => x[1]).map((x) => Number(x[2])).sort((a, b) => b - a);
  L.push("", `Consultas con médico histórico en zamorApp: ${porHist.length ? porHist.map(n).join(", ") : "ninguna"}.`,
    `Consultas sin médico histórico (cuentan para el médico de zamorApp): ${n(sinHist)}.`,
    `Médicos históricos cuyo código no está entre los usuarios del SAME: ${[...zPorCod.keys()].filter((k) => !S.medicos.some((x) => x[0] === k)).length}.`, "");

  // 4) Padrón
  L.push("## 4. Padrón", "", `SAME: ${n(S.padron[0][2])} pacientes.`, "", "| Origen en zamorApp | Pacientes | Creados desde el 25-oct | Primero | Último |", "|---|---:|---:|---|---|",
    ...Z.padron.map((x) => `| ${x[0]} | ${n(x[1])} | ${n(x[2])} | ${x[3]} | ${x[4]} |`), "");
  return L.join("\n");
}

async function principal() {
  if (!process.env.DATABASE_URL) throw new Error("Falta DATABASE_URL (la misma del respaldo)");
  console.log(`Diagnóstico del ${desde} al ${hasta}`);
  const Z = await leerZamorapp();
  console.log("zamorApp leído.");
  const S = {};
  for (const [k, sql] of Object.entries(SAME)) { process.stdout.write(`SAME: ${k}… `); S[k] = await leerSame(sql); console.log("listo"); }
  fs.mkdirSync(salida, { recursive: true });
  const archivo = path.join(salida, `diagnostico-cuadre-${hasta}.md`);
  fs.writeFileSync(archivo, informe(S, Z));
  console.log(`Informe: ${archivo}`);
}

// Las pruebas importan informe() sin correr nada
if (!process.env.DIAGNOSTICO_SOLO_INFORME) principal().catch((e) => { console.error(e.message); process.exit(1); });
