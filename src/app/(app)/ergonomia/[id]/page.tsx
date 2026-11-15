import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { NOMBRE_METODO, ROLES_ERGONOMIA } from "@/lib/ergonomia";
import { obtenerEvaluacion } from "@/lib/ergonomia-datos";
import { obtenerSesion } from "@/lib/sesion";
import { BotonEliminar } from "@/components/app/boton-eliminar";
import { EditorErgonomia } from "./editor-ergonomia";

export const metadata: Metadata = { title: "Evaluación ergonómica" };
export const dynamic = "force-dynamic";

export default async function EvaluacionErgonomica({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [sesion, ev] = await Promise.all([obtenerSesion(), obtenerEvaluacion(id)]);
  if (!ev || (!sesion.orgId && !sesion.demo)) notFound();
  // En demo se puede marcar todo para conocer la pantalla; no se guarda nada
  const puedeEditar = !!sesion.rol && ROLES_ERGONOMIA.includes(sesion.rol);
  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
      <div>
        <Link href="/ergonomia" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary"><ArrowLeft className="size-4" /> Ergonomía de puestos</Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">{ev.puesto}</h1>
        <p className="text-sm text-muted-foreground">{ev.empresa} · {NOMBRE_METODO[ev.metodo]}</p>
      </div>
      {!sesion.demo && sesion.rol === "administrador" && sesion.clinico && (
        <div className="flex basis-full justify-end sm:ml-auto sm:basis-auto">
          <BotonEliminar tipo="ergonomia" id={ev.id} nombre={`la evaluación de «${ev.puesto}»`} destino="/ergonomia" volver={`/ergonomia/${ev.id}`} />
        </div>
      )}
      </div>
      <EditorErgonomia ev={ev} orgId={sesion.orgId ?? ""} demo={sesion.demo} puedeEditar={puedeEditar} puedeReabrir={sesion.rol === "administrador" || sesion.rol === "gerente_medico"} />
    </div>
  );
}
