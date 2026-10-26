// Ensayo de la Etapa 1 (catálogos del Sistema Integral). Lee los CSV exportados en la PC y produce,
// también en la PC, los archivos para revisar antes de cargar nada:
//   revision-diagnosticos.csv  diagnósticos usados con el CIE-10 sugerido y la confianza
//   medicinas-usadas.csv       medicinas recetadas con su presentación, dosis, vía y frecuencia más comunes
//   propuesta-empresas.csv             empresas agrupadas (FORUM y similares quedan como una empresa con sedes)
//   resumen.txt                conteos
// No se conecta a internet ni a Supabase.
// Uso: node scripts/importar-integral/transformar-catalogos.mjs ["<carpeta de catalogos>"]
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const carpeta = process.argv[2] ?? path.join(os.homedir(), "Documents", "zamorApp Importacion", "integral", "catalogos");
const cie10 = JSON.parse(fs.readFileSync(new URL("../../supabase/datos/cie10.json", import.meta.url), "utf8"));

const leer = (nombre) => {
  const [cab, ...filas] = fs.readFileSync(path.join(carpeta, `${nombre}.csv`), "utf8").replace(/^﻿/, "").split(/\r?\n/).filter(Boolean);
  const cols = cab.split("|");
  return filas.map((l) => Object.fromEntries(l.split("|").map((v, i) => [cols[i], v === "NULL" ? "" : v.trim()])));
};
const csv = (filas) => filas.map((f) => f.map((v) => `"${String(v ?? "").replaceAll('"', '""')}"`).join(";")).join("\r\n");
const escribir = (nombre, cabecera, filas) => fs.writeFileSync(path.join(carpeta, nombre), "﻿" + csv([cabecera, ...filas]));

const norm = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
const VACIAS = new Set("de del la las el los y o en a con por sin no especificado especificada otros otras otro otra".split(" "));
const fichas = (s) => new Set(norm(s).split(" ").filter((p) => p.length > 2 && !VACIAS.has(p)));

// ─── Diagnósticos ───────────────────────────────────────────
const catalogo = cie10.map(([codigo, descripcion]) => ({ codigo, descripcion, n: norm(descripcion), f: fichas(descripcion) }));
const porTexto = new Map(catalogo.map((c) => [c.n, c]));
// Reglas para los diagnósticos propios más usados, donde el parecido de texto se equivoca
// (ej. "hipertensión arterial controlada" se parecía más a "hipertensión pulmonar")
const REGLAS = [
  [/crisis hipertensiva|hipertension arterial/, "I10"], [/sindrome viral|virosis/, "B34.9"], [/sindrome emetico/, "R11"],
  [/discopatia|degenerativa de disco/, "M51.3"], [/cervicobraquialgia/, "M53.1"], [/cervicodorsalgia|dorsalgia/, "M54.8"],
  [/ciatalgia|ciatica/, "M54.3"], [/lumbalgia|lumbago/, "M54.5"], [/varicocele/, "I86.1"], [/varices/, "I83.9"],
  [/ansiedad/, "F41.9"], [/gonalgia|omalgia|artralgia|hombro doloroso/, "M25.5"], [/esguince|esguinse/, "S93.4"],
  [/infeccion urinaria/, "N39.0"], [/migran/, "G43.9"], [/intoxicacion por (fosfina|insect)/, "T60.9"],
  [/hiperreactividad bronquial/, "J98.8"], [/dermat\w+ atopica/, "L20.9"], [/^embarazo/, "Z33"], [/cardiopatia/, "I51.9"],
  [/luxacion .*recidivante/, "M24.4"], [/hernia inguinal/, "K40.9"], [/hernia epigastrica/, "K43.9"], [/hernia umbilical|anillo umbilical/, "K42.9"],
  [/vertiginoso|vertigo/, "R42"], [/deshidratacion/, "E86"], [/sindrome metabolico/, "E88.8"], [/litiasis renal/, "N20.0"],
  [/^anemia/, "D64.9"], [/infeccion respiratoria baja/, "J22"], [/infeccion respiratoria alta/, "J06.9"], [/sincope/, "R55"],
  [/onicocriptosis|una encarnada/, "L60.0"], [/quervain/, "M65.4"], [/hipersensibilidad/, "T78.4"], [/obesidad/, "E66.9"],
];
const porCodigo = new Map(catalogo.map((c) => [c.codigo, c]));

