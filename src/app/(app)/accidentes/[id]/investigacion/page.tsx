import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { obtenerEvento } from "@/lib/eventos";
import { obtenerInvestigacion, sugerenciasInvestigacion } from "@/lib/investigacion";
import { obtenerSesion } from "@/lib/sesion";
import { BotonEliminar } from "@/components/app/boton-eliminar";
import { EditorInvestigacion } from "./editor-investigacion";

export const metadata: Metadata = { title: "Informe de investigación" };
export const dynamic = "force-dynamic";

export default async function InformeInvestigacion({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sesion = await obtenerSesion();
  const evento = await obtenerEvento(id);
  if (!evento || !evento.trabajadorId) notFound();
  const volver = (
    <Link href={`/accidentes/${id}`} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
      <ArrowLeft className="size-4" /> #{evento.numero} · {evento.trabajador}
    </Link>
  );
  if (!sesion.clinico) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        {volver}
        <p className="rounded-xl border p-6 text-sm text-muted-foreground">El informe de investigación tiene datos clínicos: lo elabora y lo ve el personal de salud.</p>
      </div>
    );
  }
  const [inv, sugerencias] = await Promise.all([obtenerInvestigacion(evento), sugerenciasInvestigacion(evento)]);
  if (!inv) notFound();
  const admin = !sesion.demo && sesion.rol === "administrador" && sesion.clinico;
  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {volver}
        {admin && inv.id && <BotonEliminar tipo="investigacion" id={inv.id} nombre={`la investigación del registro #${evento.numero}`} destino={`/accidentes/${id}`} volver={`/accidentes/${id}/investigacion`} />}
      </div>
      <EditorInvestigacion inicial={inv} sugerencias={sugerencias} evento={{ id, numero: evento.numero, tipo: evento.tipo, diagnostico: [evento.cie10, evento.diagnostico].filter(Boolean).join(" ") }} />
    </div>
  );
}
