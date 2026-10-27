import Link from "next/link";
import { ArrowRight, CalendarClock, HardHat } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Accidentabilidad, VencimientoEmpresa } from "@/lib/panel";
import { cn } from "@/lib/utils";

// Exámenes periódicos de cada empresa: barra vencidos / por vencer / al día / sin evaluación
export function VencimientosPorEmpresa({ filas }: { filas: VencimientoEmpresa[] }) {
  const MAX = 6;
  const tramos = (v: VencimientoEmpresa) => [
    { n: v.vencidos, color: "bg-alerta", t: "vencidos", texto: "text-alerta-texto" },
    { n: v.por_vencer, color: "bg-aviso", t: "por vencer", texto: "text-aviso-texto" },
    { n: v.al_dia - v.por_vencer, color: "bg-ok", t: "al día", texto: "" },
    { n: v.sin_evaluar, color: "bg-muted-foreground/35", t: "sin evaluación", texto: "" },
  ];
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <CalendarClock className="size-5 shrink-0 text-primary" /> Exámenes periódicos
          <Button variant="ghost" size="sm" className="-my-2 ml-auto" aria-label="Ver reporte de vencimientos" asChild><Link href="/reportes/vencimientos"><span className="hidden sm:inline">Ver reporte</span><ArrowRight /></Link></Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1">
        {filas.slice(0, MAX).map((v) => {
          const alDia = v.activos ? Math.round((v.al_dia * 100) / v.activos) : 0;
          return (
            <Link key={v.id} href={`/reportes/vencimientos?empresa=${v.id}`} className="-mx-2 block space-y-1.5 rounded-lg px-2 py-2 transition hover:bg-muted/50">
              <div className="flex items-baseline gap-2 text-sm">
                <span className="min-w-0 flex-1 truncate font-medium">{v.empresa}</span>
                <span className={cn("shrink-0 text-xs tabular-nums", alDia >= 95 ? "text-ok-texto" : alDia >= 80 ? "text-aviso-texto" : "text-alerta-texto")}>{alDia} % al día</span>
              </div>
              <div className="flex h-2 overflow-hidden rounded-full bg-muted" role="img" aria-label={tramos(v).map((t) => `${t.n} ${t.t}`).join(", ")}>
                {tramos(v).map((t) => t.n > 0 && <div key={t.t} className={t.color} style={{ width: `${(t.n / Math.max(v.activos, 1)) * 100}%` }} />)}
              </div>
              <div className="flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                {tramos(v).filter((t) => t.n > 0 && t.t !== "al día").map((t) => <span key={t.t} className={t.texto}>{t.n} {t.t}</span>)}
                <span className="ml-auto tabular-nums">{v.activos} activos · cada {v.periodicidad_meses} meses</span>
              </div>
            </Link>
          );
        })}
        {filas.length > MAX && <p className="pt-1 text-xs text-muted-foreground">Y {filas.length - MAX} empresas más en el reporte.</p>}
      </CardContent>
    </Card>
  );
}

// Últimos 12 meses: índices del período (sobre los totales) y accidentes de cada mes
export function AccidentabilidadAnual({ datos }: { datos: Accidentabilidad }) {
  const total = (k: "hht" | "accidentes" | "con_tiempo_perdido" | "dias_perdidos" | "dias_cargados") => datos.meses.reduce((s, m) => s + Number(m[k] ?? 0), 0);
  const hht = total("hht");
  const indice = (n: number) => (hht > 0 ? ((n * 1_000_000) / hht).toLocaleString("es-VE", { maximumFractionDigits: 1 }) : "—");
  const max = Math.max(1, ...datos.meses.map((m) => m.accidentes));
  const estimado = datos.meses.some((m) => m.metodo !== "Nómina");
  const enlace = `/reportes/accidentalidad?p=rango&desde=${datos.desde}&hasta=${datos.hasta}&o_nivel=consolidado`;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <HardHat className="size-5 shrink-0 text-primary" /> Accidentabilidad <span className="text-sm font-normal whitespace-nowrap text-muted-foreground">12 meses</span>
          <Button variant="ghost" size="sm" className="-my-2 ml-auto" aria-label="Ver reporte de accidentabilidad" asChild><Link href={enlace}><span className="hidden sm:inline">Ver reporte</span><ArrowRight /></Link></Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <dl className="grid grid-cols-3 gap-3">
          {[
            { t: "IF neta", v: indice(total("con_tiempo_perdido")) },
            { t: "Í. severidad", v: indice(total("dias_perdidos") + total("dias_cargados")) },
            { t: "Accidentes", v: total("accidentes").toLocaleString("es-VE") },
          ].map((x) => (
            <div key={x.t}>
              <dt className="text-xs text-muted-foreground">{x.t}</dt>
              <dd className="text-2xl font-semibold tabular-nums">{x.v}</dd>
            </div>
          ))}
        </dl>
        <div className="flex h-24 items-end gap-1" role="img" aria-label="Accidentes por mes">
          {datos.meses.map((m) => (
            <div key={m.mes} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1" title={`${m.periodo}: ${m.accidentes} accidentes (${m.con_tiempo_perdido} con tiempo perdido) · IF neta ${m.ifn ?? "—"}`}>
              <div className={cn("w-full max-w-5 rounded-t", m.con_tiempo_perdido > 0 ? "bg-alerta" : m.accidentes > 0 ? "bg-aviso" : "bg-muted")} style={{ height: m.accidentes ? `${Math.max(8, (m.accidentes / max) * 100)}%` : "3px" }} />
              <span className="text-[10px] text-muted-foreground uppercase">{m.periodo.slice(0, 1)}</span>
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">Por millón de horas hombre (COVENIN 474).{estimado ? " Incluye horas estimadas donde no hay nómina cargada." : ""}</p>
      </CardContent>
    </Card>
  );
}
