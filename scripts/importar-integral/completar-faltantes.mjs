// Cargador puntual: completa en zamorApp los datos del SAME que la carga del 26/10 no pasó. No repite cargar.mjs.
// - Potencial discapacidad (consulta.discapacitado = 'S', 14 consultas): marca la consulta importada, solo si no lo está.
// - Observación del reposo (obsreposo, 45): en clinico.reposos.observacion (migración 20261030420000), solo si está vacía.
// - Notas de antecedentes por tipo (pacientetipant con texto, 66): se agregan a los antecedentes de la última consulta del
//   paciente, que es la que copia la consulta nueva. Solo si esa consulta es importada del SAME: una consulta hecha en
//   zamorApp no se toca (el informe dice cuántas quedan para pasar a mano).
// El SAME solo se LEE: 3 consultas pequeñas (bcp), una a la vez, con NOLOCK y solo con 1 GB libre.
// Por defecto es un ENSAYO (todo se deshace al final). Para guardar: --guardar, con el sí de Cesar.
// Uso en la PC de Cesar: powershell -File scripts\importar-integral\completar-faltantes.ps1 [-Guardar]
// Informe (solo cifras y números de historia): %USERPROFILE%\.zamorapp\completar-faltantes.md
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import pg from "pg";
import { configuracion } from "../conexion-segura.mjs";

const GUARDAR = process.argv.includes("--guardar");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "integral-faltantes-"));

