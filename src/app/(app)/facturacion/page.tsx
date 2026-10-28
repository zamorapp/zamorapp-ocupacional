import type { Metadata } from "next";
import Link from "next/link";
import { FilePlus2, Printer, Receipt } from "lucide-react";
import { NuevoPresupuesto } from "./nuevo-presupuesto";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { hoyCaracas } from "@/lib/fecha";
import { empresaActivaId } from "@/lib/empresa-activa";
import { listarEmpresas } from "@/lib/empresas";
import { listarAtenciones, listarCobros, listarServicios, tasaVigente } from "@/lib/facturacion";
import { bs, type Cobro, etiquetaEstado, totales, usd } from "@/lib/facturacion-tipos";
import { ETIQUETA_APTITUD, type Aptitud, fecha } from "@/lib/pacientes";
import { resolverPeriodo } from "@/lib/reportes";
import { obtenerSesion } from "@/lib/sesion";
import { cn } from "@/lib/utils";
import { Servicios } from "./servicios";
import { TasaBcv } from "./tasa-bcv";

export const metadata: Metadata = { title: "Facturación" };
export const dynamic = "force-dynamic";

const VISTAS = [
  ["cobros", "Notas de cobro"],
  ["cuentas", "Cuentas por cobrar"],
  ["presupuestos", "Presupuestos"],
  ["atendidos", "Pacientes atendidos"],
  ["servicios", "Servicios y precios"],
] as const;

const ESTILO: Record<Cobro["estado"], string> = {
  borrador: "bg-muted text-muted-foreground", emitida: "bg-primary/15 text-primary", pagada: "bg-ok/15 text-ok-texto", anulada: "bg-alerta/15 text-alerta-texto",
  aprobado: "bg-ok/15 text-ok-texto", rechazado: "bg-alerta/15 text-alerta-texto", convertido: "bg-muted text-muted-foreground",
};
const dias = (iso: string, hoy: string) => Math.round((Date.parse(hoy) - Date.parse(iso)) / 864e5);

type Props = { searchParams: Promise<{ vista?: string; p?: string; desde?: string; hasta?: string }> };

