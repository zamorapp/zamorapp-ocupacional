import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { supabaseConfigurado } from "@/lib/config";
import { opciones } from "@/lib/listas";
import { estructuraEmpresa } from "@/lib/puestos";
import { obtenerEvaluacionRiesgos, PREGUNTAS_DEMO } from "@/lib/riesgos-datos";
import { MOTIVOS_BASE, preguntaDe, ROLES_PUESTOS, ROLES_RIESGOS, TIPOS_EVALUACION, type Pregunta } from "@/lib/riesgos-puesto";
import { obtenerSesion } from "@/lib/sesion";
import { crearClienteServidor } from "@/lib/supabase/server";
import { Asistente } from "./asistente";

export const metadata: Metadata = { title: "Identificación de riesgos" };
export const dynamic = "force-dynamic";

export default async function EvaluacionRiesgosPagina({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [sesion, ev] = await Promise.all([obtenerSesion(), obtenerEvaluacionRiesgos(id)]);
  if (!ev || (!sesion.orgId && !sesion.demo)) notFound();
  const tipo = TIPOS_EVALUACION.find((t) => t.clave === ev.tipo) ?? TIPOS_EVALUACION[0];
  const [listas, estructura, planoUrl] = await Promise.all([
    opciones(sesion.orgId, [tipo.lista, "motivo_identificacion_riesgo", "agente_riesgo"]),
    estructuraEmpresa(ev.empresaId),
    (async () => {
      if (!ev.mapa.plano || !supabaseConfigurado) return null;
      const supabase = await crearClienteServidor();
      const { data } = await supabase.storage.from("mapas-riesgo").createSignedUrl(ev.mapa.plano, 3600);
      return data?.signedUrl ?? null;
    })(),
  ]);
  const preguntas = (sesion.demo && !listas[tipo.lista].length ? PREGUNTAS_DEMO : listas[tipo.lista]).map(preguntaDe).filter((p): p is Pregunta => p !== null);
  const motivos = listas.motivo_identificacion_riesgo.map((m) => m.nombre);
  const puedeEditar = !!sesion.rol && ROLES_RIESGOS.includes(sesion.rol);
  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div>
        <Link href="/riesgos" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary"><ArrowLeft className="size-4" /> Identificación de riesgos</Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">{ev.titulo}</h1>
        <p className="text-sm text-muted-foreground">{ev.empresa} · {tipo.nombre}</p>
      </div>
      <Asistente
        ev={ev}
        preguntas={preguntas}
        motivos={motivos.length ? motivos : MOTIVOS_BASE}
        agentes={listas.agente_riesgo.map((a) => ({ grupo: a.grupo ?? "", nombre: a.nombre }))}
        puestosEmpresa={estructura.puestos.map((p) => ({ id: p.id, nombre: p.nombre, dependencia: p.dependencia, trabajadores: p.trabajadores, riesgos: p.riesgos, evaluacion: p.evaluacion }))}
        planoUrl={planoUrl}
        orgId={sesion.orgId ?? ""}
        demo={sesion.demo}
        puedeEditar={puedeEditar}
        puedeReabrir={sesion.rol === "administrador" || sesion.rol === "gerente_medico"}
        puedeAplicar={!!sesion.rol && ROLES_PUESTOS.includes(sesion.rol)}
      />
    </div>
  );
}
