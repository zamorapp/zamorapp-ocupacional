import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CheckCircle2, ChevronLeft, ChevronRight, ClipboardList, FileSpreadsheet, FileText, Printer, Receipt, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { empresaActivaId } from "@/lib/empresa-activa";
import { listarEmpresas, soloEmpresas } from "@/lib/empresas";
import { sumarMeses } from "@/lib/fecha";
import { listarOrdenes, rangoMes, relacionMensual, resumenRelacion } from "@/lib/ordenes";
import { fecha } from "@/lib/pacientes";
import { puedePortal } from "@/lib/permisos-portal";
import { obtenerSesion } from "@/lib/sesion";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Órdenes y relación del mes" };
export const dynamic = "force-dynamic";

const nombreMes = (m: string) => {
  const t = new Intl.DateTimeFormat("es-VE", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${m}-15T12:00:00Z`));
  return t.charAt(0).toUpperCase() + t.slice(1);
};
const nOrden = (n: number) => String(n).padStart(5, "0");

// RR. HH.: sus órdenes de evaluación del mes y la relación de lo realizado, para cotejar con la nota de cobro y la
// factura. Sin datos médicos (la base solo entrega fecha, trabajador, tipo de evaluación, orden y cobro).
export default async function OrdenesYRelacion({ searchParams }: { searchParams: Promise<{ empresa?: string; mes?: string }> }) {
  const q = await searchParams;
  // RR. HH. sin el permiso «Ver los atendidos del mes» (Usuarios y roles) no entra aquí
  if (!puedePortal(await obtenerSesion(), "relacion")) notFound();
  const [todas, activa] = await Promise.all([listarEmpresas(true), empresaActivaId()]);
  const empresas = soloEmpresas(todas);
  const empresa = empresas.find((e) => e.id === q.empresa) ?? empresas.find((e) => e.id === activa) ?? empresas[0] ?? null;
  const { mes, desde, hasta } = rangoMes(q.mes);
  const [ordenes, filas] = empresa ? await Promise.all([listarOrdenes(empresa.id, desde, hasta), relacionMensual(empresa.id, desde, hasta)]) : [[], []];
  const r = resumenRelacion(filas);
  const enlace = (m: string) => `/portal/ordenes?${new URLSearchParams({ ...(empresa ? { empresa: empresa.id } : {}), mes: m })}`;
  const qs = new URLSearchParams({ ...(empresa ? { empresa: empresa.id } : {}), mes }).toString();
  const trabajadores = ordenes.reduce((s, o) => s + o.total, 0);

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link href="/portal" className="mb-1 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" /> Portal</Link>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Órdenes y relación del mes</h1>
          <p className="text-sm text-muted-foreground">{empresa?.razonSocial ?? "Sin empresa asignada"}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center rounded-md border">
            <Button variant="ghost" size="icon" asChild><Link href={enlace(sumarMeses(`${mes}-01`, -1).slice(0, 7))} aria-label="Mes anterior"><ChevronLeft /></Link></Button>
            <span className="min-w-36 text-center text-sm font-medium">{nombreMes(mes)}</span>
            <Button variant="ghost" size="icon" asChild><Link href={enlace(sumarMeses(`${mes}-01`, 1).slice(0, 7))} aria-label="Mes siguiente"><ChevronRight /></Link></Button>
          </div>
          <Button variant="outline" asChild><a href={`/imprimir/relacion?${qs}`}><Printer /> Imprimir relación</a></Button>
          <Button variant="outline" asChild><a href={`/portal/ordenes/excel?${qs}`}><FileSpreadsheet /> Excel</a></Button>
        </div>
      </div>

      {empresas.length > 1 && (
        <form className="flex flex-wrap items-center gap-2 text-sm">
          <input type="hidden" name="mes" value={mes} />
          <label htmlFor="empresa" className="text-muted-foreground">Empresa</label>
          <select id="empresa" name="empresa" defaultValue={empresa?.id} className="h-9 rounded-md border bg-background px-2">
            {empresas.map((e) => <option key={e.id} value={e.id}>{e.razonSocial}</option>)}
          </select>
          <Button type="submit" size="sm" variant="secondary">Ver</Button>
        </form>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { t: "Órdenes emitidas", v: String(ordenes.length), d: `${trabajadores} ${trabajadores === 1 ? "trabajador" : "trabajadores"}`, i: ClipboardList },
          { t: "Evaluaciones realizadas", v: String(r.total), d: r.porTipo.slice(0, 2).map(([t, n]) => `${n} ${t.replace(/^Evaluación /i, "").toLowerCase()}`).join(" · "), i: CheckCircle2 },
          { t: "Con orden", v: `${r.conOrden}`, d: r.total - r.conOrden ? `${r.total - r.conOrden} sin orden` : "Todas con orden", i: FileText },
          { t: "En nota de cobro", v: `${r.facturadas}/${r.total}`, d: r.total - r.facturadas ? `${r.total - r.facturadas} pendientes` : "Todo cobrado", i: Receipt },
        ].map(({ t, v, d, i: Icono }) => (
          <Card key={t} className="gap-1 py-4">
            <CardContent className="px-5">
              <div className="flex items-center gap-2 text-sm text-muted-foreground"><Icono className="size-4" /> {t}</div>
              <div className="text-3xl font-semibold tabular-nums">{v}</div>
              {d && <div className="text-xs text-muted-foreground">{d}</div>}
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2 text-base"><ClipboardList className="size-5 text-primary" /> Órdenes de evaluación</CardTitle></CardHeader>
        <CardContent className="px-0">
          {ordenes.length === 0 ? <p className="px-6 py-6 text-center text-sm text-muted-foreground">No hay órdenes en {nombreMes(mes).toLowerCase()}. Se crean solas al usar «Solicitar cita» en el portal.</p> : (
            <ul className="divide-y">
              {ordenes.map((o, k) => (
                <li key={`${o.id}-${k}`} className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-6 py-3 text-sm">
                  <div className="basis-full sm:basis-auto"><span className="rounded-md bg-primary/10 px-2 py-0.5 font-mono text-sm font-semibold text-primary">Nº {nOrden(o.numero)}</span></div>
                  <div className="min-w-0 flex-1 basis-52">
                    <div className="font-medium">{o.total} {o.total === 1 ? "trabajador" : "trabajadores"}{o.fecha && <span className="font-normal text-muted-foreground"> · cita el {fecha(o.fecha)}</span>}</div>
                    <div className="text-xs text-muted-foreground">Emitida el {fecha(o.creadoEn.slice(0, 10))} por {o.solicitante}</div>
                  </div>
                  <div className="flex min-w-36 flex-1 flex-col gap-1 sm:w-36 sm:flex-none">
                    <div className="h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-ok" style={{ width: `${(o.atendidas * 100) / Math.max(o.total, 1)}%` }} /></div>
                    <span className="text-xs text-muted-foreground">{o.atendidas} de {o.total} atendidos{o.canceladas ? ` · ${o.canceladas} no ${o.canceladas === 1 ? "fue" : "fueron"}` : ""}</span>
                  </div>
                  <Button variant="outline" size="sm" asChild><a href={`/imprimir/orden/${o.id}`}><Printer /> Ver e imprimir</a></Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Users className="size-5 text-primary" /> Relación de evaluaciones realizadas</CardTitle></CardHeader>
        <CardContent className="px-0">
          {filas.length === 0 ? <p className="px-6 py-6 text-center text-sm text-muted-foreground">Aún no hay evaluaciones realizadas en {nombreMes(mes).toLowerCase()}.</p> : (
            <>
              {/* Celular: tarjetas; computadora: tabla para cotejar renglón por renglón con la nota de cobro */}
              <ul className="divide-y md:hidden">
                {filas.map((f) => (
                  <li key={f.consultaId} className="px-6 py-2.5 text-sm">
                    <div className="flex items-center justify-between gap-2"><span className="font-medium">{f.trabajador}</span><span className="font-mono text-xs text-muted-foreground">{fecha(f.fecha)}</span></div>
                    <div className="text-xs text-muted-foreground">{f.cedula} · {f.evaluacion ?? "Sin tipo"}</div>
                    <div className="mt-1 flex flex-wrap gap-1.5 text-xs"><Orden f={f} /><Cobro f={f} /></div>
                  </li>
                ))}
              </ul>
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs text-muted-foreground">
                      {["Fecha", "Trabajador", "Cédula", "Evaluación", "Orden", "Nota de cobro", "Factura"].map((h) => <th key={h} className="px-4 py-2 font-medium first:pl-6">{h}</th>)}
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {filas.map((f) => (
                      <tr key={f.consultaId}>
                        <td className="px-4 py-2 pl-6 font-mono text-muted-foreground">{fecha(f.fecha)}</td>
                        <td className="px-4 py-2 font-medium">{f.trabajador}{f.cargo && <span className="block text-xs font-normal text-muted-foreground">{f.cargo}</span>}</td>
                        <td className="px-4 py-2 font-mono">{f.cedula}</td>
                        <td className="px-4 py-2 font-sans">{f.evaluacion ?? "—"}</td>
                        <td className="px-4 py-2"><Orden f={f} /></td>
                        <td className="px-4 py-2"><Cobro f={f} /></td>
                        <td className="px-4 py-2 font-mono">{f.factura ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
          <p className="px-6 pt-3 text-[11px] text-muted-foreground">Solo datos administrativos: nunca diagnósticos ni datos médicos. «Sin orden» = atención que no se pidió por el portal.</p>
        </CardContent>
      </Card>
    </div>
  );
}

function Orden({ f }: { f: { orden: number | null; ordenId: string | null } }) {
  return f.orden && f.ordenId
    ? <a href={`/imprimir/orden/${f.ordenId}`} className="rounded-full bg-primary/10 px-2 py-0.5 font-mono text-xs font-medium text-primary hover:underline">Nº {nOrden(f.orden)}</a>
    : <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">Sin orden</span>;
}

function Cobro({ f }: { f: { notaCobro: number | null; estadoCobro: string | null } }) {
  if (!f.notaCobro) return <span className="rounded-full bg-aviso/20 px-2 py-0.5 text-xs font-medium text-aviso-texto">Pendiente</span>;
  return <span className={cn("rounded-full px-2 py-0.5 font-mono text-xs font-medium", f.estadoCobro === "pagada" ? "bg-ok/15 text-ok-texto" : "bg-primary/15 text-primary")}>Nota {f.notaCobro}{f.estadoCobro === "pagada" ? " · pagada" : ""}</span>;
}
