import type { Metadata } from "next";
import Link from "next/link";
import { ClipboardList, ShieldAlert } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { listarConsultas } from "@/lib/consultas";
import { ETIQUETA_ESTADO_CONSULTA } from "@/lib/consultas-tipos";
import { ESTILO_APTITUD, ETIQUETA_APTITUD, fecha } from "@/lib/pacientes";
import { obtenerSesion } from "@/lib/sesion";
import { cn } from "@/lib/utils";
import { NuevaConsulta } from "./nueva-consulta";

export const metadata: Metadata = { title: "Atención médica" };
export const dynamic = "force-dynamic";

const ESTILO_ESTADO = {
  borrador: "bg-aviso/20 text-amber-700 dark:text-aviso",
  cerrada: "bg-ok/15 text-ok",
  firmada: "bg-primary/15 text-primary",
};

export default async function Atencion() {
  const sesion = await obtenerSesion();
  const desde = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
  const consultas = sesion.demo ? [] : await listarConsultas({ desde });
  const hoy = new Date().toLocaleDateString("en-CA", { timeZone: "America/Caracas" });
  const deHoy = consultas.filter((c) => c.fecha === hoy).length;
  const abiertas = consultas.filter((c) => c.estado === "borrador").length;

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Atención médica</h1>
          <p className="text-muted-foreground">{deHoy} consultas hoy · {abiertas} en curso · últimos 30 días</p>
        </div>
        <NuevaConsulta habilitado={!sesion.demo} />
      </div>

      {sesion.demo && (
        <div className="flex items-center gap-3 rounded-lg border border-aviso/40 bg-aviso/10 px-4 py-3 text-sm">
          <ShieldAlert className="size-5 text-amber-600" /> Conecta Supabase para registrar consultas.
        </div>
      )}

      <Card className="overflow-hidden py-0">
        {consultas.length === 0 ? (
          <div className="grid place-items-center gap-2 py-16 text-center text-muted-foreground">
            <ClipboardList className="size-8" />
            Aún no hay consultas. Empieza con Nueva consulta o desde la ficha de un paciente.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead className="pl-5">Fecha</TableHead>
                <TableHead>Paciente</TableHead>
                <TableHead className="hidden md:table-cell">Motivo</TableHead>
                <TableHead className="hidden lg:table-cell">Aptitud</TableHead>
                <TableHead className="pr-5">Estado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {consultas.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="pl-5">
                    <div className="font-mono text-sm">{fecha(c.fecha)}</div>
                    <div className="text-xs text-muted-foreground">{c.hora}</div>
                  </TableCell>
                  <TableCell>
                    <Link href={`/atencion/${c.id}`} className="font-medium hover:text-primary">{c.paciente}</Link>
                    <div className="text-xs text-muted-foreground">{c.cedula} · {c.empresa}</div>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    {c.motivo ?? <span className="text-muted-foreground">Sin motivo</span>}
                    <div className="text-xs capitalize text-muted-foreground">{c.tipo}</div>
                  </TableCell>
                  <TableCell className="hidden lg:table-cell">
                    {c.aptitud ? (
                      <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium", ESTILO_APTITUD[c.aptitud])}>{ETIQUETA_APTITUD[c.aptitud]}</span>
                    ) : "—"}
                  </TableCell>
                  <TableCell className="pr-5">
                    <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium", ESTILO_ESTADO[c.estado])}>{ETIQUETA_ESTADO_CONSULTA[c.estado]}</span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
