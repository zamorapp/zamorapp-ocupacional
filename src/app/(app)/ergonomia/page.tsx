import type { Metadata } from "next";
import Link from "next/link";
import { PersonStanding } from "lucide-react";
import { Card } from "@/components/ui/card";
import { empresaActivaId } from "@/lib/empresa-activa";
import { listarEmpresas } from "@/lib/empresas";
import { CLASE_URGENCIA, NOMBRE_METODO, PROXIMOS, ROLES_ERGONOMIA, ordenarHallazgos, prioridad } from "@/lib/ergonomia";
import { listarEvaluaciones, puestosPorEmpresa } from "@/lib/ergonomia-datos";
import { obtenerSesion } from "@/lib/sesion";
import { cn } from "@/lib/utils";
import { NuevaEvaluacion } from "./nueva-evaluacion";

export const metadata: Metadata = { title: "Ergonomía de puestos" };
export const dynamic = "force-dynamic";

const fecha = (iso: string) => iso.slice(0, 10).split("-").reverse().join("/");

export default async function Ergonomia() {
  const [sesion, empresaId, empresas, puestos] = await Promise.all([obtenerSesion(), empresaActivaId(), listarEmpresas(), puestosPorEmpresa()]);
  const evaluaciones = await listarEvaluaciones(empresaId);
  const puedeEditar = !!sesion.rol && ROLES_ERGONOMIA.includes(sesion.rol);
  const prioritarias = evaluaciones.filter((e) => (e.resultado.urgencia ?? 0) >= 3 || e.hallazgos.some((h) => (prioridad(h)?.n ?? 0) >= 10)).length;

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Ergonomía de puestos</h1>
          <p className="text-muted-foreground">
            {evaluaciones.length} evaluaciones
            {prioritarias > 0 && <> · <span className="font-medium text-alerta-texto">{prioritarias} con riesgo alto o muy alto</span></>}
          </p>
        </div>
        {puedeEditar && (
          <NuevaEvaluacion
            empresas={empresas.map((e) => ({ id: e.id, nombre: e.razonSocial }))}
            empresaInicial={empresaId}
            puestos={puestos}
          />
        )}
      </div>

      <Card className="overflow-hidden py-0">
        {evaluaciones.length === 0 ? (
          <div className="grid place-items-center gap-2 px-6 py-16 text-center text-muted-foreground">
            <PersonStanding className="size-8" />
            <p>Aún no hay evaluaciones ergonómicas.</p>
            <p className="max-w-md text-sm">Elige un puesto, toma fotos de la tarea y marca las posturas: el puntaje, los riesgos y las recomendaciones por departamento salen solos.</p>
          </div>
        ) : (
          <ul className="divide-y">
            {evaluaciones.map((e) => {
              const top = ordenarHallazgos(e.hallazgos)[0];
              const pr = top ? prioridad(top) : null;
              const u = e.resultado.urgencia;
              return (
                <li key={e.id}>
                  <Link href={`/ergonomia/${e.id}`} className="grid grid-cols-1 gap-x-4 gap-y-1 px-5 py-3 transition hover:bg-muted/40 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center">
                    <div className="min-w-0">
                      <div className="truncate font-medium">{e.puesto}{e.tarea && <span className="font-normal text-muted-foreground"> · {e.tarea}</span>}</div>
                      <div className="truncate text-xs text-muted-foreground">{e.empresa} · {fecha(e.fecha)} · {NOMBRE_METODO[e.metodo].split(" · ")[0]}{e.estado === "borrador" && " · borrador"}</div>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {typeof e.resultado.puntaje === "number" && e.resultado.completo && (
                        <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium", CLASE_URGENCIA[u ?? 0])}>
                          {e.resultado.puntaje}/{e.resultado.maximo} · {e.resultado.nivel}
                        </span>
                      )}
                      {pr && <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium", pr.clase)}>{e.hallazgos.length} hallazgos · máx. {pr.texto.toLowerCase()}</span>}
                    </div>
                    <span className="hidden text-xs text-muted-foreground sm:block">{e.estado === "cerrada" ? "Cerrada" : "En curso"}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <div className="rounded-xl border border-dashed p-4 text-sm">
        <div className="mb-2 font-medium">Próximos métodos</div>
        <ul className="grid grid-cols-1 gap-2 text-muted-foreground sm:grid-cols-2 lg:grid-cols-3">
          {PROXIMOS.map((m) => (
            <li key={m.corto}><span className="font-medium text-foreground">{m.corto}:</span> {m.para}. <span className="text-xs">({m.fuente})</span></li>
          ))}
        </ul>
      </div>
    </div>
  );
}
