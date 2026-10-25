import type { Metadata } from "next";
import Link from "next/link";
import { HardHat } from "lucide-react";
import { Semaforo } from "@/components/app/semaforo";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { listarEmpresas } from "@/lib/empresas";
import { listarEventos } from "@/lib/eventos";
import { ETIQUETA_ESTADO_EVENTO, ETIQUETA_TIPO, fechaHoraVE, plazoDeclaracion, plazoInformeNt02 } from "@/lib/eventos-tipos";
import { obtenerSesion } from "@/lib/sesion";
import { ReportarEvento } from "./reportar-evento";

export const metadata: Metadata = { title: "Accidentes y enfermedades" };
export const dynamic = "force-dynamic";

export default async function Accidentes() {
  const [sesion, eventos, empresas] = await Promise.all([obtenerSesion(), listarEventos(), listarEmpresas()]);
  const pendientes = eventos.filter((e) => plazoDeclaracion(e)?.cumplido === false).length;
  const anio = new Date().getFullYear();
  const delAnio = eventos.filter((e) => e.fechaHora.startsWith(String(anio)));

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Accidentes y enfermedades ocupacionales</h1>
          <p className="text-muted-foreground">
            {delAnio.filter((e) => e.tipo === "accidente").length} accidentes, {delAnio.filter((e) => e.tipo === "incidente").length} incidentes y {delAnio.filter((e) => e.tipo === "enfermedad").length} enfermedades en {anio}
            {pendientes > 0 && <> · <span className="font-medium text-alerta">{pendientes} por declarar</span></>}
          </p>
        </div>
        <ReportarEvento habilitado={!sesion.demo && empresas.length > 0} empresas={empresas.map((e) => ({ id: e.id, nombre: e.razonSocial }))} />
      </div>

      <Card className="overflow-hidden py-0">
        {eventos.length === 0 ? (
          <div className="grid place-items-center gap-2 py-16 text-center text-muted-foreground">
            <HardHat className="size-8" />
            Sin eventos registrados. Ojalá siga así.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead className="pl-5">Nº · Fecha</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Trabajador</TableHead>
                <TableHead className="hidden lg:table-cell">Lesión</TableHead>
                <TableHead>Plazos legales</TableHead>
                <TableHead className="pr-5">Estado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {eventos.map((e) => {
                const plazos = [plazoDeclaracion(e), plazoInformeNt02(e)].filter(Boolean);
                return (
                  <TableRow key={e.id}>
                    <TableCell className="pl-5">
                      <Link href={`/accidentes/${e.id}`} className="font-medium hover:text-primary">#{e.numero}</Link>
                      <div className="text-xs text-muted-foreground">{fechaHoraVE(e.fechaHora)}</div>
                    </TableCell>
                    <TableCell>
                      {ETIQUETA_TIPO[e.tipo]}
                      {e.subtipo === "in_itinere" && <div className="text-xs text-muted-foreground">In itinere</div>}
                    </TableCell>
                    <TableCell>
                      <Link href={`/accidentes/${e.id}`} className="hover:text-primary">{e.trabajador ?? "Sin lesionado"}</Link>
                      <div className="text-xs text-muted-foreground">{e.empresa}</div>
                    </TableCell>
                    <TableCell className="hidden text-sm lg:table-cell">
                      {[e.naturalezaLesion, e.parteCuerpo].filter(Boolean).join(" · ") || e.diagnostico || "—"}
                    </TableCell>
                    <TableCell>
                      {plazos.length === 0 ? <span className="text-xs text-muted-foreground">No se declara</span> : plazos.map((p) => (
                        <div key={p!.texto} className="flex items-center gap-1.5 text-xs">
                          <Semaforo estado={p!.estado} /> <span className={p!.estado === "alerta" ? "font-medium text-alerta" : ""}>{p!.texto}</span>
                        </div>
                      ))}
                    </TableCell>
                    <TableCell className="pr-5 text-sm">{ETIQUETA_ESTADO_EVENTO[e.estado]}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
