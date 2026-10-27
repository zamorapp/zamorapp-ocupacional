import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { obtenerEvento } from "@/lib/eventos";
import { obtenerInvestigacion } from "@/lib/investigacion";
import type { Investigacion } from "@/lib/investigacion-tipos";
import { obtenerSesion } from "@/lib/sesion";
import { documentoBase } from "../../base";
import { BarraImpresion } from "../../barra";
import { HojaInvestigacion } from "../hoja-investigacion";

export const metadata: Metadata = { title: "Informe de investigación" };
export const dynamic = "force-dynamic";

// Informe de investigación de enfermedad ocupacional (NT-02-2008, Título IV, cap. II, punto 2 y 6.3)
export default async function ImprimirInvestigacion({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sesion = await obtenerSesion();
  const e = await obtenerEvento(id);
  if (!e || !sesion.orgId || !sesion.clinico) notFound();
  const inv = await obtenerInvestigacion(e);
  if (!inv?.id) notFound();
  const conId = inv as Investigacion & { id: string };
  const base = await documentoBase(sesion);
  return (
    <div className="min-h-dvh bg-neutral-100 print:bg-white">
      <BarraImpresion volver={`/accidentes/${id}/investigacion`} titulo={`Informe de investigación · evento Nº ${e.numero}`} />
      <HojaInvestigacion e={e} inv={conId} base={base} />
    </div>
  );
}
