import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Map as IconoMapa } from "lucide-react";
import { Card } from "@/components/ui/card";
import { empresaActivaId } from "@/lib/empresa-activa";
import { listarEmpresas } from "@/lib/empresas";
import { itemsDeLista } from "@/lib/listas";
import { listarEvaluacionesRiesgos } from "@/lib/riesgos-datos";
import { MOTIVOS_BASE, nivelFila, resumen, ROLES_RIESGOS, TIPOS_EVALUACION, type TipoEvaluacion } from "@/lib/riesgos-puesto";
import { obtenerSesion } from "@/lib/sesion";
import { cn } from "@/lib/utils";
import { NuevaIdentificacion } from "./nueva";

export const metadata: Metadata = { title: "Identificación de riesgos y mapa de riesgos" };
export const dynamic = "force-dynamic";

const fecha = (iso: string) => iso.slice(0, 10).split("-").reverse().join("/");

export default async function Riesgos({ searchParams }: { searchParams: Promise<{ tipo?: string }> }) {
  const { tipo } = await searchParams;
  const [sesion, empresaId, empresas] = await Promise.all([obtenerSesion(), empresaActivaId(), listarEmpresas()]);
  const [evaluaciones, motivos] = await Promise.all([listarEvaluacionesRiesgos(empresaId), itemsDeLista(sesion.orgId, "motivo_identificacion_riesgo", true)]);
  const puedeEditar = !!sesion.rol && ROLES_RIESGOS.includes(sesion.rol);
  const tipoInicial: TipoEvaluacion = tipo === "oficina" ? "oficina" : "general";

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link href="/evaluaciones" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary"><ArrowLeft className="size-4" /> Evaluaciones de riesgos</Link>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">Identificación de riesgos y mapa de riesgos</h1>
          <p className="text-muted-foreground">Por puesto, con los trabajadores y el Comité (NT-04-2023, art. 14) · {evaluaciones.length} {evaluaciones.length === 1 ? "evaluación" : "evaluaciones"}</p>
        </div>
        {puedeEditar && (
          <NuevaIdentificacion
            empresas={empresas.map((e) => ({ id: e.id, nombre: e.razonSocial }))}
            empresaInicial={empresaId}
            motivos={motivos.length ? motivos.map((m) => m.nombre) : MOTIVOS_BASE}
            tipoInicial={tipoInicial}
          />
        )}
      </div>

      <Card className="overflow-hidden py-0">
        {evaluaciones.length === 0 ? (
          <div className="grid place-items-center gap-2 px-6 py-16 text-center text-muted-foreground">
            <IconoMapa className="size-8" />
            <p>Aún no hay identificaciones de riesgos.</p>
            <p className="max-w-md text-sm">Eliges los puestos, respondes la lista de chequeo (Sí / No), valoras cada riesgo y lo ubicas en el plano. Las gráficas, el mapa y el informe salen solos.</p>
          </div>
        ) : (
          <ul className="divide-y">
            {evaluaciones.map((e) => {
              const r = resumen(e.filas);
              const max = r.max;
              const graves = e.filas.filter((f) => (nivelFila(f)?.n ?? 0) >= 10).length;
              return (
                <li key={e.id}>
                  <Link href={`/riesgos/${e.id}`} className="grid grid-cols-1 gap-x-4 gap-y-1 px-5 py-3 transition hover:bg-muted/40 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center">
                    <div className="min-w-0">
                      <div className="truncate font-medium">{e.titulo}</div>
                      <div className="truncate text-xs text-muted-foreground">{e.empresa} · {fecha(e.fecha)} · {TIPOS_EVALUACION.find((t) => t.clave === e.tipo)?.nombre} · {e.puestos.length} puestos</div>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium">{e.filas.length} riesgos</span>
                      {max && <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium", max.clase)}>{graves ? `${graves} altos o críticos` : `máx. ${max.texto.toLowerCase()}`}</span>}
                    </div>
                    <span className="hidden text-xs text-muted-foreground sm:block">{e.estado === "cerrada" ? (e.aplicadaEn ? "Cerrada · en los puestos" : "Cerrada") : "En curso"}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
