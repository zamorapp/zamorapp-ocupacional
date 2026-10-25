import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { obtenerEvento } from "@/lib/eventos";
import { opciones } from "@/lib/listas";
import { obtenerSesion } from "@/lib/sesion";
import { EditorEvento } from "./editor-evento";

export const metadata: Metadata = { title: "Evento" };
export const dynamic = "force-dynamic";

export default async function Evento({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sesion = await obtenerSesion();
  const [evento, listas] = await Promise.all([
    obtenerEvento(id),
    opciones(sesion.orgId, ["parte_cuerpo", "naturaleza_lesion", "agente_lesion", "forma_accidente"]),
  ]);
  if (!evento) notFound();
  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <Link href="/accidentes" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Accidentes y enfermedades
      </Link>
      <EditorEvento inicial={evento} listas={listas} />
    </div>
  );
}
