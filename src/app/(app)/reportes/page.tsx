import type { Metadata } from "next";
import Link from "next/link";
import { FileBarChart2, ShieldAlert } from "lucide-react";
import { Barras } from "@/components/app/barras";
import { Semaforo } from "@/components/app/semaforo";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ETIQUETA_ORIGEN, type Origen } from "@/lib/consultas-tipos";
import { empresaActivaId } from "@/lib/empresa-activa";
import { listarEmpresas } from "@/lib/empresas";
import { opciones } from "@/lib/listas";
import { indicadoresAusentismo, obtenerReporte, resolverPeriodo, resumenEjecutivo } from "@/lib/reportes";
import { obtenerSesion } from "@/lib/sesion";

export const metadata: Metadata = { title: "Reportes" };
export const dynamic = "force-dynamic";

const PERIODOS = [
  ["mes", "Este mes"],
  ["trimestre", "Este trimestre"],
  ["trimestre_anterior", "Trimestre anterior"],
  ["anio", "Este año"],
  ["rango", "Rango"],
] as const;

type Props = { searchParams: Promise<{ p?: string; desde?: string; hasta?: string }> };

function Indicador({ titulo, valor, detalle, estado }: { titulo: string; valor: string; detalle: string; estado?: "ok" | "aviso" | "alerta" }) {
  return (
    <Card className="gap-1 py-4">
      <CardContent className="space-y-1 px-5">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">{estado && <Semaforo estado={estado} />}{titulo}</div>
        <div className="text-2xl font-semibold tracking-tight">{valor}</div>
        <div className="text-xs text-muted-foreground">{detalle}</div>
      </CardContent>
    </Card>
  );
}

