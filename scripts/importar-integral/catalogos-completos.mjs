// Cargador puntual: pasa a zamorApp el catálogo COMPLETO de diagnósticos y medicinas del SAME. La carga del 26/10 solo
// pasó los que se habían usado en alguna consulta; el buscador de la consulta debe encontrar también los demás.
// - Diagnósticos → lista «diagnostico» (Mis diagnósticos). Código CIE-10: el revisado en revision-diagnosticos.csv o,
//   si no está, el del catálogo CIE-10 con el MISMO nombre exacto. Si no hay ninguno, queda sin código (sale «sin CIE-10»;
//   nunca un código adivinado).
// - Medicinas → lista «medicina» (vademécum), con el laboratorio. Las ya cargadas no se tocan (guardan sus indicaciones).
// Solo se agrega lo que falta: si ya existe uno con el mismo nombre en la lista, se salta.
// El SAME solo se LEE: 2 consultas pequeñas (bcp), una a la vez, con NOLOCK y solo con 1 GB libre.
// Por defecto es un ENSAYO (todo se deshace al final). Para guardar: --guardar, con el sí de Cesar.
// Uso en la PC de Cesar: powershell -File scripts\importar-integral\catalogos-completos.ps1 [-Guardar]
// Informe (solo cifras): %USERPROFILE%\.zamorapp\catalogos-completos.md
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import pg from "pg";
import { configuracion } from "../conexion-segura.mjs";

const GUARDAR = process.argv.includes("--guardar");
const ORIGEN = "integral";
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "integral-catalogos-"));

