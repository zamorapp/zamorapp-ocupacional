import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { obtenerAnexos, obtenerDocumento } from "@/lib/documentos";
import { Anexos } from "../../anexos";
import { BarraImpresion } from "../../barra";

export const metadata: Metadata = { title: "Exámenes escaneados" };

// Solo los exámenes escaneados de la consulta (laboratorio, Rx, informes externos), listos para imprimir
export default async function ImprimirAnexos({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const d = await obtenerDocumento(id);
  if (!d) notFound();
  const anexos = await obtenerAnexos(d);
  return (
    <div className="min-h-dvh bg-neutral-100 print:bg-white">
      <BarraImpresion volver={`/atencion/${id}`} titulo={`Exámenes escaneados · ${d.trabajador.nombre}`} bloqueado={!anexos.length} esperarAnexos={anexos.length > 0} />
      {anexos.length ? (
        <Anexos anexos={anexos} trabajador={d.trabajador.nombre} cedula={d.trabajador.cedula} />
      ) : (
        <p className="mx-auto max-w-2xl rounded-lg bg-white p-6 text-center text-sm">Esta consulta no tiene exámenes escaneados. Súbelos en la consulta, sección «Resultados adjuntos».</p>
      )}
    </div>
  );
}
