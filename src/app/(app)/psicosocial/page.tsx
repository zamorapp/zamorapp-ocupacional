import type { Metadata } from "next";
import Link from "next/link";
import { Brain, EyeOff, Users } from "lucide-react";
import { Card } from "@/components/ui/card";
import { empresaActivaId } from "@/lib/empresa-activa";
import { listarEmpresas } from "@/lib/empresas";
import { METODO_PSICOSOCIAL, ROLES_PSICOSOCIAL } from "@/lib/psicosocial";
import { listarPsicosociales } from "@/lib/psicosocial-datos";
import { puestosPorEmpresa } from "@/lib/ergonomia-datos";
import { hoyCaracas } from "@/lib/fecha";
import { obtenerSesion } from "@/lib/sesion";
import { cn } from "@/lib/utils";
import { NuevaPsicosocial } from "./nueva";

export const metadata: Metadata = { title: "Riesgos psicosociales" };
export const dynamic = "force-dynamic";

const fecha = (iso: string) => iso.slice(0, 10).split("-").reverse().join("/");

export default async function Psicosocial() {
  const [sesion, empresaId, empresas, puestos] = await Promise.all([obtenerSesion(), empresaActivaId(), listarEmpresas(), puestosPorEmpresa()]);
  const evaluaciones = await listarPsicosociales(empresaId);
  const puedeEditar = !!sesion.rol && ROLES_PSICOSOCIAL.includes(sesion.rol);

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Riesgos psicosociales</h1>
          <p className="text-muted-foreground">{METODO_PSICOSOCIAL.nombre} · cuestionario anónimo desde el celular o en papel</p>
        </div>
        {puedeEditar && (
          <NuevaPsicosocial
            empresas={empresas.map((e) => ({ id: e.id, nombre: e.razonSocial }))}
            empresaInicial={empresaId}
            anio={hoyCaracas().slice(0, 4)}
            puestos={Object.fromEntries(Object.entries(puestos).map(([k, v]) => [k, v.map((p) => p.nombre)]))}
          />
        )}
      </div>

      <Card className="overflow-hidden py-0">
        {evaluaciones.length === 0 ? (
          <div className="grid place-items-center gap-2 px-6 py-16 text-center text-muted-foreground">
            <Brain className="size-8" />
            <p>Aún no hay evaluaciones psicosociales.</p>
            <p className="max-w-md text-sm">Creas la evaluación, anotas el acuerdo con el Comité, repartes un código a cada trabajador y ves los resultados por puesto, sin saber nunca quién respondió qué.</p>
          </div>
        ) : (
          <ul className="divide-y">
            {evaluaciones.map((e) => (
              <li key={e.id}>
                <Link href={`/psicosocial/${e.id}`} className="grid grid-cols-1 gap-x-4 gap-y-1 px-5 py-3 transition hover:bg-muted/40 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center">
                  <div className="min-w-0">
                    <div className="truncate font-medium">{e.titulo}</div>
                    <div className="truncate text-xs text-muted-foreground">
                      {e.empresa} · desde {fecha(e.inicio)}{e.grupos.length > 0 && ` · ${e.grupos.length} puestos o áreas`}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5 text-xs">
                    {!e.acuerdoFecha && <span className="rounded-full bg-aviso/20 px-2.5 py-0.5 font-medium text-aviso-texto">Falta el acuerdo del Comité</span>}
                    {e.trabajadores && <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-0.5"><Users className="size-3" /> {e.trabajadores}</span>}
                  </div>
                  <span className={cn("hidden text-xs sm:block", e.estado === "cerrada" ? "text-muted-foreground" : "font-medium text-primary")}>
                    {e.estado === "cerrada" ? `Cerrada ${e.cerradaEn ? fecha(e.cerradaEn) : ""}` : "Recibiendo respuestas"}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <p className="flex items-start gap-2 text-xs text-muted-foreground">
        <EyeOff className="mt-0.5 size-3.5 shrink-0" />
        Nadie ve respuestas individuales, ni el servicio ni la empresa: solo totales por apartado y por puesto, y los puestos con pocas respuestas se juntan. RR. HH. ve el informe cuando la evaluación se cierra.
      </p>
    </div>
  );
}