// ─── Lectura del SAME (consultas fijas: ningún dato entra en el texto de la consulta) ───
function leer(nombre, columnas, desde) {
  const libre = os.freemem();
  if (libre < 1024 ** 3) throw new Error(`Memoria libre ${Math.round(libre / 1024 ** 2)} MB: hace falta 1 GB para leer el SAME. No se hizo nada.`);
  const archivo = path.join(tmp, `${nombre}.dat`);
  execFileSync("bcp", [`select ${columnas.join(", ")} from ${desde}`, "queryout", archivo, "-S", ".", "-T", "-d", "Integral", "-w", "-t", "<|>", "-r", "<#>\\n"],
    { stdio: "pipe", timeout: 120000 });
  return fs.readFileSync(archivo, "utf16le").replace(/^﻿/, "").split(/<#>\r?\n/).filter((l) => l.length)
    .map((l) => Object.fromEntries(l.split("<|>").map((v, i) => [columnas[i], v.replace(/\u0000/g, "").trim()])));
}

console.log("Leyendo el SAME…");
const diagnosticos = leer("diagnosticos", ["codigo", "nombre"], "Integral.diagnostico with (nolock)");
const medicinas = leer("medicinas", ["codigo", "nombre", "laboratorio"], "Integral.medicina with (nolock)");
fs.rmSync(tmp, { recursive: true, force: true });

// Mismas reglas que cargar.mjs
const norm = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
const titulo = (s) => s.toLowerCase().replace(/(^|[\s(\-/])([a-záéíóúñ])/g, (_, a, b) => a + b.toUpperCase());
const nulo = (s) => (s && s !== "NULL" ? s : null);

// Diagnóstico → CIE-10: lo revisado a mano manda; si no, nombre idéntico en el catálogo CIE-10
const revision = new Map();
const rutaRevision = path.join(os.homedir(), "Documents", "zamorApp Importacion", "integral", "catalogos", "revision-diagnosticos.csv");
if (fs.existsSync(rutaRevision)) {
  for (const linea of fs.readFileSync(rutaRevision, "utf8").replace(/^﻿/, "").split(/\r?\n/).slice(1).filter(Boolean)) {
    const c = linea.slice(1, -1).split('";"');
    revision.set(c[0], (c[7] || c[4] || "").trim().toUpperCase());
  }
}
const cie10 = JSON.parse(fs.readFileSync(new URL("../../supabase/datos/cie10.json", import.meta.url), "utf8"));
const porNombre = new Map(cie10.map(([codigo, descripcion]) => [norm(descripcion), codigo]));
const codigos = new Set(cie10.map(([codigo]) => codigo));
const codigoDe = (d) => {
  const r = revision.get(d.codigo);
  if (r && codigos.has(r)) return { codigo: r, como: "revisado" };
  const n = porNombre.get(norm(d.nombre));
  return n ? { codigo: n, como: "nombre" } : { codigo: null, como: "sin" };
};

// ─── Escritura en zamorApp ──────────────────────────────────
const cliente = new pg.Client(configuracion(process.env.DATABASE_URL));
await cliente.connect();
const q = (s, p) => cliente.query(s, p);
const informe = [`# Catálogo completo del SAME (${GUARDAR ? "GUARDADO" : "ensayo: no se guardó nada"})`, "", `Generado el ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC.`, ""];

try {
  await q("begin");
  // Una sola organización: si hubiera más, no se adivina a cuál pertenece el catálogo
  const { rows: orgs } = await q("select distinct org_id id from clinico.consultas where origen = $1", [ORIGEN]);
  if (orgs.length !== 1) throw new Error(`Hay ${orgs.length} organizaciones con datos del SAME: hace falta una sola. No se hizo nada.`);
  const ORG = orgs[0].id;

  async function agregar(lista, filas) {
    const { rows: ya } = await q("select lower(nombre) n, codigo_origen from public.lista_items where org_id = $1 and lista = $2", [ORG, lista]);
    const nombres = new Set(ya.map((r) => r.n)), origenes = new Set(ya.map((r) => r.codigo_origen).filter(Boolean));
    const vistos = new Set();
    const nuevas = filas.filter((f) => {
      const n = f.nombre.toLowerCase();
      if (!f.nombre || nombres.has(n) || origenes.has(f.codigo_origen) || vistos.has(n)) return false;
      vistos.add(n);
      return true;
    });
    let escritas = 0;
    for (let i = 0; i < nuevas.length; i += 400) {
      const { rowCount } = await q(
        `insert into public.lista_items (org_id, origen, codigo_origen, lista, codigo, nombre, grupo, orden, activo)
         select $1, $2, x.codigo_origen, $3, x.codigo, x.nombre, x.grupo, x.orden, true
           from jsonb_to_recordset($4::jsonb) as x(codigo_origen text, codigo text, nombre text, grupo text, orden int)
         on conflict (org_id, origen, codigo_origen) where origen is not null do nothing`,
        [ORG, ORIGEN, lista, JSON.stringify(nuevas.slice(i, i + 400))]);
      escritas += rowCount;
    }
    return { total: filas.length, nuevas: nuevas.length, escritas };
  }

  // 1) Diagnósticos
  const filasDx = diagnosticos.filter((d) => d.nombre).map((d, i) => {
    const c = codigoDe(d);
    return { codigo_origen: `dx:${d.codigo}`, codigo: c.codigo, nombre: titulo(d.nombre), grupo: null, orden: 500 + i, como: c.como };
  });
  const dx = await agregar("diagnostico", filasDx);
  const cuenta = (como) => filasDx.filter((f) => f.como === como).length;
  informe.push("## Diagnósticos", "", `- En el SAME: ${dx.total}.`, `- Agregados ahora: ${dx.escritas} (ya estaban: ${dx.total - dx.nuevas}).`,
    `- Con código CIE-10 revisado: ${cuenta("revisado")}; por nombre idéntico: ${cuenta("nombre")}; sin código (salen «sin CIE-10»): ${cuenta("sin")}.`, "");

  // 2) Medicinas: mismo código que cargar.mjs, así las ya cargadas se reconocen y no se duplican
  const med = await agregar("medicina", medicinas.filter((m) => m.nombre).map((m, i) => ({
    codigo_origen: `med:${m.codigo}`, codigo: `integral_${m.codigo}`, nombre: titulo(m.nombre), grupo: nulo(m.laboratorio?.replace(/^\*$/, "")), orden: 1000 + i })));
  informe.push("## Medicinas", "", `- En el SAME: ${med.total}.`, `- Agregadas ahora: ${med.escritas} (ya estaban: ${med.total - med.nuevas}).`,
    "- Las agregadas no traen dosis preestablecida: se escribe en la consulta.", "");

  await q(GUARDAR ? "commit" : "rollback");
} catch (e) {
  await q("rollback").catch(() => {});
  throw e;
} finally {
  await cliente.end();
}

const salida = path.join(os.homedir(), ".zamorapp");
fs.mkdirSync(salida, { recursive: true });
fs.writeFileSync(path.join(salida, "catalogos-completos.md"), informe.join("\n"), "utf8");
console.log(informe.join("\n"));
