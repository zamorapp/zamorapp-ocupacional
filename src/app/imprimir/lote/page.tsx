import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { faltantesRecipe, obtenerDocumento, type DatosDocumento } from "@/lib/documentos";
import { MAX_LOTE, NOMBRE_DOCUMENTO } from "@/lib/envios-tipos";
import { obtenerSesion } from "@/lib/sesion";
import { BarraImpresion } from "../barra";
import { Constancia, ConstanciaAtencion, Informe, Recipe, Referencia } from "../documentos";

export const metadata: Metadata = { title: "Documentos por lote" };
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DOCS = ["constancia", "atencion", "consulta", "referencia", "recipe"] as const;
type Doc = (typeof DOCS)[number];

// Cada documento sale solo de las consultas que lo tienen (sin hojas vacías)
const tiene: Record<Doc, (d: DatosDocumento) => boolean> = {
  constancia: (d) => Boolean(d.datos.aptitud.clasificacion),
  atencion: () => true,
  consulta: () => true,
  referencia: (d) => d.datos.interconsultas.some((x) => x.especialidad.trim()),
  recipe: (d) => d.datos.tratamiento.some((x) => x.medicina) && !faltantesRecipe(d).length,
};
const hoja = (doc: Doc, d: DatosDocumento & { clave: string }) => {
  const k = `${doc}-${d.clave}`;
  if (doc === "constancia") return <Constancia key={k} d={d} soloOriginal />;
  if (doc === "atencion") return <ConstanciaAtencion key={k} d={d} />;
  if (doc === "referencia") return <Referencia key={k} d={d} />;
  if (doc === "recipe") return <Recipe key={k} d={d} />;
  return <Informe key={k} d={d} />;
};

// Varias consultas en un solo documento, una por hoja y agrupadas por documento (?doc=constancia,atencion): lo usa
// el envío a la empresa para generar el PDF en el servidor y también se puede abrir para imprimir el lote.
// La RLS decide qué consultas salen.
export default async function Lote({ searchParams }: { searchParams: Promise<{ ids?: string; doc?: string }> }) {
  const { ids = "", doc = "" } = await searchParams;
  const docs = [...new Set(doc.split(","))].filter((x): x is Doc => (DOCS as readonly string[]).includes(x));
  if (!docs.length) notFound();
  const sesion = await obtenerSesion();
  if (sesion.demo || !sesion.clinico) notFound();
  const lista = [...new Set(ids.split(",").filter((x) => UUID.test(x)))].slice(0, MAX_LOTE);
  const datos = (await Promise.all(lista.map(async (id) => ({ id, d: await obtenerDocumento(id) })))).flatMap(({ id, d }) => (d ? [{ ...d, clave: id }] : []));
  const hojas = docs.flatMap((x) => datos.filter(tiene[x]).map((d) => hoja(x, d)));
  const titulo = docs.map((x) => NOMBRE_DOCUMENTO[x]).join(" y ");

  return (
    <div className="min-h-dvh bg-neutral-100 print:bg-white">
      <BarraImpresion volver="/envios" titulo={`${titulo} · ${datos.length}`} bloqueado={!hojas.length} />
      {!hojas.length && <p className="mx-auto max-w-2xl rounded-lg bg-white p-6 text-center text-sm">No hay documentos para este lote.</p>}
      {hojas}
    </div>
  );
}
