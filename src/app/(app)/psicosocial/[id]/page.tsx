import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { URL_PUBLICA } from "@/lib/invitaciones";
import { ROLES_PSICOSOCIAL } from "@/lib/psicosocial";
import { codigosPsicosociales, enlaceOficinaPsicosocial, obtenerPsicosocial, perfilesPsicosociales, resultadosPsicosociales } from "@/lib/psicosocial-datos";
import { puestosPorEmpresa } from "@/lib/ergonomia-datos";
import { obtenerSesion } from "@/lib/sesion";
import { PanelPsicosocial } from "./panel";

export const metadata: Metadata = { title: "Evaluación psicosocial" };
export const dynamic = "force-dynamic";

export default async function EvaluacionPsicosocial({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [sesion, ev] = await Promise.all([obtenerSesion(), obtenerPsicosocial(id)]);
  if (!ev || (!sesion.orgId && !sesion.demo)) notFound();
  const puedeEditar = !!sesion.rol && ROLES_PSICOSOCIAL.includes(sesion.rol);
  const servicio = puedeEditar || sesion.demo;
  const [resultados, codigos, puestos, enlace, perfiles] = await Promise.all([
    resultadosPsicosociales(id),
    servicio ? codigosPsicosociales(id) : Promise.resolve({ libres: [], usados: 0, enTelefonos: 0 }),
    puestosPorEmpresa(),
    servicio ? enlaceOficinaPsicosocial(id) : Promise.resolve(null),
    servicio && ev.estado === "cerrada" ? perfilesPsicosociales(id) : Promise.resolve(null),
  ]);
  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <div>
        <Link href="/psicosocial" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary"><ArrowLeft className="size-4" /> Riesgos psicosociales</Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">{ev.titulo}</h1>
        <p className="text-sm text-muted-foreground">{ev.empresa}</p>
      </div>
      <PanelPsicosocial
        ev={ev}
        resultados={resultados}
        codigos={codigos}
        enlaceOficina={enlace}
        perfiles={perfiles}
        puestosEmpresa={(puestos[ev.empresaId] ?? []).map((p) => p.nombre)}
        urlPublica={URL_PUBLICA}
        demo={sesion.demo}
        puedeEditar={puedeEditar || sesion.demo}
        puedeReabrir={sesion.rol === "administrador" || sesion.rol === "gerente_medico"}
      />
    </div>
  );
}
