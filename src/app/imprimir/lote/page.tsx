import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { obtenerDocumento } from "@/lib/documentos";
import { MAX_LOTE } from "@/lib/envios-tipos";
import { obtenerSesion } from "@/lib/sesion";
import { BarraImpresion } from "../barra";
import { Constancia, Informe } from "../documentos";

export const metadata: Metadata = { title: "Documentos por lote" };
export const dynamic = "force-dynamic";

const BLOQUE = 20;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Varias consultas en un solo documento, una por hoja: constancias de aptitud (original para la empresa)
// o la consulta médica completa. La usa el envío a la empresa para generar el PDF en el servidor
// y también se puede abrir para imprimir el lote. La RLS decide qué consultas salen.
export default async function Lote({ searchParams }: { searchParams: Promise<{ ids?: string; doc?: string }> }) {
  const { ids = "", doc } = await searchParams;
  if (doc !== "constancia" && doc !== "consulta") notFound();
  const sesion = await obtenerSesion();
  if (sesion.demo || !sesion.clinico) notFound();
  const lista = [...new Set(ids.split(",").filter((x) => UUID.test(x)))].slice(0, MAX_LOTE);
  // En bloques de 20: pedir los 150 a la vez abría cientos de conexiones simultáneas a la base (plan gratis)
  const leidos: { id: string; d: Awaited<ReturnType<typeof obtenerDocumento>> }[] = [];
  for (let i = 0; i < lista.length; i += BLOQUE) {
    leidos.push(...(await Promise.all(lista.slice(i, i + BLOQUE).map(async (id) => ({ id, d: await obtenerDocumento(id) })))));
  }
  const docs = leidos.flatMap(({ id, d }) => (d ? [{ ...d, clave: id }] : []));
  const visibles = doc === "constancia" ? docs.filter((d) => d.datos.aptitud.clasificacion) : docs;
  const titulo = doc === "constancia" ? "Constancias de aptitud" : "Consultas médicas";

  return (
    <div className="min-h-dvh bg-neutral-100 print:bg-white">
      <BarraImpresion volver="/envios" titulo={`${titulo} · ${visibles.length}`} bloqueado={!visibles.length} />
      {!visibles.length && <p className="mx-auto max-w-2xl rounded-lg bg-white p-6 text-center text-sm">No hay documentos para este lote.</p>}
      {visibles.map((d) => (doc === "constancia" ? <Constancia key={d.clave} d={d} soloOriginal /> : <Informe key={d.clave} d={d} />))}
    </div>
  );
}
