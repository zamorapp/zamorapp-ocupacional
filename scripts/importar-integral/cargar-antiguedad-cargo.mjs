// Cargador puntual: la antigüedad en el cargo del SAME → trabajadores.fecha_ingreso_cargo (migración 20261030480000).
// La carga del 26/10 trajo cargo, dependencia y fecha de ingreso a la empresa, pero no esta.
// En el SAME, Integral.paciente.antiguedadcargo es TEXTO con una duración (leído el 30/10: de 3.540 valores, 3.035 son
// números solos —meses—, 447 «2M»/«1A»/«NA» y 58 con la unidad en palabras). Decisión del coordinador (30/10/2026):
// - Referencia: la fecha de la ÚLTIMA consulta del SAME del paciente (cuando se anotó); sin consultas, fecharegistro.
// - fecha_ingreso_cargo = referencia − duración. Número solo = meses; M = meses; A = años; «meses»/«años» escritos.
// - «0», «NA», vacío o lo ilegible queda vacío: no se inventa nada.
// - No pisa nada: solo llena donde fecha_ingreso_cargo está vacía.
// El SAME solo se LEE: 1 consulta de diccionario (tipos) y 1 consulta pequeña, con NOLOCK, una a la vez y con 1 GB libre.
// Por defecto es un ENSAYO (todo se deshace al final): el informe dice cuántos quedan en cada caso. Para guardar:
// --guardar, con el sí de Cesar.
// Uso en la PC de Cesar: powershell -File scripts\importar-integral\cargar-antiguedad-cargo.ps1 [-Guardar]
// Informe (solo cifras y números de historia): %USERPROFILE%\.zamorapp\antiguedad-cargo.md
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import pg from "pg";
import { configuracion } from "../conexion-segura.mjs";

const GUARDAR = process.argv.includes("--guardar");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "integral-antiguedad-"));
const informe = [`# Antigüedad en el cargo desde el SAME (${GUARDAR ? "GUARDADO" : "ensayo: no se guardó nada"})`, "",
  `Generado el ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC.`, ""];
const salida = path.join(os.homedir(), ".zamorapp");
const terminar = (codigo = 0) => {
  fs.rmSync(tmp, { recursive: true, force: true });
  fs.mkdirSync(salida, { recursive: true });
  fs.writeFileSync(path.join(salida, "antiguedad-cargo.md"), informe.join("\n"), "utf8");
  console.log(informe.join("\n"));
  process.exit(codigo);
};

// ─── Lectura del SAME ───────────────────────────────────────
function leer(nombre, consulta, columnas) {
  const libre = os.freemem();
  if (libre < 1024 ** 3) throw new Error(`Memoria libre ${Math.round(libre / 1024 ** 2)} MB: hace falta 1 GB para leer el SAME. No se hizo nada.`);
  const archivo = path.join(tmp, `${nombre}.dat`);
  execFileSync("bcp", [consulta, "queryout", archivo, "-S", ".", "-T", "-d", "Integral", "-w", "-t", "<|>", "-r", "<#>\\n"], { stdio: "pipe", timeout: 120000 });
  return fs.readFileSync(archivo, "utf16le").replace(/^﻿/, "").split(/<#>\r?\n/).filter((l) => l.length)
    .map((l) => Object.fromEntries(l.split("<|>").map((v, i) => [columnas[i], v.replace(/\u0000/g, "").trim()])));
}

// 1) Tipos de las columnas usadas (para leer las fechas sin depender del formato regional de SQL Server)
console.log("Leyendo el diccionario del SAME…");
const tipos = new Map(leer("columnas",
  "select table_name + '.' + column_name, data_type from Integral.INFORMATION_SCHEMA.COLUMNS where table_schema = 'Integral' " +
  "and ((table_name = 'paciente' and column_name in ('historia', 'antiguedadcargo', 'fecharegistro')) or (table_name = 'consulta' and column_name in ('cod_paciente', 'fecha')))",
  ["columna", "tipo"]).map((c) => [c.columna.toLowerCase(), c.tipo.toLowerCase()]));
for (const c of ["paciente.historia", "paciente.antiguedadcargo", "paciente.fecharegistro", "consulta.cod_paciente", "consulta.fecha"]) {
  if (!tipos.has(c)) { informe.push(`Falta la columna ${c} en el SAME. No se hizo nada.`); terminar(1); }
}
// Fecha como texto «AAAA-MM-DD» si es fecha; si es texto, tal cual (se lee «D/M/AAAA» o «AAAA-MM-DD»)
const comoTexto = (expr, tipo) => (/date|time/.test(tipo) ? `convert(varchar(10), ${expr}, 23)` : `ltrim(rtrim(cast(${expr} as varchar(30))))`);

// La última consulta: si la fecha es texto, max() de «D/M/AAAA» sería alfabético; se convierte antes (103 = D/M/AAAA)
const maxFecha = (expr, tipo) => (/date|time/.test(tipo)
  ? `convert(varchar(10), max(${expr}), 23)`
  : `convert(varchar(10), max(coalesce(try_convert(date, ${expr}, 103), try_convert(date, ${expr}, 23))), 23)`);

// 2) Historia, antigüedad (texto), última consulta y fecha de registro: una sola consulta
console.log("Leyendo la antigüedad en el cargo del SAME…");
const filas = leer("antiguedad",
  `select p.historia, ltrim(rtrim(cast(p.antiguedadcargo as varchar(60)))), ` +
  `(select ${maxFecha("c.fecha", tipos.get("consulta.fecha"))} from Integral.consulta c with (nolock) where c.cod_paciente = p.historia), ` +
  `${comoTexto("p.fecharegistro", tipos.get("paciente.fecharegistro"))} ` +
  `from Integral.paciente p with (nolock) where p.antiguedadcargo is not null`,
  ["historia", "antiguedad", "ultima", "registro"]);

const normalizar = (s) => {
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s ?? "");
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(s ?? "");
  return m ? `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}` : null;
};
// Duración en meses: «24» (meses), «2M», «1A», «3 años», «6 meses», «1A 6M», «1 año y 6 meses». Null si no se entiende.
export function mesesDe(texto) {
  const t = (texto ?? "").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (!t || /^n\/?a$/.test(t)) return null;
  if (/^\d+$/.test(t)) return Number(t) || null;
  const partes = [...t.matchAll(/(\d+)\s*(anos?|a|meses|mes|m)\b/g)];
  // Todo el texto tiene que ser «número + unidad» (con «y», comas o espacios entre medio)
  if (!partes.length || t.replace(/(\d+)\s*(anos?|a|meses|mes|m)\b/g, "").replace(/[\s,y.]/g, "") !== "") return null;
  const meses = partes.reduce((n, [, num, u]) => n + Number(num) * (u.startsWith("a") ? 12 : 1), 0);
  return meses || null;
}
const restarMeses = (iso, meses) => {
  const [a, m, d] = iso.split("-").map(Number);
  const total = a * 12 + (m - 1) - meses;
  const anio = Math.floor(total / 12), mes = total % 12;
  const ultimoDia = new Date(Date.UTC(anio, mes + 1, 0)).getUTCDate();
  return `${anio}-${String(mes + 1).padStart(2, "0")}-${String(Math.min(d, ultimoDia)).padStart(2, "0")}`;
};

