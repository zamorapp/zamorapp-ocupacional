import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, Building2, Users } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { datosLegalesFaltantes, listarEmpresas } from "@/lib/empresas";
import { obtenerSesion } from "@/lib/sesion";
import { NuevaEmpresa } from "./nueva-empresa";

export const metadata: Metadata = { title: "Empresas" };

export default async function Empresas() {
  const [sesion, empresas] = await Promise.all([obtenerSesion(), listarEmpresas()]);
  const total = empresas.reduce((s, e) => s + e.trabajadores, 0);

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Empresas</h1>
          <p className="text-muted-foreground">{empresas.length} empresas clientes · {total} trabajadores</p>
        </div>
        <NuevaEmpresa habilitado={!sesion.demo && sesion.rol === "administrador"} />
      </div>

      {empresas.length === 0 ? (
        <div className="grid place-items-center gap-2 rounded-2xl border border-dashed bg-card py-20 text-center">
          <Building2 className="size-8 text-muted-foreground" />
          <p className="font-medium">Aún no hay empresas clientes</p>
          <p className="text-sm text-muted-foreground">Registra la primera con el botón Nueva empresa.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {empresas.map((e) => {
            const faltan = datosLegalesFaltantes(e);
            return (
              <Card key={e.id} className="gap-3 py-5">
                <CardContent className="space-y-3 px-5">
                  <div className="flex items-start gap-3">
                    <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                      <Building2 className="size-5" />
                    </span>
                    <div className="min-w-0">
                      <div className="font-medium leading-tight">{e.razonSocial}</div>
                      <div className="font-mono text-xs text-muted-foreground">{e.rif}{e.nil && ` · NIL ${e.nil}`}</div>
                    </div>
                  </div>
                  {e.actividad && <p className="line-clamp-2 text-sm text-muted-foreground">{e.actividad}</p>}
                  <div className="flex items-center justify-between text-sm">
                    <Link href="/pacientes" className="inline-flex items-center gap-1.5 hover:text-primary">
                      <Users className="size-4" /> {e.trabajadores} trabajadores
                    </Link>
                    {e.municipio && <span className="text-muted-foreground">{e.municipio}</span>}
                  </div>
                  {faltan.length > 0 && !sesion.demo && (
                    <div className="flex gap-2 rounded-md bg-aviso/15 px-3 py-2 text-xs">
                      <AlertTriangle className="size-4 shrink-0 text-amber-600" />
                      Falta para el informe trimestral: {faltan.join(", ")}.
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