function sugerir(nombre) {
  const exacta = porTexto.get(norm(nombre));
  if (exacta) return { c: exacta, puntaje: 1 };
  const regla = REGLAS.find(([r, codigo]) => r.test(norm(nombre)) && porCodigo.has(codigo));
  if (regla) return { c: porCodigo.get(regla[1]), puntaje: 0.9 };
  const f = fichas(nombre);
  let mejor = null, puntaje = 0;
  for (const c of catalogo) {
    let comun = 0;
    for (const x of f) if (c.f.has(x)) comun++;
    if (!comun) continue;
    const p = (2 * comun) / (f.size + c.f.size); // Dice
    if (p > puntaje || (p === puntaje && mejor && c.codigo.length > mejor.codigo.length)) { mejor = c; puntaje = p; }
  }
  return { c: mejor, puntaje };
}
const confianza = (p) => (p === 1 ? "exacta" : p === 0.9 ? "alta (regla)" : p >= 0.75 ? "alta" : p >= 0.5 ? "media" : "baja - revisar");

const diagnosticos = leer("diagnosticos");
const usados = diagnosticos.filter((d) => Number(d.usos) > 0).sort((a, b) => Number(b.usos) - Number(a.usos));
const revision = usados.map((d) => {
  const { c, puntaje } = sugerir(d.nombre);
  return [d.codigo, d.nombre, d.categoria, d.usos, c?.codigo ?? "", c?.descripcion ?? "", confianza(puntaje), ""];
});
escribir("revision-diagnosticos.csv", ["codigo_integral", "diagnostico_integral", "categoria", "veces_usado", "cie10_sugerido", "descripcion_cie10", "confianza", "cie10_corregido"], revision);

// ─── Medicinas usadas ───────────────────────────────────────
const masComun = (lista) => {
  const n = new Map();
  for (const v of lista.filter(Boolean)) n.set(v.toUpperCase(), (n.get(v.toUpperCase()) ?? 0) + 1);
  return [...n].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
};
const tratamientos = leer("tratamientos");
const medicinas = leer("medicinas").filter((m) => Number(m.usos) > 0).sort((a, b) => Number(b.usos) - Number(a.usos));
escribir("medicinas-usadas.csv", ["codigo_integral", "nombre", "laboratorio", "veces_recetada", "presentacion", "concentracion", "dosis", "via", "frecuencia", "duracion"],
  medicinas.map((m) => {
    const t = tratamientos.filter((x) => x.cod_medicina === m.codigo);
    return [m.codigo, m.nombre, m.laboratorio.replace(/^\*$/, ""), m.usos, masComun(t.map((x) => x.presentacion)), masComun(t.map((x) => x.concentracion)),
      masComun(t.map((x) => x.dosis)), masComun(t.map((x) => x.viaadministr)), masComun(t.map((x) => x.frecuencia)), masComun(t.map((x) => x.duracion))];
  }));

// ─── Empresas: las que comparten RIF (o la primera palabra del nombre) quedan como una con sedes ──
const empresas = leer("empresas");
const dependencias = leer("dependencias");
// Mismo nombre sin lo que va entre paréntesis = misma empresa (el RIF de FORUM viene escrito de dos formas)
const sinSucursal = (n) => n.replace(/\(.*\)/g, "").replace(/\s+/g, " ").trim();
const grupo = (e) => norm(sinSucursal(e.nombre));
const grupos = new Map();
for (const e of empresas) grupos.set(grupo(e), [...(grupos.get(grupo(e)) ?? []), e]);
escribir("propuesta-empresas.csv", ["empresa_zamorapp", "rif", "codigo_integral", "nombre_integral", "queda_como", "dependencias"],
  [...grupos.values()].flatMap((g) => g.map((e, i) => [sinSucursal(g[0].nombre), e.rif, e.codigo, e.nombre, g.length > 1 ? (i === 0 ? "empresa" : "sede") : "empresa",
    dependencias.filter((d) => d.cod_empresa === e.codigo).length])));

const cuenta = (c) => revision.filter((r) => r[6].startsWith(c)).length;
const resumen = `Ensayo Etapa 1 · ${new Date().toLocaleString("es-VE")}
Diagnósticos usados: ${usados.length} (de ${diagnosticos.length} en el catálogo)
  CIE-10 exacta: ${cuenta("exacta")} · alta: ${cuenta("alta")} · media: ${cuenta("media")} · baja (revisar): ${cuenta("baja - revisar")}
Medicinas recetadas: ${medicinas.length} (de ${leer("medicinas").length} en el catálogo)
Empresas: ${empresas.length} en el Integral → ${grupos.size} en zamorApp; dependencias: ${dependencias.length}
Nada se ha cargado a zamorApp.`;
fs.writeFileSync(path.join(carpeta, "resumen.txt"), resumen);
console.log(resumen);
