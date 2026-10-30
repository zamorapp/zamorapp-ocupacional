// Cargador puntual: la fecha de ingreso al cargo (antigüedad en el cargo) del SAME → trabajadores.fecha_ingreso_cargo
// (migración 20261030480000). La carga del 26/10 trajo cargo, dependencia y fecha de ingreso a la empresa, pero no esta.
// - No pisa nada: solo llena fecha_ingreso_cargo (y fecha_ingreso, si falta) donde está vacía.
// - El SAME solo se LEE: primero 1 consulta de diccionario (qué columnas de Integral.paciente tienen fechas de ingreso
//   o antigüedad), luego 1 consulta pequeña (historia + esa columna), con NOLOCK, una a la vez y con 1 GB libre.
// - Si no sabe qué columna usar, NO adivina: lista las candidatas en el informe; se vuelve a correr con -Columna <nombre>.
// Por defecto es un ENSAYO (todo se deshace al final). Para guardar: --guardar, con el sí de Cesar.
// Uso en la PC de Cesar: powershell -File scripts\importar-integral\cargar-antiguedad-cargo.ps1 [-Columna <nombre>] [-Guardar]
// Informe (solo cifras y números de historia): %USERPROFILE%\.zamorapp\antiguedad-cargo.md
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import pg from "pg";
import { configuracion } from "../conexion-segura.mjs";

const GUARDAR = process.argv.includes("--guardar");
const COLUMNA = process.argv.find((a) => a.startsWith("--columna="))?.slice(10) || null;
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

// 1) Qué columnas del paciente pueden ser la fecha de ingreso al cargo (solo nombres y tipos, ningún dato)
console.log("Leyendo el diccionario del SAME…");
const candidatas = leer("columnas",
  "select column_name, data_type from Integral.INFORMATION_SCHEMA.COLUMNS where table_schema = 'Integral' and table_name = 'paciente' " +
  "and (column_name like '%ingres%' or column_name like '%antig%' or column_name like '%cargo%' or column_name like '%fecha%')",
  ["columna", "tipo"]);
informe.push("## Columnas candidatas en Integral.paciente", "", ...candidatas.map((c) => `- ${c.columna} (${c.tipo})`), "");

// Sin -Columna: se elige sola solo si hay UNA columna de fecha con «cargo» en el nombre
const conCargo = candidatas.filter((c) => /cargo/i.test(c.columna) && /(ingres|antig|fecha)/i.test(c.columna));
const elegida = COLUMNA ? candidatas.find((c) => c.columna.toLowerCase() === COLUMNA.toLowerCase()) : conCargo.length === 1 ? conCargo[0] : null;
if (!elegida) {
  informe.push(COLUMNA ? `No existe la columna «${COLUMNA}» entre las candidatas. No se hizo nada.`
    : "No hay una sola columna clara de ingreso al cargo. Elige una de la lista y vuelve a correr con -Columna <nombre>. No se hizo nada.");
  terminar(COLUMNA ? 1 : 0);
}
if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(elegida.columna)) { informe.push("Nombre de columna no válido. No se hizo nada."); terminar(1); }
informe.push(`Columna usada: **${elegida.columna}** (${elegida.tipo}).`, "");

// 2) Historia + fecha (texto «AAAA-MM-DD» o «D/M/AAAA»), solo las que tienen valor
const fechaTexto = /date|time/i.test(elegida.tipo) ? `convert(varchar(10), ${elegida.columna}, 23)` : `ltrim(rtrim(cast(${elegida.columna} as varchar(30))))`;
console.log("Leyendo las fechas del SAME…");
const filas = leer("fechas", `select historia, ${fechaTexto} from Integral.paciente with (nolock) where ${elegida.columna} is not null`, ["historia", "valor"]);
const normalizar = (s) => {
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
  return m ? `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}` : null;
};
const validas = [], raras = [];
for (const f of filas) {
  const d = normalizar(f.valor);
  // 1900-01-01 es «vacío» en el SAME. Sin tope de «hoy»: la fecha de Windows se cambia para abrir el SAME y cortaría fechas reales
  if (d && d > "1930-01-01") validas.push({ codigo_origen: `pac:${f.historia}`, fecha: d });
  else raras.push(f.historia);
}
informe.push("## SAME", "", `- Pacientes con valor: ${filas.length}. Fechas válidas: ${validas.length}. Sin fecha usable: ${raras.length}${raras.length ? ` (historias ${raras.slice(0, 50).join(", ")}${raras.length > 50 ? "…" : ""})` : ""}.`, "");

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
