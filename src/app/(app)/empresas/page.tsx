import type { Metadata } from "next";
import Link from "next/link";
import { Briefcase, Building2, Users } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { datosLegalesFaltantes, listarEmpresas } from "@/lib/empresas";
import { obtenerSesion } from "@/lib/sesion";
import { AlertaLegal } from "./alerta-legal";
import { PausarAvisos } from "./pausar-avisos";
import { FormEmpresa } from "./nueva-empresa";
import { EstadoEmpresa } from "./estado-empresa";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Empresas" };

export default async function Empresas({ searchParams }: { searchParams: Promise<{ ver?: string }> }) {
  const [{ ver }, sesion, todas] = await Promise.all([searchParams, obtenerSesion(), listarEmpresas(true)]);
  // Por omisión solo las activas; «Ver inactivas» muestra las que ya no se atienden (con sus datos intactos)
  const verInactivas = ver === "inactivas";
  const nInactivas = todas.filter((e) => !e.activa).length;
  const empresas = todas.filter((e) => e.activa !== verInactivas);
  const total = empresas.reduce((s, e) => s + e.trabajadores, 0);
  const esAdmin = !sesion.demo && sesion.rol === "administrador";
  const pastilla = (activa: boolean) =>
    cn("rounded-full border px-3 py-1.5 text-sm transition", activa ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-muted");

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Empresas</h1>
          <p className="text-muted-foreground">
            {empresas.length} {verInactivas ? (empresas.length === 1 ? "empresa inactiva" : "empresas inactivas") : "empresas clientes"} · {total} trabajadores
          </p>
        </div>
        <FormEmpresa habilitado={esAdmin} />
      </div>

      {(nInactivas > 0 || verInactivas) && (
        <nav aria-label="Filtrar empresas" className="flex flex-wrap gap-1.5">
          <Link href="/empresas" aria-current={!verInactivas ? "page" : undefined} className={pastilla(!verInactivas)}>Activas</Link>
          <Link href="/empresas?ver=inactivas" aria-current={verInactivas ? "page" : undefined} className={pastilla(verInactivas)}>Ver inactivas ({nInactivas})</Link>
        </nav>
      )}

      {empresas.length === 0 ? (
        <div className="grid place-items-center gap-2 rounded-2xl border border-dashed bg-card py-20 text-center">
          <Building2 className="size-8 text-muted-foreground" />
          <p className="font-medium">{verInactivas ? "No hay empresas inactivas" : "Aún no hay empresas clientes"}</p>
          <p className="text-sm text-muted-foreground">{verInactivas ? "Las que inactives aparecen aquí, con todos sus datos." : "Registra la primera con el botón Nueva empresa."}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {empresas.map((e) => {
            const faltan = datosLegalesFaltantes(e);
            return (
              <Card key={e.id} className={cn("gap-3 py-5", !e.activa && "border-dashed bg-muted/30")}>
                <CardContent className="space-y-3 px-5">
                  <div className="flex items-start gap-3">
                    <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                      <Building2 className="size-5" />
                    </span>
                    <div className="min-w-0">
                      <Link href={`/empresas/${e.id}`} className="font-medium leading-tight hover:text-primary">{e.razonSocial}</Link>
                      {!e.activa && <span className="ml-2 rounded-full bg-muted px-2 py-0.5 align-middle text-[11px] font-medium text-muted-foreground">Inactiva</span>}
                      <div className="font-mono text-xs text-muted-foreground">{e.rif}{e.nil && ` · NIL ${e.nil}`}</div>
                    </div>
                  </div>
                  {e.actividad && <p className="line-clamp-2 text-sm text-muted-foreground">{e.actividad}</p>}
                  <div className="flex items-center justify-between text-sm">
                    <Link href="/pacientes" className="inline-flex items-center gap-1.5 hover:text-primary">
                      <Users className="size-4" /> {e.trabajadores} trabajadores
                    </Link>
                    {!sesion.demo && (
                      <Link href={`/empresas/${e.id}`} className="inline-flex items-center gap-1.5 font-medium text-primary hover:underline">
                        <Briefcase className="size-4" /> Puestos y riesgos
                      </Link>
                    )}
                  </div>
                  {!sesion.demo && e.activa && <AlertaLegal empresaId={e.id} faltan={faltan} ignorada={e.ignorarAlertaLegal} editable={esAdmin} />}
                  {!sesion.demo && e.activa && <PausarAvisos empresaId={e.id} apagados={e.avisosApagados} editable={sesion.rol === "administrador" || sesion.rol === "gerente_medico"} />}
                  {!sesion.demo && (
                    <div className="-mb-2 flex flex-wrap items-center justify-between gap-2">
                      <EstadoEmpresa empresaId={e.id} nombre={e.razonSocial} trabajadores={e.trabajadores} activa={e.activa} editable={esAdmin} />
                      {esAdmin && <FormEmpresa habilitado empresa={e} />}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
