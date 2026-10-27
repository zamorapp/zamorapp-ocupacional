// Carga los datos del Sistema Integral (SQL Server en esta PC) en zamorApp.
// El Integral solo se LEE (bcp queryout); no se modifica nada allí.
// Uso:  $env:PGPW="<clave base>"; node scripts/importar-integral/cargar.mjs [--ensayo]
//   --ensayo: hace todo dentro de una transacción y al final la deshace (no guarda nada); muestra los conteos.
// La primera vez crea catalogos\medicos-same.csv con los usuarios del SAME: completarlo (quién es cada médico) y volver a correr.
// Se puede repetir: cada registro lleva origen 'integral' + su código del Integral y se actualiza en vez de duplicarse.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import pg from "pg";

const ENSAYO = process.argv.includes("--ensayo");
const ORIGEN = "integral";
const carpeta = path.join(os.homedir(), "Documents", "zamorApp Importacion", "integral");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "integral-"));

// ─── Lectura del Integral ───────────────────────────────────
function leer(nombre, columnas, desde, donde = "") {
  const archivo = path.join(tmp, `${nombre}.dat`);
  const consulta = `select ${columnas.map((c) => c.includes(" ") ? c : c).join(", ")} from ${desde} ${donde}`;
  execFileSync("bcp", [consulta, "queryout", archivo, "-S", ".", "-T", "-d", "Integral", "-w", "-t", "<|>", "-r", "<#>\\n"], { stdio: "pipe" });
  const nombres = columnas.map((c) => c.split(/\s+/).pop().split(".").pop());
  return fs.readFileSync(archivo, "utf16le").replace(/^﻿/, "").split(/<#>\r?\n/).filter((l) => l.length)
    .map((l) => Object.fromEntries(l.split("<|>").map((v, i) => [nombres[i], v.replace(/\u0000/g, "").trim()])));
}
const txt = (s) => `cast(${s} as nvarchar(max)) ${s.split(".").pop()}`;

console.log("Leyendo el Integral…");
const I = {
  empresas: leer("empresas", ["codigo", "rif", "nombre", "direccion", "telf01", "telf02", "contacto"], "Integral.empresa"),
  dependencias: leer("dependencias", ["cod_empresa", "codigo", "nombre"], "Integral.dependencia"),
  diagnosticos: leer("diagnosticos", ["codigo", "nombre"], "Integral.diagnostico", "where codigo in (select cod_diagnost from Integral.consultadiagnostico)"),
  medicinas: leer("medicinas", ["codigo", "nombre", "laboratorio"], "Integral.medicina", "where codigo in (select cod_medicina from Integral.tratamiento)"),
  profesiones: leer("profesiones", ["codigo", "nombre"], "Integral.profesion"),
  pacientes: leer("pacientes", ["historia", "cedula", "nombre", "apellido", "sexo", "fechanacimiento", "cod_empresa", "cod_dependencia", "cod_profesion",
    "tipo", "cargo", "codtrabajador", "fechaingresoemp", "turnotrabajo", "gruposanguineo", "telefonocelular", "telefonocasa", "email", "direccioncasa", "codstatus",
    "habalcohol", "habalcoholval1", "habalcoholval2", "habtabaquico", "habtabaquicoval1", "habtabaquicoval2", "habcafeico", "habcafeicoval1", "habcafeicoval2",
    "habmedicamento", "habmedicamentoval1", "habmedicamentoval2", "habestupefaciente", "habestupefacienteval1", "habestupefacienteval2",
    "habactividadfisica", "habactividadfisicaval1", "habactividadfisicaval2", "habsueno", "habalimenticio"], "Integral.paciente"),
  antecedentes: leer("antecedentes", ["p.cod_paciente", "t.nombre tipo", "a.nombre antecedente", "p.observacion"],
    "Integral.pacienteant p join Integral.tipoantecedente t on t.codigo = p.cod_tipoantecedente left join Integral.antecedente a on a.codigo = p.cod_antecedente"),
  consultas: leer("consultas", ["codigo", "cod_paciente", "cod_empresa", "cod_dependencia", "fecha", "horainicio", "horacierre", "codmotivcons", "codtipo",
    txt("motivoconsulta"), txt("enfermedadactual"), txt("obsgeneral"), txt("otrasindicaciones"), txt("recipelibre"), txt("indicacionlibre"),
    "codaptitud", txt("obsaptitud"), "adultosano", "codorigendiagnostico", txt("impdiagnostica"), "reposo", "codmotivoreposo", "codenteemisorreposo",
    "fechareposodesde", "fechareposohasta", "fechareposoingreso", "diasreposo", "reposovalidadoivss", txt("conclusion"), txt("recomendaemp"),
    txt("recomendapac"), txt("obsprivada"), "cargo", "cod_usrcreacion"], "Integral.consulta"),
  consultaDiag: leer("consulta_diagnosticos", ["cod_consulta", "cod_diagnost", "aparatsistem"], "Integral.consultadiagnostico"),
  examenes: leer("examenes", ["ce.cod_consulta", "ce.cod_examen", "e.nombre", "e.tipoexamen", "e.valordefecto", "g.nombre grupo", "cast(ce.resultado as nvarchar(max)) resultado", "ce.observacion", "ce.ordenexamen"],
    "Integral.consultaexamen ce join Integral.examen e on e.codigo = ce.cod_examen left join Integral.grupoexamen g on g.codigo = ce.cod_grupoexamen"),
  tratamientos: leer("tratamientos", ["t.cod_consulta", "t.cod_medicina", "m.nombre medicina", "t.presentacion", "t.concentracion", "t.dosis", "t.frecuencia", "t.duracion", "t.viaadministr", "t.obspaciente"],
    "Integral.tratamiento t left join Integral.medicina m on m.codigo = t.cod_medicina"),
  limitaciones: leer("limitaciones", ["lb.cod_consulta", "l.nombre"],
    "Integral.limitaciones x join Integral.limitacionLab lb on lb.codigo = x.cod_limitacionlab join Integral.limitacion l on l.codigo = x.cod_limitacion"),
  limitacionObs: leer("limitacion_obs", ["cod_consulta", "cast(observacion as nvarchar(max)) observacion"], "Integral.limitacionLab", "where datalength(observacion) > 0"),
  limitacionCat: leer("limitacion_cat", ["codigo", "nombre"], "Integral.limitacion"),
  notas: leer("notas", ["codigo", "codtipo", "nombre", "cast(nota as nvarchar(max)) nota"], "Integral.notalarga"),
  historiaLab: leer("historia_laboral", ["cod_paciente", "empresa", "duracion", "horario", "industria", "cargo", "descripcargo", "problemasalud", "accidetrabaj", "enfermocupac",
    "codscondambtraant", "codscondacttraant", "codscondtratraant", "codscondrietraant", "codsriefistraant", "codsriequitraant", "codsriemectraant", "codsriedistraant",
    "codsriebiotraant", "codsriepsitraant", "equiprottraant", "obscondtrabaant", "obsriesexpueant"], "Integral.antecedentelab"),
  reubicaciones: leer("reubicaciones", ["r.cod_consulta", "r.reubicado", "cast(r.observacion as nvarchar(max)) observacion", "x.nombre resultado", "cast(rr.observacion as nvarchar(max)) obs_resultado"],
    "Integral.reubicacionlab r left join Integral.reubicacionlabresultado rr on rr.cod_reubicacionlab = r.codigo left join Integral.resultreubic x on x.codigo = rr.cod_resultreubic"),
  accidentes: leer("accidentes", ["cod_consulta", "fecha", "hora", "fechadeclaracion", "horadeclaracion", "origen", "lugar", "tipolesion", "supervisor", "cast(declaracion as nvarchar(max)) declaracion"], "Integral.accidentelab"),
  referencias: leer("referencias", ["r.cod_consulta", "m.nombre especialidad", "cast(r.cuerpo as nvarchar(max)) cuerpo"], "Integral.ordenreferencia r left join Integral.maestro m on m.codigo = r.cod_especial and m.codgrupo = '004'"),
  especialidades: leer("especialidades", ["codigo", "nombre"], "Integral.maestro", "where codgrupo = '004'"),
  perfilesEx: leer("perfiles_examen", ["g.codigo grupo_codigo", "g.nombre grupo", "g.tipo", "e.nombre examen", "x.orden"],
    "Integral.examegrupoexame x join Integral.grupoexamen g on g.codigo = x.cod_grupoexamen join Integral.examen e on e.codigo = x.cod_examen"),
  riesgosAct: leer("riesgos_actuales", ["cod_empresa", "cargo", "codsriefistraact", "codsriequitraact", "codsriemectraact", "codsriedistraact", "codsriebiotraact", "codsriepsitraact"],
    "Integral.paciente", "where isnull(cargo, '') <> '' and (isnull(codsriefistraact,'') + isnull(codsriequitraact,'') + isnull(codsriemectraact,'') + isnull(codsriedistraact,'') + isnull(codsriebiotraact,'') + isnull(codsriepsitraact,'')) <> ''"),
};
for (const [k, v] of Object.entries(I)) console.log(`  ${k.padEnd(14)} ${v.length}`);

// ─── Utilidades ─────────────────────────────────────────────
const norm = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
const fecha = (s) => (s && /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null);
const marca = (s) => (s && /^\d{4}-\d{2}-\d{2}/.test(s) ? s.replace(" ", "T") + "-04:00" : null);
const fechaDMA = (s) => { const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s ?? ""); return m ? `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}` : null; };
const nulo = (s) => (s && s !== "NULL" ? s : null);
const unir = (...xs) => xs.map((x) => (x ?? "").trim()).filter(Boolean).join("\n\n") || null;
const titulo = (s) => s.toLowerCase().replace(/(^|[\s(\-/])([a-záéíóúñ])/g, (_, a, b) => a + b.toUpperCase());
const agrupar = (lista, clave) => { const m = new Map(); for (const x of lista) m.set(clave(x), [...(m.get(clave(x)) ?? []), x]); return m; };

// Diagnóstico → CIE-10: lo revisado en revision-diagnosticos.csv (columna cie10_corregido manda sobre la sugerida)
const revision = new Map();
const rutaRevision = path.join(carpeta, "catalogos", "revision-diagnosticos.csv");
for (const linea of fs.readFileSync(rutaRevision, "utf8").replace(/^﻿/, "").split(/\r?\n/).slice(1).filter(Boolean)) {
  const c = linea.slice(1, -1).split('";"');
  revision.set(c[0], (c[7] || c[4] || "").trim().toUpperCase());
}

// Médico de cada consulta: medicos-same.csv dice quién es cada usuario del SAME (cod_usrcreacion).
//   titular "si" = la cuenta dueña de zamorApp (medico_id); los demás quedan como médicos históricos, sin firma ni sello.
//   Si falta el archivo, se crea con los usuarios y sus consultas para completarlo; la carga real no sigue sin él.
const rutaMedicos = path.join(carpeta, "catalogos", "medicos-same.csv");
const medicosSame = new Map();
if (fs.existsSync(rutaMedicos)) {
  for (const linea of fs.readFileSync(rutaMedicos, "utf8").replace(/^\uFEFF/, "").split(/\r?\n/).slice(1).filter(Boolean)) {
    const [codigo, consultas, nombre_completo, cedula, mpps, titular] = linea.split(";").map((v) => v.replace(/^"|"$/g, "").trim());
    if (codigo && (nombre_completo || /^s/i.test(titular))) medicosSame.set(codigo, { nombre_completo, cedula: cedula || null, mpps: mpps || null, titular: /^s/i.test(titular ?? "") });
  }
}
const usuariosSame = [...agrupar(I.consultas, (c) => c.cod_usrcreacion || "(sin usuario)")].map(([u, cs]) => [u, cs.length]).sort((a, b) => b[1] - a[1]);
const sinMedico = usuariosSame.filter(([u]) => !medicosSame.has(u));
if (sinMedico.length) {
  fs.mkdirSync(path.dirname(rutaMedicos), { recursive: true });
  const filas = usuariosSame.map(([u, n]) => { const m = medicosSame.get(u); return [u, n, m?.nombre_completo ?? "", m?.cedula ?? "", m?.mpps ?? "", m ? (m.titular ? "si" : "no") : ""].join(";"); });
  fs.writeFileSync(rutaMedicos, "\uFEFFcodigo_usuario;consultas;nombre_completo;cedula;mpps;titular\n" + filas.join("\n") + "\n");
  console.log(`\nFalta decir quién es cada usuario del SAME en ${rutaMedicos}: ${sinMedico.map(([u, n]) => `${u} (${n} consultas)`).join(", ")}`);
  console.log("Escriba el nombre del médico y «si» en titular para su propia cuenta; los demás, «no».");
  if (!ENSAYO) { fs.rmSync(tmp, { recursive: true, force: true }); process.exit(1); }
}

// Empresas: mismo nombre sin la sucursal entre paréntesis = una empresa con sedes
const sinSucursal = (n) => n.replace(/\(.*\)/g, "").replace(/\s+/g, " ").trim();
const sucursal = (n) => (/\((.*)\)/.exec(n)?.[1] ?? n).replace(/^\s*sucursal\s*-?\s*/i, "").trim();
const gruposEmpresa = agrupar(I.empresas, (e) => norm(sinSucursal(e.nombre)));

// Códigos del Integral → listas de zamorApp
const MOTIVO = { PreEmpleo: "PRE", Periodico: "PER", PreVacacional: "PREV", PostVacacional: "POSV", Egreso: "EGR", PostReposo: "REI", ReinsercionPerm: "RIN",
  ReinsercionTemp: "RIN", ReubicacionTemp: "REU", PreNatal: "PRN", PostNatal: "PSN", ConsultaGral: "MOR", AccLaboral: "ACL", AccComun: "ACC", Emergencia: "EME",
  Telemedicina: "TEL", ConfReposo: "CRE", ConsultaEspe: "ESP", ConsultaExterna: "EXT", EvalEspeciales: "EVE" };
const MOTIVOS_NUEVOS = [["ESP", "Consulta especializada", "no_preventivo"], ["EXT", "Consulta externa", "no_preventivo"], ["EVE", "Evaluaciones especiales", "preventivo"]];
const TIPO_PAC = { Aspirante: "ASP", Empleado: "EMP", Obrero: "OBR", Contratado: "CON", Contratista: "CTA", Pasante: "PAS", Aprendiz: "APR", Familiar: "FAM", Particular: "PAR",
  Asociado: "ASO", Visitante: "VIS", Sobreviviente: "SOB" };
const TIPOS_NUEVOS = [["ASO", "Asociado"], ["VIS", "Visitante"], ["SOB", "Sobreviviente"]];
const APTITUD = { Elegible: "elegible", ElegibleRest: "elegible_con_restricciones", NoElegible: "no_elegible", EspResultado: "espera_resultados", Diferido: "diferido" };
const CAUSA = { EnfComun: "enfermedad_comun", AccComun: "accidente_comun", AccLaboral: "accidente_laboral", EnfOcupacional: "enfermedad_ocupacional", PreNatal: "prenatal", PostNatal: "postnatal" };
const ENTE = { SERM: "servicio_medico", PART: "particular", HOSP: "hospital", AMBU: "ambulatorio", IVSS: "ivss", CDI: "cdi" };
const FRECUENCIA = { "CADA 12 HRS": "Cada 12 horas", DIARIO: "Cada 24 horas", "CADA 8 HORAS": "Cada 8 horas", "CADA 6 HORAS": "Cada 6 horas", "CADA 4 HORAS": "Cada 4 horas",
  "15 DIAS": "Cada 15 días", STAT: "Dosis única", INTERDIARIO: "Cada 48 horas", MENSUAL: "Una vez al mes", "S.O.S": "Si hay dolor (SOS)", SOS: "Si hay dolor (SOS)" };
const frecuencia = (v) => FRECUENCIA[(v ?? "").trim().toUpperCase()] ?? (v ? v.charAt(0).toUpperCase() + v.slice(1).toLowerCase() : "");
const duracion = (v) => {
  const x = (v ?? "").trim().toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (!x) return "";
  if (x === "SOS") return "Mientras dure el síntoma";
  if (x === "1 SEMANA") return "7 días";
  const m = /^(\d+)\s*(DIA|DIAS|MES|MESES|SEMANA|SEMANAS)$/.exec(x);
  if (!m) return v.charAt(0).toUpperCase() + v.slice(1).toLowerCase();
  const n = Number(m[1]), u = m[2];
  return u.startsWith("DIA") ? `${n} ${n === 1 ? "día" : "días"}` : u.startsWith("MES") ? `${n} ${n === 1 ? "mes" : "meses"}` : `${n * 7} días`;
};
const HABITOS = [["alcohol", "Alcohol", "habalcohol"], ["tabaco", "Tabáquicos", "habtabaquico"], ["cafe", "Cafeicos", "habcafeico"],
  ["medicamentos", "Medicamentos", "habmedicamento"], ["estupefacientes", "Estupefacientes", "habestupefaciente"], ["actividad_fisica", "Actividad física", "habactividadfisica"]];

// ─── Base de datos ──────────────────────────────────────────
// El certificado del servidor se verifica contra la raíz de Supabase (supabase-ca-2021.crt, pública, vence en 2031):
// así nadie en la red puede hacerse pasar por la base y quedarse con la clave ni con las historias.
const ssl = { ca: fs.readFileSync(new URL("./supabase-ca-2021.crt", import.meta.url), "utf8"), rejectUnauthorized: true };
const cliente = new pg.Client(process.env.DATABASE_URL
  ? { connectionString: process.env.DATABASE_URL, ssl }
  : { host: "aws-1-us-west-2.pooler.supabase.com", port: 6543, user: "postgres.xgsoryzvyrsddgkxkzeb", password: process.env.PGPW, database: "postgres", ssl });
await cliente.connect();
const q = (s, p) => cliente.query(s, p);

// Inserta o actualiza por lotes. Al repetir la carga no se pisa lo que el usuario cambió en zamorApp:
//   modo "conservar":     si ya existe, se deja como está (catálogos, empresas, cargos)
//   modo "si_no_editado": se actualiza solo si nadie lo modificó en zamorApp después de la última carga
//   modo "actualizar":    siempre se actualiza (aptitud y reposo de consultas que sí se reescribieron)
// Devuelve { ids: Map(clave → id) de todas las filas, escritas: Set(claves insertadas o actualizadas) }
async function guardar(tabla, filas, tipos, { conflicto = "(org_id, origen, codigo_origen) where origen is not null", clave = "codigo_origen", modo = "actualizar" } = {}) {
  const cols = Object.keys(tipos);
  const set = modo === "conservar"
    ? `lote_importacion = ${tabla}.lote_importacion`
    : cols.filter((c) => c !== "org_id").map((c) => `${c} = excluded.${c}`).join(", ");
  const donde = modo === "si_no_editado"
    ? `where ${tabla}.origen = '${ORIGEN}' and ${tabla}.actualizado_en <= coalesce((select i.creado_en from public.importaciones i where i.id = ${tabla}.lote_importacion), '-infinity')`
    : "";
  const ids = new Map(), escritas = new Set();
  for (let i = 0; i < filas.length; i += 400) {
    const lote = filas.slice(i, i + 400);
    const { rows } = await q(
      `insert into ${tabla} (${cols.join(", ")})
       select ${cols.join(", ")} from jsonb_to_recordset($1::jsonb) as x(${cols.map((c) => `${c} ${tipos[c]}`).join(", ")})
       on conflict ${conflicto} do update set ${set} ${donde}
       returning id, ${clave}, xmax = 0 as nueva`,
      [JSON.stringify(lote)],
    ).catch((e) => { throw new Error(`${tabla}: ${e.message}`); });
    for (const r of rows) { ids.set(r[clave], r.id); if (modo !== "conservar" || r.nueva) escritas.add(r[clave]); }
    // Las que no se tocaron (editadas en zamorApp) también se necesitan para enlazar
    const faltan = lote.map((f) => f[clave]).filter((k) => !ids.has(k));
    if (faltan.length) {
      const { rows: otras } = await q(`select id, ${clave} from ${tabla} where org_id = $1 and ${clave}::text = any($2::text[])`, [lote[0].org_id, faltan]);
      for (const r of otras) ids.set(r[clave], r.id);
    }
  }
  return { ids, escritas };
}

try {
  await q("begin");
  const { rows: [org] } = await q("select o.id, m.usuario_id from public.organizaciones o join public.miembros m on m.org_id = o.id and m.rol = 'administrador' order by m.creado_en limit 1");
  const ORG = org.id, MEDICO = org.usuario_id;
  // Médicos históricos (los que no son la cuenta titular)
  // Médicos históricos (los que no son la cuenta titular); si el administrador ya los corrigió en zamorApp, se respetan
  const idsMed = new Map();
  for (const [u, m] of medicosSame) {
    if (m.titular) continue;
    const { rows: [h] } = await q(`insert into public.medicos_historicos (org_id, origen, codigo_origen, nombre_completo, cedula, mpps) values ($1, $2, $3, $4, $5, $6)
      on conflict (org_id, origen, codigo_origen) where origen is not null do update set origen = excluded.origen returning id`, [ORG, ORIGEN, `usr:${u}`, m.nombre_completo, m.cedula, m.mpps]);
    idsMed.set(`usr:${u}`, h.id);
  }
  const historicoDe = (u) => idsMed.get(`usr:${u}`) ?? null;
  // Vigencia de la aptitud: la misma regla que usa la consulta (Configuración › Organización)
  const { rows: [aj] } = await q("select coalesce((ajustes->>'meses_examen_periodico')::int, 12) meses from public.organizaciones where id = $1", [ORG]);
  const vigencia = (f) => { if (!f) return null; const d = new Date(f + "T12:00:00Z"); d.setUTCMonth(d.getUTCMonth() + aj.meses); return d.toISOString().slice(0, 10); };
  // Se apagan solo los disparadores de avisos, autoría y bitácora; sync_anotar y sync_version siguen (la PC recibe lo importado)
  const APAGAR = { "clinico.consultas": ["avisar_aptitud_al_cerrar", "bit_consultas", "proteger_autoria", "proteger_medico_historico", "revocar_enlaces_consulta", "validar_firma"],
    "clinico.aptitudes": ["avisar_aptitud", "bit_aptitudes"], "clinico.reposos": ["bit_reposos"], "public.trabajadores": ["bit_trabajadores"] };
  const disparadores = async (accion) => { for (const [t, ds] of Object.entries(APAGAR)) for (const d of ds) await q(`alter table ${t} ${accion} trigger ${d}`); };
  await disparadores("disable");
  const { rows: [lote] } = await q("insert into public.importaciones (org_id, origen, etapa, creado_por) values ($1, $2, 'completa', $3) returning id", [ORG, ORIGEN, MEDICO]);
  const base = { org_id: ORG, origen: ORIGEN, lote_importacion: lote.id };
  const T = { org_id: "uuid", origen: "text", codigo_origen: "text", lote_importacion: "uuid" };

  // Listas: motivos y tipos de paciente que existían en el Integral, y las 122 medicinas recetadas
  const items = async (lista) => new Map((await q("select codigo, id from public.lista_items where org_id = $1 and lista = $2", [ORG, lista])).rows.map((r) => [r.codigo, r.id]));
  await guardar("public.lista_items", [
    ...MOTIVOS_NUEVOS.map(([codigo, nombre, grupo], i) => ({ ...base, codigo_origen: `motivo:${codigo}`, lista: "motivo_consulta", codigo, nombre, grupo, orden: 200 + i, activo: true })),
    ...TIPOS_NUEVOS.map(([codigo, nombre], i) => ({ ...base, codigo_origen: `tipo:${codigo}`, lista: "tipo_paciente", codigo, nombre, grupo: null, orden: 200 + i, activo: true })),
  ], { ...T, lista: "text", codigo: "text", nombre: "text", grupo: "text", orden: "int", activo: "boolean" }, { modo: "conservar" });
  const motivos = await items("motivo_consulta"), tiposPac = await items("tipo_paciente");
  const oracion = (t) => { const x = t.trim().toLowerCase(); return x.charAt(0).toUpperCase() + x.slice(1); };
  await guardar("public.lista_items", I.limitacionCat.map((l, i) => ({ ...base, codigo_origen: `lim:${l.codigo}`, lista: "limitacion_ocupacional", codigo: `integral_${l.codigo}`,
    nombre: oracion(l.nombre), grupo: null, orden: 200 + i, activo: true })), { ...T, lista: "text", codigo: "text", nombre: "text", grupo: "text", orden: "int", activo: "boolean" }, { modo: "conservar" });
  await guardar("public.lista_items", I.notas.filter((n) => n.nota).map((n, i) => ({ ...base, codigo_origen: `nota:${n.codigo}`,
    lista: n.codtipo === "E" ? "recomendacion_empresa" : "recomendacion_paciente", codigo: `integral_${n.codigo}`, nombre: titulo(n.nombre), grupo: null, texto: n.nota, orden: 300 + i, activo: true })),
    { ...T, lista: "text", codigo: "text", nombre: "text", grupo: "text", texto: "text", orden: "int", activo: "boolean" }, { modo: "conservar" });
  await guardar("public.lista_items", I.especialidades.map((e, i) => ({ ...base, codigo_origen: `esp:${e.codigo}`, lista: "especialidad", codigo: `integral_${e.codigo}`,
    nombre: titulo(e.nombre), grupo: null, orden: 200 + i, activo: true })), { ...T, lista: "text", codigo: "text", nombre: "text", grupo: "text", orden: "int", activo: "boolean" }, { modo: "conservar" });
  const paraGrupos = agrupar(I.perfilesEx.filter((p) => p.tipo === "Paraclinico"), (p) => p.grupo_codigo);
  const examenesPara = new Map();
  for (const lista of paraGrupos.values()) for (const p of lista) if (!examenesPara.has(norm(p.examen))) examenesPara.set(norm(p.examen), { nombre: titulo(p.examen), grupo: titulo(p.grupo) });
  await guardar("public.lista_items", [...examenesPara].map(([k, v], i) => ({ ...base, codigo_origen: `para:${k}`, lista: "paraclinico", codigo: null, nombre: v.nombre, grupo: v.grupo, orden: 300 + i, activo: true })),
    { ...T, lista: "text", codigo: "text", nombre: "text", grupo: "text", orden: "int", activo: "boolean" }, { modo: "conservar" });
  await guardar("public.lista_items", [...paraGrupos.values()].map((g, i) => ({ ...base, codigo_origen: `perfil-para:${g[0].grupo_codigo}`, lista: "grupo_paraclinicos", codigo: `integral_${g[0].grupo_codigo}`,
    nombre: titulo(g[0].grupo), grupo: null, texto: g.sort((a, b) => Number(a.orden) - Number(b.orden)).map((p) => titulo(p.examen)).join("\n"), orden: 300 + i, activo: true })),
    { ...T, lista: "text", codigo: "text", nombre: "text", grupo: "text", texto: "text", orden: "int", activo: "boolean" }, { modo: "conservar" });
  const valores = (lista, xs) => [...new Set(xs.filter(Boolean))].map((nombre, i) => ({ ...base, codigo_origen: `${lista}:${norm(nombre)}`, lista, codigo: null, nombre, grupo: null, orden: 300 + i, activo: true }));
  const yaEn = async (lista) => new Set((await q("select lower(nombre) n from public.lista_items where org_id = $1 and lista = $2", [ORG, lista])).rows.map((r) => r.n));
  const fr = await yaEn("frecuencia_dosis"), du = await yaEn("duracion_tratamiento");
  await guardar("public.lista_items", [
    ...valores("frecuencia_dosis", I.tratamientos.map((t) => frecuencia(t.frecuencia)).filter((v) => !fr.has(v.toLowerCase()))),
    ...valores("duracion_tratamiento", I.tratamientos.map((t) => duracion(t.duracion)).filter((v) => !du.has(v.toLowerCase()))),
  ], { ...T, lista: "text", codigo: "text", nombre: "text", grupo: "text", orden: "int", activo: "boolean" }, { modo: "conservar" });
  const reubPorCons = new Map(I.reubicaciones.map((r) => [r.cod_consulta, r]));
  const refPorCons = agrupar(I.referencias, (r) => r.cod_consulta);
  const limPorCons = agrupar(I.limitaciones, (l) => l.cod_consulta);
  const limObs = new Map(I.limitacionObs.map((l) => [l.cod_consulta, l.observacion]));

  const masComun = (xs) => { const n = new Map(); for (const v of xs.filter(Boolean)) n.set(v, (n.get(v) ?? 0) + 1); return [...n].sort((a, b) => b[1] - a[1])[0]?.[0] ?? ""; };
  const tratPorMed = agrupar(I.tratamientos, (t) => t.cod_medicina);
  await guardar("public.lista_items", I.medicinas.map((m, i) => {
    const t = tratPorMed.get(m.codigo) ?? [];
    const campo = (k) => titulo(masComun(t.map((x) => x[k])) || "");
    const texto = [["concentracion", campo("concentracion")], ["presentacion", campo("presentacion")], ["via", campo("viaadministr")], ["dosis", campo("dosis")],
      ["frecuencia", frecuencia(masComun(t.map((x) => x.frecuencia)))], ["duracion", duracion(masComun(t.map((x) => x.duracion)))]].filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join("\n");
    return { ...base, codigo_origen: `med:${m.codigo}`, lista: "medicina", codigo: `integral_${m.codigo}`, nombre: titulo(m.nombre), grupo: nulo(m.laboratorio?.replace(/^\*$/, "")), texto, orden: 300 + i, activo: true };
  }), { ...T, lista: "text", codigo: "text", nombre: "text", grupo: "text", texto: "text", orden: "int", activo: "boolean" }, { modo: process.env.REFRESCAR_MEDICINAS ? "actualizar" : "conservar" }); // REFRESCAR_MEDICINAS=1 rehace sus indicaciones

  // Empresas, sedes y dependencias
  const empresaDe = new Map(), sedeDe = new Map();
  const filasEmpresa = [...gruposEmpresa.values()].map((g) => ({ ...base, codigo_origen: `emp:${norm(sinSucursal(g[0].nombre))}`, razon_social: sinSucursal(g[0].nombre),
    rif: g[0].rif || `SIN-RIF-${g[0].codigo}`, direccion: nulo(g[0].direccion), telefono: [g[0].telf01, g[0].telf02].filter(Boolean).join(" / ") || null, activa: true }));
  const { ids: idsEmpresa } = await guardar("public.empresas", filasEmpresa, { ...T, razon_social: "text", rif: "text", direccion: "text", telefono: "text", activa: "boolean" }, { modo: "conservar" });
  const filasSede = [];
  for (const g of gruposEmpresa.values()) {
    const idEmp = idsEmpresa.get(`emp:${norm(sinSucursal(g[0].nombre))}`);
    for (const e of g) {
      empresaDe.set(e.codigo, idEmp);
      if (g.length > 1) filasSede.push({ ...base, codigo_origen: `sede:${e.codigo}`, empresa_id: idEmp, nombre: titulo(sucursal(e.nombre)), direccion: nulo(e.direccion), activa: true });
    }
  }
  const { ids: idsSede } = await guardar("public.sedes", filasSede, { ...T, empresa_id: "uuid", nombre: "text", direccion: "text", activa: "boolean" }, { modo: "conservar" });
  for (const e of I.empresas) if (idsSede.has(`sede:${e.codigo}`)) sedeDe.set(e.codigo, idsSede.get(`sede:${e.codigo}`));
  const { ids: idsDep } = await guardar("public.dependencias", I.dependencias.filter((d) => empresaDe.has(d.cod_empresa)).map((d) => ({ ...base, codigo_origen: `dep:${d.cod_empresa}:${d.codigo}`,
    empresa_id: empresaDe.get(d.cod_empresa), sede_id: sedeDe.get(d.cod_empresa) ?? null, nombre: titulo(d.nombre), activa: true })),
    { ...T, empresa_id: "uuid", sede_id: "uuid", nombre: "text", activa: "boolean" }, { modo: "conservar" });

  // Puestos: un cargo por empresa
  const claveCargo = (emp, cargo) => `puesto:${emp}:${norm(cargo)}`;
  const cargos = new Map();
  for (const p of I.pacientes) if (p.cargo && empresaDe.has(p.cod_empresa)) cargos.set(claveCargo(empresaDe.get(p.cod_empresa), p.cargo), { emp: empresaDe.get(p.cod_empresa), nombre: p.cargo });
  const { ids: idsPuesto } = await guardar("public.puestos", [...cargos].map(([k, v]) => ({ ...base, codigo_origen: k, empresa_id: v.emp, nombre: titulo(v.nombre.trim()), activo: true })),
    { ...T, empresa_id: "uuid", nombre: "text", activo: "boolean" }, { modo: "conservar" });

  // Pacientes
  const profesion = new Map(I.profesiones.map((p) => [p.codigo, p.nombre]));
  const consultasPorPac = agrupar(I.consultas, (c) => c.cod_paciente);
  const pacientes = I.pacientes.filter((p) => empresaDe.has(p.cod_empresa) && p.cedula);
  const { ids: idsPac } = await guardar("public.trabajadores", pacientes.map((p) => {
    const ultima = (consultasPorPac.get(p.historia) ?? []).sort((a, b) => b.fecha.localeCompare(a.fecha))[0];
    const estado = p.codstatus === "Inactivo" || ultima?.codmotivcons === "Egreso" ? "egresado" : p.tipo === "Aspirante" && !ultima ? "aspirante" : "activo";
    return { ...base, codigo_origen: `pac:${p.historia}`, empresa_id: empresaDe.get(p.cod_empresa), sede_id: sedeDe.get(p.cod_empresa) ?? null,
      dependencia_id: idsDep.get(`dep:${p.cod_empresa}:${p.cod_dependencia}`) ?? null, puesto_id: p.cargo ? idsPuesto.get(claveCargo(empresaDe.get(p.cod_empresa), p.cargo)) ?? null : null,
      numero_historia: Number(p.historia) || null, cedula: p.cedula.trim(), nombres: titulo(p.nombre), apellidos: titulo(p.apellido), sexo: p.sexo === "F" ? "F" : "M",
      fecha_nacimiento: fecha(p.fechanacimiento), profesion: profesion.get(p.cod_profesion) ?? null, tipo_paciente_id: tiposPac.get(TIPO_PAC[p.tipo]) ?? null,
      ficha: nulo(p.codtrabajador), fecha_ingreso: fechaDMA(p.fechaingresoemp), turno: nulo(p.turnotrabajo),
      grupo_sanguineo: p.gruposanguineo && p.gruposanguineo !== "Desconocido" ? p.gruposanguineo : null,
      telefono: [p.telefonocelular, p.telefonocasa].filter(Boolean).join(" / ") || null, correo: nulo(p.email), direccion: nulo(p.direccioncasa), estado };
  }), { ...T, empresa_id: "uuid", sede_id: "uuid", dependencia_id: "uuid", puesto_id: "uuid", numero_historia: "int", cedula: "text", nombres: "text", apellidos: "text",
    sexo: "public.sexo", fecha_nacimiento: "date", profesion: "text", tipo_paciente_id: "uuid", ficha: "text", fecha_ingreso: "date", turno: "text", grupo_sanguineo: "text",
    telefono: "text", correo: "text", direccion: "text", estado: "public.estado_trabajador" }, { conflicto: "(org_id, cedula)", clave: "cedula", modo: "si_no_editado" });
  const pacPorHistoria = new Map(pacientes.map((p) => [p.historia, p]));
  const idTrab = (historia) => { const p = pacPorHistoria.get(historia); return p ? idsPac.get(p.cedula.trim()) : null; };

  // Antecedentes y hábitos del paciente (en el Integral son de la ficha; aquí se copian a cada consulta)
  const antPorPac = agrupar(I.antecedentes, (a) => a.cod_paciente);
  const antecedentesDe = (historia) => (antPorPac.get(historia) ?? []).map((a, i) => ({ id: `integral-${historia}-${i}`,
    nombre: [a.tipo.replace(/^[A-Z]\.\s*/, ""), a.antecedente].filter(Boolean).join(": "), grupo: /familiar/i.test(a.tipo) ? "familiar" : "personal", observacion: a.observacion || "" }));
  const habitosDe = (p) => [...HABITOS.map(([clave, nombre, campo]) => ({ clave, nombre,
    valor: p?.[campo] === "1" ? ["Sí", p[`${campo}val1`], p[`${campo}val2`]].filter(Boolean).join(", ") : p ? "Niega" : "" })),
    { clave: "sueno", nombre: "Sueño", valor: p?.habsueno ?? "" }, { clave: "alimentacion", nombre: "Alimentación", valor: p?.habalimenticio ?? "" }];

  // Consultas
  const exPorCons = agrupar(I.examenes, (e) => e.cod_consulta);
  const trPorCons = agrupar(I.tratamientos, (t) => t.cod_consulta);
  const filas = (lista) => {
    const vistos = new Set();
    return lista.sort((a, b) => Number(a.ordenexamen) - Number(b.ordenexamen)).filter((e) => !vistos.has(e.cod_examen) && vistos.add(e.cod_examen))
      .map((e) => ({ clave: `integral_${e.cod_examen}`, nombre: titulo(e.nombre), valor: [e.resultado, e.observacion].filter(Boolean).join(". "), normal: e.valordefecto || "" }));
  };
  const consultas = I.consultas.filter((c) => idTrab(c.cod_paciente) && empresaDe.has(c.cod_empresa));
  const { ids: idsCons, escritas: consEscritas } = await guardar("clinico.consultas", consultas.map((c) => {
    const ex = exPorCons.get(c.codigo) ?? [];
    const p = pacPorHistoria.get(c.cod_paciente);
    return { ...base, codigo_origen: `cons:${c.codigo}`, empresa_id: empresaDe.get(c.cod_empresa), trabajador_id: idTrab(c.cod_paciente), medico_id: MEDICO, medico_historico_id: historicoDe(c.cod_usrcreacion || "(sin usuario)"),
      fecha: fecha(c.fecha), hora_inicio: marca(c.horainicio) ?? marca(c.fecha), hora_cierre: marca(c.horacierre), tipo: c.codtipo === "Sucesiva" ? "sucesiva" : "primera",
      motivo_id: motivos.get(MOTIVO[c.codmotivcons]) ?? null, dependencia_id: idsDep.get(`dep:${c.cod_empresa}:${c.cod_dependencia}`) ?? null,
      puesto_id: c.cargo ? idsPuesto.get(claveCargo(empresaDe.get(c.cod_empresa), c.cargo)) ?? null : null,
      motivo_texto: nulo(c.motivoconsulta), enfermedad_actual: nulo(c.enfermedadactual),
      habitos: habitosDe(p), antecedentes: antecedentesDe(c.cod_paciente),
      examen_funcional: filas(ex.filter((e) => e.tipoexamen === "Funcional")), examen_fisico: filas(ex.filter((e) => e.tipoexamen === "Fisico")),
      paraclinicos: ex.filter((e) => e.tipoexamen === "Paraclinico").map((e) => ({ id: `integral_${e.cod_examen}`, nombre: titulo(e.nombre), grupo: e.grupo ? titulo(e.grupo) : null,
        resultado: [e.resultado, e.observacion].filter(Boolean).join(". ") })),
      signos_vitales: {},
      tratamiento: (trPorCons.get(c.codigo) ?? []).map((t) => ({ medicina: titulo(t.medicina || ""), concentracion: t.concentracion, presentacion: titulo(t.presentacion),
        dosis: t.dosis, frecuencia: frecuencia(t.frecuencia), duracion: duracion(t.duracion), via: titulo(t.viaadministr), observacion: t.obspaciente })),
      indicaciones: unir(c.otrasindicaciones, c.indicacionlibre, c.recipelibre),
      conclusiones: unir(c.impdiagnostica && `Impresión diagnóstica: ${c.impdiagnostica}`, c.conclusion, c.obsgeneral,
        !APTITUD[c.codaptitud] && limPorCons.has(c.codigo) ? `Restricciones: ${limPorCons.get(c.codigo).map((l) => oracion(l.nombre)).join("; ")}` : null,
        !APTITUD[c.codaptitud] ? limObs.get(c.codigo) : null,
        reubPorCons.has(c.codigo) ? (() => { const r = reubPorCons.get(c.codigo); return [`Reubicación laboral: ${r.reubicado === "S" ? "sí" : "no"}.`, r.resultado && `Resultado: ${oracion(r.resultado)}.`, r.observacion, r.obs_resultado].filter(Boolean).join(" "); })() : null),
      interconsultas: (refPorCons.get(c.codigo) ?? []).map((r) => ({ especialidad: r.especialidad ? titulo(r.especialidad) : "", motivo: r.cuerpo ?? "" })),
      recomendaciones_empresa: nulo(c.recomendaemp), recomendaciones_trabajador: nulo(c.recomendapac), observacion_privada: nulo(c.obsprivada),
      sano: c.adultosano === "S", estado: "cerrada" };
  }), { ...T, empresa_id: "uuid", trabajador_id: "uuid", medico_id: "uuid", medico_historico_id: "uuid", fecha: "date", hora_inicio: "timestamptz", hora_cierre: "timestamptz", tipo: "text",
    motivo_id: "uuid", dependencia_id: "uuid", puesto_id: "uuid", motivo_texto: "text", enfermedad_actual: "text", habitos: "jsonb", antecedentes: "jsonb",
    examen_funcional: "jsonb", examen_fisico: "jsonb", paraclinicos: "jsonb", signos_vitales: "jsonb", tratamiento: "jsonb", interconsultas: "jsonb", indicaciones: "text", conclusiones: "text",
    recomendaciones_empresa: "text", recomendaciones_trabajador: "text", observacion_privada: "text", sano: "boolean", estado: "text" }, { modo: "si_no_editado" });

  // Diagnósticos: se reemplazan los importados de cada consulta
  const escrita = (codigo) => consEscritas.has(`cons:${codigo}`);
  const idsConsLista = [...consEscritas].map((k) => idsCons.get(k));
  await q("delete from clinico.diagnosticos where consulta_id = any($1::uuid[]) and codigo_origen is not null", [idsConsLista]);
  const nombreDiag = new Map(I.diagnosticos.map((d) => [d.codigo, d.nombre]));
  const porCons = new Map(consultas.map((c) => [c.codigo, c]));
  const primero = new Set();
  const filasDiag = I.consultaDiag.filter((d) => escrita(d.cod_consulta)).map((d) => {
    const c = porCons.get(d.cod_consulta);
    const principal = !primero.has(d.cod_consulta) && primero.add(d.cod_consulta);
    return { org_id: ORG, consulta_id: idsCons.get(`cons:${d.cod_consulta}`), codigo_origen: `diag:${d.cod_consulta}:${d.cod_diagnost}`, lote_importacion: lote.id,
      cie10: revision.get(d.cod_diagnost) || "R69", descripcion: titulo(nombreDiag.get(d.cod_diagnost) ?? "Diagnóstico sin nombre"), sistema: nulo(d.aparatsistem),
      origen: c?.codorigendiagnostico === "Trabajo" ? "ocupacional" : "comun", principal: Boolean(principal) };
  });
  for (let i = 0; i < filasDiag.length; i += 400) {
    await q(`insert into clinico.diagnosticos (org_id, consulta_id, codigo_origen, lote_importacion, cie10, descripcion, sistema, origen, principal)
             select * from jsonb_to_recordset($1::jsonb) as x(org_id uuid, consulta_id uuid, codigo_origen text, lote_importacion uuid, cie10 text, descripcion text, sistema text, origen text, principal boolean)`,
      [JSON.stringify(filasDiag.slice(i, i + 400))]);
  }

  // Aptitud
  await guardar("clinico.aptitudes", consultas.filter((c) => APTITUD[c.codaptitud] && escrita(c.codigo)).map((c) => ({ ...base, codigo_origen: `apt:${c.codigo}`,
    consulta_id: idsCons.get(`cons:${c.codigo}`), trabajador_id: idTrab(c.cod_paciente), clasificacion: APTITUD[c.codaptitud], observacion: unir(c.obsaptitud, limObs.get(c.codigo)), vigente_hasta: vigencia(fecha(c.fecha)),
    limitaciones: (limPorCons.get(c.codigo) ?? []).map((l) => oracion(l.nombre)), restricciones: (limPorCons.get(c.codigo) ?? []).map((l) => oracion(l.nombre)),
    // Ya avisada: una aptitud histórica no debe avisar a la empresa al reabrir o cerrar la consulta
    emitida_en: marca(c.horacierre) ?? marca(c.fecha), avisada_en: marca(c.horacierre) ?? marca(c.fecha) })),
    { ...T, consulta_id: "uuid", trabajador_id: "uuid", clasificacion: "text", observacion: "text", vigente_hasta: "date", limitaciones: "jsonb", restricciones: "text[]", emitida_en: "timestamptz", avisada_en: "timestamptz" }, { conflicto: "(consulta_id)", clave: "consulta_id" });

  // Reposos
  await q("delete from clinico.reposos where consulta_id = any($1::uuid[]) and origen = $2", [idsConsLista, ORIGEN]);
  const filasReposo = consultas.filter((c) => escrita(c.codigo) && c.reposo === "1" && fecha(c.fechareposodesde) && fecha(c.fechareposohasta)).map((c) => {
    const desde = fecha(c.fechareposodesde), hasta = fecha(c.fechareposohasta);
    return { ...base, codigo_origen: `rep:${c.codigo}`, consulta_id: idsCons.get(`cons:${c.codigo}`), trabajador_id: idTrab(c.cod_paciente),
      causa: CAUSA[c.codmotivoreposo] ?? "enfermedad_comun", ente_emisor: ENTE[c.codenteemisorreposo] ?? "servicio_medico", desde, hasta: hasta < desde ? desde : hasta,
      reintegro: fecha(c.fechareposoingreso), cie10: null, validado_ivss: c.reposovalidadoivss === "S" };
  });
  await guardar("clinico.reposos", filasReposo, { ...T, consulta_id: "uuid", trabajador_id: "uuid", causa: "text", ente_emisor: "text", desde: "date", hasta: "date",
    reintegro: "date", cie10: "text", validado_ivss: "boolean" });

  // Historia laboral (empleos anteriores)
  const lista = (v) => (v ?? "").split("|").map((x) => x.trim()).filter(Boolean);
  const niega = (v) => (v && v.toUpperCase() !== "NIEGA" ? v : v ? "Niega" : null);
  // Un paciente puede tener varios empleos anteriores: el primero conserva la clave de siempre (hl:historia), los demás llevan :n
  const empleosDe = new Map();
  const claveEmpleo = (h) => { const n = empleosDe.get(h.cod_paciente) ?? 0; empleosDe.set(h.cod_paciente, n + 1); return n ? `hl:${h.cod_paciente}:${n}` : `hl:${h.cod_paciente}`; };
  const filasHist = I.historiaLab.filter((h) => idTrab(h.cod_paciente) && h.empresa).map((h) => ({ ...base, codigo_origen: claveEmpleo(h), trabajador_id: idTrab(h.cod_paciente),
    empresa: titulo(h.empresa), industria: nulo(h.industria) && titulo(h.industria), cargo: nulo(h.cargo) && titulo(h.cargo), descripcion: nulo(h.descripcargo), duracion: nulo(h.duracion), horario: nulo(h.horario),
    condiciones: Object.fromEntries([["ambiente", h.codscondambtraant], ["actividad", h.codscondacttraant], ["traslado", h.codscondtratraant], ["carga", h.codscondrietraant]].filter(([, v]) => v)),
    riesgos: Object.fromEntries([["fisico", h.codsriefistraant], ["quimico", h.codsriequitraant], ["mecanico", h.codsriemectraant], ["disergonomico", h.codsriedistraant],
      ["biologico", h.codsriebiotraant], ["psicosocial", h.codsriepsitraant]].map(([k, v]) => [k, lista(v)]).filter(([, v]) => v.length)),
    epp: nulo(h.equiprottraant), problemas_salud: niega(h.problemasalud), accidentes: niega(h.accidetrabaj), enfermedades: niega(h.enfermocupac),
    observaciones: unir(h.obscondtrabaant, h.obsriesexpueant) }));
  await guardar("clinico.historia_laboral", filasHist, { ...T, trabajador_id: "uuid", empresa: "text", industria: "text", cargo: "text", descripcion: "text", duracion: "text",
    horario: "text", condiciones: "jsonb", riesgos: "jsonb", epp: "text", problemas_salud: "text", accidentes: "text", enfermedades: "text", observaciones: "text" }, { modo: "si_no_editado" });

  // Accidentes laborales (eventos) ligados a la consulta y al trabajador
  const hora = (h) => (h && /\d{2}:\d{2}/.test(h) ? h.slice(11, 19) : "00:00:00");
  const filasAcc = I.accidentes.filter((a) => idsCons.has(`cons:${a.cod_consulta}`) && fecha(a.fecha)).map((a) => {
    const c = porCons.get(a.cod_consulta);
    return { ...base, codigo_origen: `acc:${a.cod_consulta}`, empresa_id: empresaDe.get(c.cod_empresa), trabajador_id: idTrab(c.cod_paciente), consulta_id: idsCons.get(`cons:${a.cod_consulta}`),
      tipo: "accidente", subtipo: /it[ií]nere/i.test(a.origen) ? "in_itinere" : "trabajo", fecha_hora: `${fecha(a.fecha)}T${hora(a.hora)}-04:00`, lugar: nulo(a.lugar),
      naturaleza_lesion: nulo(a.tipolesion), testigos: a.supervisor ? `Supervisor: ${a.supervisor}` : null, descripcion: nulo(a.declaracion),
      fecha_declaracion: fecha(a.fechadeclaracion) ? `${fecha(a.fechadeclaracion)}T${hora(a.horadeclaracion)}-04:00` : null,
      estado: fecha(a.fechadeclaracion) ? "declarado" : "abierto", creado_por: MEDICO };
  });
  for (const d of ["bit_eventos", "heredar_potencial_discapacidad"]) await q(`alter table public.eventos disable trigger ${d}`);
  await guardar("public.eventos", filasAcc, { ...T, empresa_id: "uuid", trabajador_id: "uuid", consulta_id: "uuid", tipo: "text", subtipo: "text", fecha_hora: "timestamptz", lugar: "text",
    naturaleza_lesion: "text", testigos: "text", descripcion: "text", fecha_declaracion: "timestamptz", estado: "text", creado_por: "uuid" }, { modo: "si_no_editado" });
  for (const d of ["bit_eventos", "heredar_potencial_discapacidad"]) await q(`alter table public.eventos enable trigger ${d}`);

  // Riesgos de cada cargo: unión de lo marcado en las fichas de sus trabajadores (solo si el puesto aún no tiene riesgos)
  const riesgosPuesto = new Map();
  for (const p of I.riesgosAct) {
    const id = empresaDe.has(p.cod_empresa) && idsPuesto.get(claveCargo(empresaDe.get(p.cod_empresa), p.cargo));
    if (!id) continue;
    const r = riesgosPuesto.get(id) ?? {};
    for (const [k, campo] of [["fisico", "codsriefistraact"], ["quimico", "codsriequitraact"], ["mecanico", "codsriemectraact"], ["disergonomico", "codsriedistraact"], ["biologico", "codsriebiotraact"], ["psicosocial", "codsriepsitraact"]])
      for (const v of lista(p[campo])) r[k] = [...new Set([...(r[k] ?? []), v])];
    riesgosPuesto.set(id, r);
  }
  for (const [id, r] of riesgosPuesto) await q("update public.puestos set riesgos = $1 where id = $2 and (riesgos is null or riesgos = '{}'::jsonb)", [r, id]);

  const resumen = { empresas: idsEmpresa.size, sedes: idsSede.size, dependencias: idsDep.size, puestos: idsPuesto.size, medicinas: I.medicinas.length,
    pacientes: idsPac.size, consultas: idsCons.size, consultas_reescritas: consEscritas.size, diagnosticos: filasDiag.length, aptitudes: consultas.filter((c) => APTITUD[c.codaptitud]).length, reposos: filasReposo.length, historia_laboral: filasHist.length, limitaciones: I.limitacionCat.length, textos: I.notas.length, accidentes: filasAcc.length,
    referencias: I.referencias.length, especialidades: I.especialidades.length, perfiles_paraclinicos: paraGrupos.size, puestos_con_riesgos: riesgosPuesto.size };
  await q("update public.importaciones set resumen = $1 where id = $2", [resumen, lote.id]);
  await disparadores("enable");
  await q(ENSAYO ? "rollback" : "commit");
  console.log(ENSAYO ? "\nENSAYO (no se guardó nada):" : `\nCARGA GUARDADA · lote ${lote.id}:`, resumen);
  const sinEmpresa = I.pacientes.length - pacientes.length, consSinPac = I.consultas.length - consultas.length;
  if (sinEmpresa || consSinPac) console.log(`Omitidos: ${sinEmpresa} pacientes sin empresa o cédula, ${consSinPac} consultas sin paciente o empresa`);
} catch (e) {
  await q("rollback").catch(() => {});
  console.error("ERROR, no se guardó nada:", e.message);
  process.exitCode = 1;
} finally {
  await cliente.end();
  fs.rmSync(tmp, { recursive: true, force: true });
}
