import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { obtenerEvento } from "@/lib/eventos";
import { obtenerSesion } from "@/lib/sesion";
import { BarraImpresion } from "../../barra";
import { documentoBase } from "../../base";
import { HojaDeclaracion, tituloEvento } from "../hoja-declaracion";

export const metadata: Metadata = { title: "Declaración de accidente" };
export const dynamic = "force-dynamic";

// Declaración de accidente, incidente o enfermedad ocupacional (LOPCYMAT art. 73; lesión según COVENIN 474)
export default async function DeclaracionEvento({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sesion = await obtenerSesion();
  const e = await obtenerEvento(id);
  if (!e || !sesion.orgId) notFound();
  const base = await documentoBase(sesion);
  return (
    <div className="min-h-dvh bg-neutral-100 print:bg-white">
      <BarraImpresion volver={`/accidentes/${id}`} titulo={`${tituloEvento(e)} · Nº ${e.numero}`} />
      <HojaDeclaracion e={e} base={base} />
    </div>
  );
}