export default async function Reportes({ searchParams }: Props) {
  const [q, sesion, empresaId, empresas] = await Promise.all([searchParams, obtenerSesion(), empresaActivaId(), listarEmpresas()]);
  const periodo = resolverPeriodo(q.p, q.desde, q.hasta);
  const [r, listas] = await Promise.all([
    sesion.demo ? null : obtenerReporte(empresaId, periodo),
    opciones(sesion.orgId, ["causa_reposo", "ente_emisor_reposo", "clasificacion_aptitud"]),
  ]);
  const nombre = (lista: string) => Object.fromEntries(listas[lista].map((i) => [i.codigo ?? i.nombre, i.nombre]));
  const causas = nombre("causa_reposo");
  const entes = nombre("ente_emisor_reposo");
  const aptitudes = nombre("clasificacion_aptitud");
  const empresa = empresas.find((e) => e.id === empresaId)?.razonSocial ?? "Todas las empresas";
  const params = new URLSearchParams({ p: periodo.clave, desde: periodo.desde, hasta: periodo.hasta, ...(empresaId ? { empresa: empresaId } : {}) });

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Reportes</h1>
          <p className="text-muted-foreground"><span className="first-letter:uppercase">{periodo.etiqueta}</span> · {empresa}</p>
        </div>
        <Button asChild disabled={!r}>
          <Link href={`/imprimir/vigilancia?${params}`} target="_blank"><FileBarChart2 /> Informe trimestral de vigilancia</Link>
        </Button>
      </div>

      <form className="flex flex-wrap items-end gap-2">
        <div className="flex flex-wrap gap-1 rounded-lg border bg-card p-1">
          {PERIODOS.filter(([k]) => k !== "rango").map(([k, t]) => (
            <Link
              key={k}
              href={`/reportes?p=${k}`}
              className={`rounded-md px-3 py-1.5 text-sm transition ${periodo.clave === k ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
            >
              {t}
            </Link>
          ))}
        </div>
        <input type="hidden" name="p" value="rango" />
        <input type="date" name="desde" defaultValue={periodo.desde} className="h-10 rounded-md border bg-card px-3 text-sm" />
        <input type="date" name="hasta" defaultValue={periodo.hasta} className="h-10 rounded-md border bg-card px-3 text-sm" />
        <Button type="submit" variant="outline">Ver rango</Button>
        <span className="text-xs text-muted-foreground">La empresa se elige arriba, en el selector del encabezado.</span>
      </form>

      {!r ? (
        <div className="flex items-center gap-3 rounded-lg border border-aviso/40 bg-aviso/10 px-4 py-3 text-sm">
          <ShieldAlert className="size-5 text-amber-600" /> Conecta Supabase para ver los reportes.
        </div>
      ) : (
        <>
          {(() => {
            const { pad, pct } = indicadoresAusentismo(r);
            return (
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
                <Indicador titulo="Población" valor={String(r.poblacion.total)} detalle={`${r.poblacion.femenino} F · ${r.poblacion.masculino} M`} />
                <Indicador titulo="Consultas" valor={String(r.consultas.total)} detalle={`${r.consultas.pacientes} pacientes`} />
                <Indicador titulo="Preventivas" valor={String(r.consultas.preventivas)} detalle={`${r.consultas.no_preventivas} no preventivas`} />
                <Indicador titulo="Días perdidos" valor={String(r.ausentismo.dias_perdidos)} detalle={`${r.ausentismo.reposos} reposos · PAD ${pad.toLocaleString("es-VE")}`} />
                <Indicador titulo="% ausentismo" valor={`${pct.toLocaleString("es-VE")} %`} detalle="Meta < 2,5 %" estado={pct < 2.5 ? "ok" : "alerta"} />
              </div>
            );
          })()}

          {r.poblacion.total > 0 && r.poblacion.total < 10 && (
            <p className="rounded-md bg-aviso/10 px-4 py-2 text-sm">Población menor a 10 trabajadores: los índices tienen baja comparabilidad.</p>
          )}

          <Card>
            <CardHeader><CardTitle className="text-base">Resumen ejecutivo</CardTitle></CardHeader>
            <CardContent>
              <ul className="list-disc space-y-1 pl-5 text-sm">{resumenEjecutivo(r, causas).map((f) => <li key={f}>{f}</li>)}</ul>
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader><CardTitle className="text-base">Consultas por motivo</CardTitle></CardHeader>
              <CardContent><Barras filas={r.consultas.por_motivo} /></CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-base">Morbilidad por aparatos y sistemas</CardTitle></CardHeader>
              <CardContent><Barras filas={r.morbilidad.por_sistema} color="bg-chart-2" /></CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-base">Diez primeras causas de morbilidad</CardTitle></CardHeader>
              <CardContent>
                <Barras filas={r.morbilidad.primeras_causas.map((c) => ({ nombre: `${c.cie10} ${c.descripcion}`, n: c.n }))} color="bg-aviso" />
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-base">Origen de los diagnósticos</CardTitle></CardHeader>
              <CardContent>
                <Barras filas={Object.entries(r.morbilidad.por_origen).map(([k, n]) => ({ nombre: ETIQUETA_ORIGEN[k as Origen] ?? k, n }))} color="bg-alerta" />
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-base">Ausentismo por causa (días)</CardTitle></CardHeader>
              <CardContent>
                <Barras filas={r.ausentismo.por_causa.map((c) => ({ nombre: causas[c.nombre] ?? c.nombre, n: c.dias, detalle: `${c.n} rep.` }))} sufijo="d" color="bg-alerta" />
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-base">Reposos por ente emisor</CardTitle></CardHeader>
              <CardContent><Barras filas={r.ausentismo.por_ente.map((c) => ({ nombre: entes[c.nombre] ?? c.nombre, n: c.n }))} /></CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-base">Consultas por grupo de edad</CardTitle></CardHeader>
              <CardContent><Barras filas={r.consultas.por_edad.map((e) => ({ nombre: e.grupo, n: e.n }))} color="bg-chart-3" /></CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-base">Aptitud emitida</CardTitle></CardHeader>
              <CardContent>
                <Barras filas={Object.entries(r.aptitud).map(([k, n]) => ({ nombre: aptitudes[k] ?? k, n }))} color="bg-ok" />
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