export default async function Facturacion({ searchParams }: Props) {
  const [q, sesion, empresaId, empresas, tasa] = await Promise.all([searchParams, obtenerSesion(), empresaActivaId(), listarEmpresas(), tasaVigente()]);
  const vista = VISTAS.some(([k]) => k === q.vista) ? q.vista! : "cobros";
  const editable = !sesion.demo && ["administrador", "gerente_medico", "recepcion"].includes(sesion.rol ?? "");
  const periodo = resolverPeriodo(q.p ?? "mes", q.desde, q.hasta);
  const empresa = empresas.find((e) => e.id === empresaId);

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Facturación</h1>
          <p className="text-muted-foreground">Servicios, pacientes atendidos y notas de cobro a las empresas clientes.</p>
        </div>
        <TasaBcv actual={tasa} hoy={hoyCaracas()} editable={editable} />
      </div>

      <div className="flex flex-wrap gap-1 rounded-lg border bg-card p-1">
        {VISTAS.map(([k, t]) => (
          <Link key={k} href={`/facturacion?vista=${k}`} className={cn("rounded-md px-3 py-1.5 text-sm transition", vista === k ? "bg-primary text-primary-foreground" : "hover:bg-muted")}>{t}</Link>
        ))}
      </div>

      {vista === "servicios" && <Servicios servicios={await listarServicios()} editable={editable} />}

      {vista === "cuentas" && (async () => {
        // Notas emitidas sin pagar, agrupadas por empresa y por antigüedad
        const hoy = hoyCaracas();
        const abiertas = (await listarCobros()).filter((c) => c.tipo === "cobro" && c.estado === "emitida" && (!empresaId || c.empresaId === empresaId));
        const porEmpresa = new Map<string, { empresa: string; tramos: number[]; total: number; notas: number }>();
        for (const c of abiertas) {
          const e = porEmpresa.get(c.empresaId) ?? { empresa: c.empresa, tramos: [0, 0, 0, 0], total: 0, notas: 0 };
          const t = totales(c).total, d = dias(c.fecha, hoy);
          e.tramos[d <= 30 ? 0 : d <= 60 ? 1 : d <= 90 ? 2 : 3] += t;
          e.total += t; e.notas += 1;
          porEmpresa.set(c.empresaId, e);
        }
        const filas = [...porEmpresa.values()].sort((a, b) => b.total - a.total);
        const suma = (i: number) => filas.reduce((s, f) => s + f.tramos[i], 0);
        return (
          <Card className="overflow-hidden py-0">
            {filas.length === 0 ? (
              <p className="py-12 text-center text-sm text-muted-foreground">No hay notas de cobro emitidas pendientes de pago.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40 hover:bg-muted/40">
                    <TableHead className="pl-5">Empresa</TableHead><TableHead className="text-right">0-30 días</TableHead><TableHead className="text-right">31-60</TableHead>
                    <TableHead className="text-right">61-90</TableHead><TableHead className="text-right">Más de 90</TableHead><TableHead className="pr-5 text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filas.map((f) => (
                    <TableRow key={f.empresa}>
                      <TableCell className="pl-5 font-medium">{f.empresa}<div className="text-xs text-muted-foreground">{f.notas} {f.notas === 1 ? "nota" : "notas"}</div></TableCell>
                      {f.tramos.map((m, i) => <TableCell key={i} className={cn("text-right tabular-nums", i === 3 && m > 0 && "font-medium text-alerta-texto")}>{m ? usd(m) : "—"}</TableCell>)}
                      <TableCell className="pr-5 text-right font-semibold tabular-nums">{usd(f.total)}</TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="bg-muted/40 font-semibold">
                    <TableCell className="pl-5">Total por cobrar</TableCell>
                    {[0, 1, 2, 3].map((i) => <TableCell key={i} className="text-right tabular-nums">{usd(suma(i))}</TableCell>)}
                    <TableCell className="pr-5 text-right tabular-nums">{usd(filas.reduce((s, f) => s + f.total, 0))}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            )}
          </Card>
        );
      })()}

      {(vista === "cobros" || vista === "presupuestos") && (async () => {
        const tipo = vista === "presupuestos" ? "presupuesto" : "cobro";
        const cobros = (await listarCobros()).filter((c) => c.tipo === tipo && (!empresaId || c.empresaId === empresaId));
        return (
          <div className="space-y-3">
          {tipo === "presupuesto" && editable && (
            <div className="flex items-center gap-3">
              <span className="text-sm text-muted-foreground">{empresa ? `Para ${empresa.razonSocial}` : "Elige la empresa arriba para cotizarle"}</span>
              <div className="ml-auto"><NuevoPresupuesto empresaId={empresaId} /></div>
            </div>
          )}
          <Card className="overflow-hidden py-0">
            {cobros.length === 0 ? (
              <div className="grid place-items-center gap-2 py-14 text-center text-muted-foreground">
                <Receipt className="size-8" />
                {tipo === "presupuesto" ? "Sin presupuestos. Elige la empresa y crea uno con los servicios que le ofreces." : "Sin notas de cobro. Ve a «Pacientes atendidos», elige empresa y periodo, y crea la nota."}
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40 hover:bg-muted/40">
                    <TableHead className="pl-5">Nº</TableHead><TableHead>Empresa</TableHead><TableHead>{tipo === "presupuesto" ? "Válido hasta" : "Periodo"}</TableHead>
                    <TableHead className="text-right">Total</TableHead><TableHead className="pr-5">Estado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {cobros.map((c) => {
                    const t = totales(c);
                    return (
                      <TableRow key={c.id}>
                        <TableCell className="pl-5"><Link href={`/facturacion/${c.id}`} className="font-medium hover:text-primary">#{c.numero}</Link><div className="text-xs text-muted-foreground">{fecha(c.fecha)}</div></TableCell>
                        <TableCell><Link href={`/facturacion/${c.id}`} className="hover:text-primary">{c.empresa}</Link></TableCell>
                        <TableCell className="text-sm">{tipo === "presupuesto" ? fecha(c.vence) : c.desde ? `${fecha(c.desde)} al ${fecha(c.hasta)}` : "—"}</TableCell>
                        <TableCell className="text-right tabular-nums"><div className="font-medium">{usd(t.total)}</div>{t.totalBs !== null && <div className="text-xs text-muted-foreground">{bs(t.totalBs)}</div>}</TableCell>
                        <TableCell className="pr-5"><span className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium", ESTILO[c.estado])}>{etiquetaEstado(c.tipo, c.estado)}</span></TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </Card>
          </div>
        );
      })()}

      {vista === "atendidos" && (async () => {
        const atenciones = sesion.demo ? [] : await listarAtenciones(empresaId, periodo.desde, periodo.hasta);
        const pendientes = atenciones.filter((a) => !a.cobroId).length;
        const params = new URLSearchParams({ desde: periodo.desde, hasta: periodo.hasta, ...(empresaId ? { empresa: empresaId } : {}) });
        return (
          <div className="space-y-3">
            <form className="flex flex-wrap items-end gap-2">
              <input type="hidden" name="vista" value="atendidos" />
              <input type="hidden" name="p" value="rango" />
              <input type="date" name="desde" defaultValue={periodo.desde} className="h-10 rounded-md border bg-card px-3 text-sm" />
              <input type="date" name="hasta" defaultValue={periodo.hasta} className="h-10 rounded-md border bg-card px-3 text-sm" />
              <Button type="submit" variant="outline">Ver</Button>
              <span className="text-sm text-muted-foreground">{empresa?.razonSocial ?? "Todas las empresas (elige una arriba para cobrar)"}</span>
              <div className="ml-auto flex gap-2">
                <Button variant="outline" asChild><Link href={`/imprimir/atendidos?${params}`} target="_blank"><Printer /> Reporte</Link></Button>
                {editable && empresaId && pendientes > 0 && (
                  <Button asChild><Link href={`/facturacion/nuevo?${params}`}><FilePlus2 /> Crear nota de cobro ({pendientes})</Link></Button>
                )}
              </div>
            </form>
            <Card className="overflow-hidden py-0">
              {atenciones.length === 0 ? (
                <p className="py-12 text-center text-sm text-muted-foreground">Sin consultas cerradas en el periodo.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40 hover:bg-muted/40">
                      <TableHead className="pl-5">Fecha</TableHead><TableHead>Paciente</TableHead><TableHead>Cargo</TableHead>
                      <TableHead>Motivo</TableHead><TableHead>Aptitud</TableHead><TableHead className="pr-5">Cobro</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {atenciones.map((a) => (
                      <TableRow key={a.id}>
                        <TableCell className="pl-5 font-mono text-sm">{fecha(a.fecha)}</TableCell>
                        <TableCell>{a.paciente}<div className="text-xs text-muted-foreground">{a.cedula}</div></TableCell>
                        <TableCell className="text-sm">{a.cargo ?? "—"}</TableCell>
                        <TableCell className="text-sm">{a.motivo ?? "—"}</TableCell>
                        <TableCell className="text-sm">{a.aptitud ? ETIQUETA_APTITUD[a.aptitud as Aptitud] : "—"}</TableCell>
                        <TableCell className="pr-5 text-sm">{a.cobroId ? <Link href={`/facturacion/${a.cobroId}`} className="text-primary hover:underline">Cobrada</Link> : <span className="text-muted-foreground">Pendiente</span>}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </Card>
          </div>
        );
      })()}
    </div>
  );
}