const casos = { numero: 0, conUnidad: 0, ceroOVacio: 0, ilegible: 0, sinReferencia: 0, porUltimaConsulta: 0, porRegistro: 0 };
const ilegibles = new Map();
const validas = [];
for (const f of filas) {
  const t = f.antiguedad.trim();
  const meses = mesesDe(t);
  if (meses === null) {
    if (!t || /^0+$/.test(t) || /^n\/?a$/i.test(t)) casos.ceroOVacio++;
    else { casos.ilegible++; ilegibles.set(t, (ilegibles.get(t) ?? 0) + 1); }
    continue;
  }
  if (/^\d+$/.test(t)) casos.numero++; else casos.conUnidad++;
  const ultima = normalizar(f.ultima), registro = normalizar(f.registro);
  // 1900-01-01 es «vacío» en el SAME
  const ref = ultima && ultima > "1930-01-01" ? ultima : registro && registro > "1930-01-01" ? registro : null;
  if (!ref) { casos.sinReferencia++; continue; }
  if (ref === ultima) casos.porUltimaConsulta++; else casos.porRegistro++;
  const fecha = restarMeses(ref, meses);
  if (fecha > "1930-01-01") validas.push({ codigo_origen: `pac:${f.historia}`, fecha });
  else casos.ilegible++;
}
informe.push("## SAME (Integral.paciente.antiguedadcargo)", "",
  `- Pacientes con valor: ${filas.length}.`,
  `- Número solo (meses): ${casos.numero}. Con unidad (M, A, meses, años): ${casos.conUnidad}.`,
  `- «0», «NA» o vacío (quedan vacíos): ${casos.ceroOVacio}.`,
  `- Ilegibles (quedan vacíos): ${casos.ilegible}${ilegibles.size ? ` → ${[...ilegibles].slice(0, 30).map(([t, n]) => `«${t}» ×${n}`).join(", ")}` : ""}.`,
  `- Sin fecha de referencia (quedan vacíos): ${casos.sinReferencia}.`,
  `- Referencia: última consulta ${casos.porUltimaConsulta}, fecha de registro ${casos.porRegistro}.`,
  `- Fechas de ingreso al cargo calculadas: ${validas.length}.`, "");

// ─── Escritura en zamorApp ──────────────────────────────────
const cliente = new pg.Client(configuracion(process.env.DATABASE_URL));
await cliente.connect();
const q = (s, p) => cliente.query(s, p);
try {
  await q("begin");
  const { rows: orgs } = await q("select distinct org_id id from public.trabajadores where origen = 'integral'");
  if (orgs.length !== 1) throw new Error(`Hay ${orgs.length} organizaciones con datos del SAME: hace falta una sola. No se hizo nada.`);
  const datos = JSON.stringify(validas);
  // Sin pisar: solo donde está vacía (lo que el médico ya escribió en zamorApp se queda)
  const { rowCount: llenas } = await q(
    `update public.trabajadores t set fecha_ingreso_cargo = x.fecha::date
       from jsonb_to_recordset($2::jsonb) as x(codigo_origen text, fecha text)
      where t.org_id = $1 and t.origen = 'integral' and t.codigo_origen = x.codigo_origen and t.fecha_ingreso_cargo is null`,
    [orgs[0].id, datos]);
  const { rows: [{ ya, sin }] } = await q(
    `select count(*) filter (where t.fecha_ingreso_cargo is not null)::int ya, count(*) filter (where t.id is null)::int sin
       from jsonb_to_recordset($2::jsonb) as x(codigo_origen text, fecha text)
       left join public.trabajadores t on t.org_id = $1 and t.codigo_origen = x.codigo_origen`,
    [orgs[0].id, datos]);
  informe.push("## zamorApp", "", `- Llenadas ahora: ${llenas}.`, `- Con fecha de ingreso al cargo en total: ${ya}.`, `- Sin trabajador en zamorApp: ${sin}.`, "");
  await q(GUARDAR ? "commit" : "rollback");
} catch (e) {
  await q("rollback").catch(() => {});
  informe.push(`Error: ${e.message}`);
  await cliente.end();
  terminar(1);
}
await cliente.end();
terminar(0);
