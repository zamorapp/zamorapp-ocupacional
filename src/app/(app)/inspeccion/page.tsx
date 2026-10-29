import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { ArrowRight, Printer, ShieldCheck } from "lucide-react";
import { BotonNotificarTrabajadores } from "@/components/app/notificacion-riesgos";
import { Semaforo } from "@/components/app/semaforo";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { empresaActivaId } from "@/lib/empresa-activa";
import { listarEmpresas } from "@/lib/empresas";
import { CLAVES_CRITERIOS, periodoInspeccion, resumenInspeccion } from "@/lib/inspeccion";
import { ROLES_NOTIFICAN } from "@/lib/notificacion-riesgos";
import { obtenerSesion, type Sesion } from "@/lib/sesion";
import { cn } from "@/lib/utils";
import { QueEs } from "./que-es";

export const metadata: Metadata = { title: "Cumplimiento INPSASEL" };
export const dynamic = "force-dynamic";

const fecha = (v: string | null) => (v ? v.slice(0, 10).split("-").reverse().join("/") : "—");

// Cumplimiento INPSASEL: índice por empresa y paquete imprimible para la inspección (la ruta sigue siendo /inspeccion)
export default async function Inspeccion({ searchParams }: { searchParams: Promise<{ empresa?: string; desde?: string; hasta?: string }> }) {
  const q = await searchParams;
  const [sesion, todas, activa] = await Promise.all([obtenerSesion(), listarEmpresas(), empresaActivaId()]);
  const empresas = todas.filter((e) => e.activa);
  const empresaId = q.empresa && empresas.some((e) => e.id === q.empresa) ? q.empresa : activa ?? empresas[0]?.id;
  const { desde, hasta } = periodoInspeccion(q.desde, q.hasta);
  const medir = !sesion.demo && sesion.orgId && empresaId;

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold"><ShieldCheck className="size-6 text-primary" /> Cumplimiento INPSASEL</h1>
          <p className="text-sm text-muted-foreground">Lo que revisa un inspector del INPSASEL, medido con tus registros, y listo para imprimir en un solo paquete.</p>
        </div>
        {medir && (
          <Button asChild><Link href={`/imprimir/inspeccion/${empresaId}?desde=${desde}&hasta=${hasta}`} target="_blank"><Printer /> Imprimir paquete</Link></Button>
        )}
      </div>

      <QueEs />

      <form className="flex flex-wrap items-end gap-3 rounded-xl border bg-card p-3">
        <label className="min-w-56 flex-1 text-sm">
          <span className="mb-1 block text-muted-foreground">Empresa</span>
          <select name="empresa" defaultValue={empresaId} className="h-10 w-full rounded-md border bg-transparent px-3 text-sm">
            {empresas.map((e) => <option key={e.id} value={e.id}>{e.razonSocial}</option>)}
          </select>
        </label>
        <label className="text-sm"><span className="mb-1 block text-muted-foreground">Desde</span><Input type="date" name="desde" defaultValue={desde} /></label>
        <label className="text-sm"><span className="mb-1 block text-muted-foreground">Hasta</span><Input type="date" name="hasta" defaultValue={hasta} /></label>
        <Button type="submit" variant="outline">Ver</Button>
      </form>

      {!medir ? (
        <p className="rounded-xl border p-6 text-sm text-muted-foreground">{sesion.demo ? "Conecta Supabase para medir el cumplimiento." : "Elige una empresa."}</p>
      ) : (
        // El encabezado y el formulario salen al instante; los criterios llegan cuando la base termina de contar
        <Suspense key={`${empresaId}${desde}${hasta}`} fallback={<EsqueletoCriterios />}>
          <Criterios sesion={sesion} empresaId={empresaId} desde={desde} hasta={hasta} />
        </Suspense>
      )}
    </div>
  );
}