// ─── Lectura del SAME ───────────────────────────────────────
function leer(nombre, columnas, desde, donde = "") {
  const libre = os.freemem();
  if (libre < 1024 ** 3) throw new Error(`Memoria libre ${Math.round(libre / 1024 ** 2)} MB: hace falta 1 GB para leer el SAME. No se hizo nada.`);
  const archivo = path.join(tmp, `${nombre}.dat`);
  execFileSync("bcp", [`select ${columnas.join(", ")} from ${desde} ${donde}`, "queryout", archivo, "-S", ".", "-T", "-d", "Integral", "-w", "-t", "<|>", "-r", "<#>\\n"],
    { stdio: "pipe", timeout: 120000 });
  const nombres = columnas.map((c) => c.split(/\s+/).pop().split(".").pop());
  return fs.readFileSync(archivo, "utf16le").replace(/^﻿/, "").split(/<#>\r?\n/).filter((l) => l.length)
    .map((l) => Object.fromEntries(l.split("<|>").map((v, i) => [nombres[i], v.replace(/\u0000/g, "").trim()])));
}

console.log("Leyendo el SAME…");
const discapacidad = leer("discapacidad", ["codigo"], "Integral.consulta with (nolock)", "where discapacitado = 'S'");
const notas = leer("notas_antecedentes", ["p.cod_paciente", "t.nombre tipo", "cast(p.observacion as nvarchar(4000)) observacion"],
  "Integral.pacientetipant p with (nolock) join Integral.tipoantecedente t with (nolock) on t.codigo = p.cod_tipoantecedente",
  "where len(ltrim(rtrim(p.observacion))) > 0");
const obsReposo = leer("observacion_reposo", ["codigo", "cast(obsreposo as nvarchar(4000)) observacion"], "Integral.consulta with (nolock)",
  "where reposo = '1' and datalength(obsreposo) > 0");
fs.rmSync(tmp, { recursive: true, force: true });

// ─── Escritura en zamorApp ──────────────────────────────────
const cliente = new pg.Client(configuracion(process.env.DATABASE_URL));
await cliente.connect();
const q = (s, p) => cliente.query(s, p);
const informe = [`# Completar faltantes del SAME (${GUARDAR ? "GUARDADO" : "ensayo: no se guardó nada"})`, "", `Generado el ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC.`, ""];

try {
  await q("begin");
  // Una sola organización: si hubiera más, no se adivina a cuál pertenecen los datos del SAME
  const { rows: orgs } = await q("select distinct org_id id from clinico.consultas where origen = 'integral'");
  if (orgs.length !== 1) throw new Error(`Hay ${orgs.length} organizaciones con datos del SAME: hace falta una sola. No se hizo nada.`);
  const [org] = orgs;

  // 1) Potencial discapacidad
  const { rowCount: marcadas } = await q(
    `update clinico.consultas set potencial_discapacidad = true, discapacidad_nota = coalesce(nullif(discapacidad_nota, ''), 'Marcado en el SAME')
      where org_id = $1 and origen = 'integral' and codigo_origen = any($2::text[]) and not potencial_discapacidad`,
    [org.id, discapacidad.map((d) => `cons:${d.codigo}`)]);
  const { rows: [{ n: yaMarcadas }] } = await q(
    "select count(*)::int n from clinico.consultas where org_id = $1 and origen = 'integral' and codigo_origen = any($2::text[]) and potencial_discapacidad",
    [org.id, discapacidad.map((d) => `cons:${d.codigo}`)]);
  informe.push("## Potencial discapacidad", "", `- En el SAME: ${discapacidad.length} consultas.`, `- Marcadas ahora: ${marcadas}. Marcadas en total: ${yaMarcadas}.`,
    `- Sin consulta en zamorApp: ${discapacidad.length - yaMarcadas}.`, "");

  // 2) Notas de antecedentes: a la última consulta del paciente (la que copia la consulta nueva), si es importada
  const porPaciente = new Map();
  for (const n of notas) porPaciente.set(n.cod_paciente, [...(porPaciente.get(n.cod_paciente) ?? []), n]);
  const { rows: ultimas } = await q(
    `select distinct on (c.trabajador_id) t.codigo_origen, c.id, c.origen, c.antecedentes
       from public.trabajadores t join clinico.consultas c on c.trabajador_id = t.id
      where t.org_id = $1 and t.codigo_origen = any($2::text[]) order by c.trabajador_id, c.fecha desc, c.creado_en desc`,
    [org.id, [...porPaciente.keys()].map((h) => `pac:${h}`)]);
  const ultimaDe = new Map(ultimas.map((u) => [u.codigo_origen.slice(4), u]));
  const enZamorapp = [], sinConsulta = [];
  let agregadas = 0, yaEstaban = 0, consultas = 0;
  for (const [historia, ns] of porPaciente) {
    const u = ultimaDe.get(historia);
    if (!u) { sinConsulta.push(historia); continue; }
    if (u.origen !== "integral") { enZamorapp.push(historia); continue; }
    const actuales = Array.isArray(u.antecedentes) ? u.antecedentes : [];
    const ids = new Set(actuales.map((a) => a.id));
    // Mismo formato que cargar.mjs: «I. Digestivo» → «Digestivo»; los familiares van aparte
    const nuevas = ns.map((n) => ({ id: `integral-nota-${historia}-${n.tipo}`, nombre: n.tipo.replace(/^[A-Z]\.\s*/, ""),
      grupo: /familiar/i.test(n.tipo) ? "familiar" : "personal", observacion: n.observacion })).filter((n) => !ids.has(n.id));
    yaEstaban += ns.length - nuevas.length;
    if (!nuevas.length) continue;
    // Solo se agregan las nuevas al final: si alguien editó la consulta mientras tanto, no se pisa
    await q("update clinico.consultas set antecedentes = coalesce(antecedentes, '[]'::jsonb) || $2::jsonb where id = $1", [u.id, JSON.stringify(nuevas)]);
    agregadas += nuevas.length; consultas++;
  }
  informe.push("## Notas de antecedentes", "", `- En el SAME: ${notas.length} notas con texto, de ${porPaciente.size} pacientes.`,
    `- Agregadas ahora: ${agregadas}, en ${consultas} consultas. Ya estaban: ${yaEstaban}.`,
    `- Pacientes cuya última consulta ya se hizo en zamorApp (no se toca; pasar la nota a mano): ${enZamorapp.length}${enZamorapp.length ? ` (historias ${enZamorapp.join(", ")})` : ""}.`,
    `- Pacientes sin consultas en zamorApp: ${sinConsulta.length}${sinConsulta.length ? ` (historias ${sinConsulta.join(", ")})` : ""}.`, "");

  // 3) Observación del reposo (columna de la migración 20261030420000): solo en reposos importados que no la tengan
  const conTexto = obsReposo.filter((r) => r.observacion.trim());
  const { rowCount: observaciones } = await q(
    `update clinico.reposos r set observacion = x.observacion
       from jsonb_to_recordset($2::jsonb) as x(codigo_origen text, observacion text)
      where r.org_id = $1 and r.origen = 'integral' and r.codigo_origen = x.codigo_origen and coalesce(r.observacion, '') = ''`,
    [org.id, JSON.stringify(conTexto.map((r) => ({ codigo_origen: `rep:${r.codigo}`, observacion: r.observacion.trim() })))]);
  const { rows: [{ n: conObservacion }] } = await q(
    "select count(*)::int n from clinico.reposos where org_id = $1 and origen = 'integral' and codigo_origen = any($2::text[]) and coalesce(observacion, '') <> ''",
    [org.id, conTexto.map((r) => `rep:${r.codigo}`)]);
  informe.push("## Observación del reposo", "", `- En el SAME: ${conTexto.length} reposos con observación.`,
    `- Agregadas ahora: ${observaciones}. Con observación en total: ${conObservacion}.`, `- Sin reposo en zamorApp: ${conTexto.length - conObservacion}.`, "");

  await q(GUARDAR ? "commit" : "rollback");
} catch (e) {
  await q("rollback").catch(() => {});
  throw e;
} finally {
  await cliente.end();
}

const salida = path.join(os.homedir(), ".zamorapp");
fs.mkdirSync(salida, { recursive: true });
fs.writeFileSync(path.join(salida, "completar-faltantes.md"), informe.join("\n"), "utf8");
console.log(informe.join("\n"));
