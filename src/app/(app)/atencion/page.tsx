import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, ChevronRight, ClipboardList, FileSpreadsheet, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { hoyVE, listarCitas, listarSolicitudes } from "@/lib/citas";
import { listarConsultas } from "@/lib/consultas";
import { ETIQUETA_ESTADO_CONSULTA } from "@/lib/consultas-tipos";
import { opciones } from "@/lib/listas";
import { ESTILO_APTITUD, ETIQUETA_APTITUD, fecha } from "@/lib/pacientes";
import { obtenerSesion } from "@/lib/sesion";
import { cn } from "@/lib/utils";
import { ColaAtencion } from "./cola-atencion";
import { datosOrganizacion } from "@/lib/organizacion";
import { PLANTILLA_CITA } from "@/lib/mensajes";
import { NuevaCita } from "./nueva-cita";
import { NuevaConsulta } from "./nueva-consulta";
import { Solicitudes } from "./solicitudes";

export const metadata: Metadata = { title: "Atención médica" };
export const dynamic = "force-dynamic";

const ESTILO_ESTADO = {
  borrador: "bg-aviso/20 text-aviso-texto",
  cerrada: "bg-ok/15 text-ok-texto",
  firmada: "bg-primary/15 text-primary",
};

const moverDia = (dia: string, n: number) => {
  const d = new Date(dia + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

export default async function Atencion({ searchParams }: { searchParams: Promise<{ dia?: string }> }) {
  const [{ dia: diaParam }, sesion] = await Promise.all([searchParams, obtenerSesion()]);
  const hoy = hoyVE();
  const dia = diaParam && /^\d{4}-\d{2}-\d{2}$/.test(diaParam) ? diaParam : hoy;
  const desde = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
  const [consultas, citas, listas, solicitudes, org] = await Promise.all([
    sesion.demo ? [] : listarConsultas({ desde }),
    sesion.demo ? [] : listarCitas(dia),
    opciones(sesion.orgId, ["motivo_consulta"]),
    sesion.demo ? [] : listarSolicitudes(),
    datosOrganizacion(),
  ]);
  const deHoy = consultas.filter((c) => c.fecha === hoy).length;
  const abiertas = consultas.filter((c) => c.estado === "borrador").length;
  const etiquetaDia = new Intl.DateTimeFormat("es-VE", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(dia + "T12:00:00Z"));

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Atención médica</h1>
          <p className="text-muted-foreground">{deHoy} consultas hoy · {abiertas} en curso</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" asChild><Link href="/atencion/citas-lote"><FileSpreadsheet /> Citas por lote</Link></Button>
          <NuevaCita habilitado={!sesion.demo} fecha={dia} motivos={listas.motivo_consulta.map((m) => ({ id: m.id, nombre: m.nombre, grupo: m.grupo }))} />
          <NuevaConsulta habilitado={!sesion.demo} />
        </div>
      </div>

      {sesion.demo && (
        <div className="flex items-center gap-3 rounded-lg border border-aviso/40 bg-aviso/10 px-4 py-3 text-sm">
          <ShieldAlert className="size-5 text-aviso-texto" /> Conecta Supabase para registrar citas y consultas.
        </div>
      )}

      <Solicitudes solicitudes={solicitudes} />

      {/* Cola de atención del día */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-semibold">Cola de atención</h2>
          <div className="ml-2 flex items-center gap-1 rounded-lg border bg-card p-0.5">
            <Button variant="ghost" size="icon" className="size-8" asChild><Link href={`/atencion?dia=${moverDia(dia, -1)}`} aria-label="Día anterior"><ChevronLeft /></Link></Button>
            <span className="px-2 text-sm first-letter:uppercase">{dia === hoy ? "Hoy" : etiquetaDia}</span>
            <Button variant="ghost" size="icon" className="size-8" asChild><Link href={`/atencion?dia=${moverDia(dia, 1)}`} aria-label="Día siguiente"><ChevronRight /></Link></Button>
          </div>
          {dia !== hoy && <Link href="/atencion" className="text-sm text-primary hover:underline">Volver a hoy</Link>}
          <span className="ml-auto text-sm text-muted-foreground">{citas.length} citas</span>
        </div>
        <ColaAtencion citas={citas} esHoy={dia === hoy} mensaje={{ servicio: org.nombre, plantilla: org.ajustes.mensaje_cita ?? PLANTILLA_CITA }} />
      </section>

      {/* Consultas recientes */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Consultas de los últimos 30 días</h2>
        <Card className="overflow-hidden py-0">
          {consultas.length === 0 ? (
            <div className="grid place-items-center gap-2 py-12 text-center text-muted-foreground">
              <ClipboardList className="size-8" />
              Aún no hay consultas. Atiende desde la cola, con Nueva consulta o desde la ficha de un paciente.
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
      </section>
    </div>
  );
}