async function Criterios({ sesion, empresaId, desde, hasta }: { sesion: Sesion; empresaId: string; desde: string; hasta: string }) {
  const d = await resumenInspeccion(empresaId, desde, hasta);
  if (!d) return <p className="rounded-xl border p-6 text-sm text-muted-foreground">Elige una empresa.</p>;
  const sinNotificar = d.pendientes.filter((t) => t.con_puesto);
  // Nunca notificados o desactualizados: necesitan una notificación nueva (los que solo deben el acuse, no)
  const porNotificar = sinNotificar.filter((t) => !t.notificado_en || t.firmado_en).map((t) => t.id);
  return (
    <>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[16rem_minmax(0,1fr)]">
            <Card className="items-center justify-center gap-2 py-6 text-center">
              <div className={cn("text-5xl font-bold tabular-nums", d.puntaje === null ? "text-muted-foreground" : d.puntaje >= 100 ? "text-ok-texto" : d.puntaje >= 80 ? "text-aviso-texto" : "text-alerta-texto")}>
                {d.puntaje === null ? "—" : `${d.puntaje} %`}
              </div>
              <div className="text-sm text-muted-foreground">Índice de cumplimiento</div>
              <div className="text-xs text-muted-foreground">{fecha(desde)} al {fecha(hasta)}</div>
            </Card>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {d.criterios.map((c) => (
                <div key={c.clave} className={cn("flex items-start gap-3 rounded-xl border p-3", c.estado === "alerta" && "border-alerta/40 bg-alerta/5", c.estado === "aviso" && "border-aviso/50 bg-aviso/5")}>
                  {c.estado === "no_aplica" ? <span className="mt-1.5 size-2.5 shrink-0 rounded-full bg-muted-foreground/30" /> : <Semaforo estado={c.estado} className="mt-1.5" />}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-sm font-medium">{c.titulo}</span>
                      <span className="shrink-0 font-mono text-sm tabular-nums">{c.estado === "no_aplica" ? "n/a" : `${c.cumplidos}/${c.total}`}</span>
                    </div>
                    <div className="text-xs text-muted-foreground">{c.detalle} · {c.base}</div>
                  </div>
                  {/* La notificación de riesgos se corrige aquí mismo: su flecha baja a la lista «sin notificación» */}
                  {(c.href || (c.clave === "notificacion" && sinNotificar.length > 0)) && (
                    <Link href={c.href ?? "#sin-notificar"} className="mt-0.5 text-muted-foreground hover:text-primary" aria-label={`Corregir: ${c.titulo}`}><ArrowRight className="size-4" /></Link>
                  )}
                </div>
              ))}
            </div>
          </div>

          {sinNotificar.length > 0 && (
            <Card id="sin-notificar" className="scroll-mt-20">
              <CardHeader className="flex flex-row items-center justify-between gap-3">
                <CardTitle className="text-base">Sin notificación de riesgos vigente y firmada ({sinNotificar.length})</CardTitle>
                {ROLES_NOTIFICAN.includes(sesion.rol ?? "") && <BotonNotificarTrabajadores ids={porNotificar} />}
              </CardHeader>
              <CardContent>
                <ul className="grid grid-cols-1 gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
                  {sinNotificar.slice(0, 40).map((t) => (
                    <li key={t.id} className="flex items-center justify-between gap-2 border-b py-1">
                      <Link href={`/pacientes/${t.id}`} className="truncate hover:text-primary">{t.nombre}</Link>
                      <span className="shrink-0 text-xs text-muted-foreground">{!t.notificado_en ? "nunca" : !t.firmado_en ? `sin acuse (${fecha(t.notificado_en)})` : "desactualizada"}</span>
                    </li>
                  ))}
                </ul>
                {sinNotificar.length > 40 && <p className="mt-2 text-xs text-muted-foreground">Y {sinNotificar.length - 40} más: salen todos en el paquete impreso.</p>}
                {d.pendientes.length > sinNotificar.length && <p className="mt-2 text-xs text-muted-foreground">{d.pendientes.length - sinNotificar.length} sin puesto asignado: asígnalo para poder notificar.</p>}
              </CardContent>
            </Card>
          )}
    </>
  );
}

function EsqueletoCriterios() {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[16rem_minmax(0,1fr)]" role="status" aria-busy="true" aria-label="Calculando el cumplimiento">
      <div className="h-36 animate-pulse rounded-xl border bg-muted/40" />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {CLAVES_CRITERIOS.map((c) => <div key={c} className="h-16 animate-pulse rounded-xl border bg-muted/40" />)}
      </div>
    </div>
  );
}
