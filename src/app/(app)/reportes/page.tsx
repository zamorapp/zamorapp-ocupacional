import type { Metadata } from "next";
import Link from "next/link";
import { FileBarChart2, ShieldAlert } from "lucide-react";
import { Barras } from "@/components/app/barras";
import { Semaforo } from "@/components/app/semaforo";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ETIQUETA_ORIGEN, type Origen } from "@/lib/consultas-tipos";
import { empresaActivaId } from "@/lib/empresa-activa";
import { parametrosPeriodo, type ConsultaPeriodo } from "@/lib/periodos";
import { indicesCovenin, tasasEnfermedadOcupacional } from "@/lib/reportes";
import { obtenerSesion } from "@/lib/sesion";
import { cargarVigilancia } from "@/lib/vigilancia";
import { EditorInforme } from "./editor-informe";
import { ExploradorCausas } from "./explorador-causas";
import { SelectorPeriodo } from "./selector-periodo";

export const metadata: Metadata = { title: "Reportes" };
export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<ConsultaPeriodo> };

const ROLES_REDACTAN = ["administrador", "gerente_medico", "medico", "enfermeria", "coordinador_sst"];

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

function Grafico({ titulo, children, detalle }: { titulo: string; children: React.ReactNode; detalle?: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{titulo}</CardTitle>
        {detalle && <CardDescription>{detalle}</CardDescription>}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

const num = (n: number | null | undefined) => (n === null || n === undefined ? "—" : n.toLocaleString("es-VE"));

export default async function Reportes({ searchParams }: Props) {
  const [q, sesion, empresaId] = await Promise.all([searchParams, obtenerSesion(), empresaActivaId()]);
  const v = await cargarVigilancia(sesion, empresaId, q);
  const { r, acc, periodo, empresa, causas, entes, aptitudes, ausentismo } = v;
  const params = new URLSearchParams({ ...parametrosPeriodo(periodo), ...(empresaId ? { empresa: empresaId } : {}) });
  const enlaceImprimir = `/imprimir/vigilancia?${params}`;

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Reportes</h1>
          <p className="text-muted-foreground">Vigilancia epidemiológica · {empresa?.razonSocial ?? "Todas las empresas"} <span className="text-xs">(la empresa se elige arriba, en el encabezado)</span></p>
        </div>
        <Button asChild disabled={!r}>
          <Link href={enlaceImprimir} target="_blank"><FileBarChart2 /> Imprimir informe trimestral</Link>
        </Button>
      </div>

      <SelectorPeriodo key={`${periodo.desde}${periodo.hasta}${empresaId}`} periodo={periodo} inicioEmpresa={empresa?.mesInicioGestion ?? 1} empresa={empresa?.razonSocial ?? null} />

      {!r ? (
        <div className="flex items-center gap-3 rounded-lg border border-aviso/40 bg-aviso/10 px-4 py-3 text-sm">
          <ShieldAlert className="size-5 text-aviso-texto" /> Conecta Supabase para ver los reportes.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
            <Indicador titulo="Población" valor={String(r.poblacion.total)} detalle={`${r.poblacion.femenino} F · ${r.poblacion.masculino} M`} />
            <Indicador titulo="Consultas" valor={String(r.consultas.total)} detalle={`${r.consultas.pacientes} pacientes · ${r.consultas.preventivas} preventivas`} />
            <Indicador titulo="Prevalencia" valor={`${num(r.poblacion.total ? Math.round(((r.morbilidad.pacientes ?? 0) * 1000) / r.poblacion.total) / 10 : 0)} %`} detalle={`${r.morbilidad.total} diagnósticos`} />
            <Indicador titulo="Días perdidos" valor={String(r.ausentismo.dias_perdidos)} detalle={`${r.ausentismo.reposos} reposos · PAD ${num(ausentismo.pad)}`} />
            <Indicador titulo="% ausentismo" valor={`${num(ausentismo.pct)} %`} detalle="Meta < 2,5 %" estado={ausentismo.pct < 2.5 ? "ok" : "alerta"} />
            <Indicador titulo="Referencias" valor={String(r.referencias?.total ?? 0)} detalle="a especialistas" />
          </div>

          {r.poblacion.total > 0 && r.poblacion.total < 10 && (
            <p className="rounded-md bg-aviso/10 px-4 py-2 text-sm">Población menor a 10 trabajadores: los índices tienen baja comparabilidad.</p>
          )}

          {acc && (() => {
            const ix = indicesCovenin(acc);
            const eo = tasasEnfermedadOcupacional(r, acc.hht);
            return (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Accidentalidad y enfermedad ocupacional (COVENIN 474)</CardTitle>
                  <CardDescription>Índices por millón de horas hombre trabajadas{acc.estimado_auto ? " · HHT estimadas (trabajadores × 8 h × días hábiles): carga las horas reales en la empresa" : ""}.</CardDescription>
                </CardHeader>
                <CardContent className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
                  {[
                    ["IFN", num(ix.ifn), "Con tiempo perdido"],
                    ["IFB", num(ix.ifb), "Lesiones totales"],
                    ["IS", num(ix.is), "Severidad"],
                    ["TIEO", num(eo.tieo ?? ix.tieo), "Incidencia EO"],
                    ["TAEO", num(eo.taeo), "Ausentismo EO"],
                    ["Accidentes", String(acc.accidentes), `${acc.con_tiempo_perdido} con tiempo perdido`],
                    ["Declaradas a tiempo", ix.aTiempo === null ? "—" : `${ix.aTiempo} %`, `${acc.por_declarar} por declarar`],
                    ["HHT", num(acc.hht), acc.hay_estimado ? "estimadas" : "según nómina"],
                  ].map(([t, n, d]) => (
                    <div key={t} className="rounded-lg border p-3">
                      <div className="text-xs text-muted-foreground">{t}</div>
                      <div className="text-xl font-semibold">{n}</div>
                      <div className="text-xs text-muted-foreground">{d}</div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            );
          })()}

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Grafico titulo="Consultas por motivo"><Barras filas={r.consultas.por_motivo} /></Grafico>
            <Grafico titulo="Morbilidad por aparatos y sistemas"><Barras filas={r.morbilidad.por_sistema} color="bg-chart-2" /></Grafico>
            <Grafico titulo="Diez primeras causas de morbilidad" detalle="Explora por tipo de consulta, origen, sexo, edad, actividad, sistema, motivo o dependencia.">
              <ExploradorCausas cortes={r.morbilidad.cortes ?? {}} poblacion={r.poblacion.total} />
            </Grafico>
            <Grafico titulo="Origen de los diagnósticos">
              <Barras filas={Object.entries(r.morbilidad.por_origen).map(([k, n]) => ({ nombre: ETIQUETA_ORIGEN[k as Origen] ?? k, n }))} color="bg-alerta" />
            </Grafico>
            <Grafico titulo="Ausentismo por causa (días)">
              <Barras filas={r.ausentismo.por_causa.map((c) => ({ nombre: causas[c.nombre] ?? c.nombre, n: c.dias, detalle: `${c.n} rep.` }))} sufijo="d" color="bg-alerta" />
            </Grafico>
            <Grafico titulo="Reposos por ente emisor (días)">
              <Barras filas={r.ausentismo.por_ente.map((c) => ({ nombre: entes[c.nombre] ?? c.nombre, n: c.dias ?? c.n, detalle: `${c.n} rep.` }))} sufijo="d" />
            </Grafico>
            <Grafico titulo="Uso del servicio por dependencia" detalle="Consultas y personal efectivo de cada dependencia.">
              <Barras filas={(r.consultas.por_dependencia ?? []).map((d) => ({ nombre: d.nombre, n: d.n, detalle: `de ${d.personal}` }))} color="bg-chart-3" />
            </Grafico>
            <Grafico titulo="Referencias a especialidades">
              <Barras filas={r.referencias?.por_especialidad ?? []} color="bg-chart-4" />
            </Grafico>
            <Grafico titulo="Consultas por grupo etario"><Barras filas={r.consultas.por_edad.map((e) => ({ nombre: e.grupo, n: e.n }))} color="bg-chart-3" /></Grafico>
            <Grafico titulo="Aptitud emitida">
              <Barras filas={Object.entries(r.aptitud).map(([k, n]) => ({ nombre: aptitudes[k] ?? k, n }))} color="bg-ok" />
            </Grafico>
          </div>

          {v.sugeridos && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Redacción del informe</CardTitle>
                <CardDescription>Resumen, conclusiones médico-ocupacionales y recomendaciones de seguridad para {periodo.etiqueta}.</CardDescription>
              </CardHeader>
              <CardContent>
                <EditorInforme
                  key={`${periodo.desde}${periodo.hasta}${empresaId}`}
                  empresaId={empresaId}
                  desde={periodo.desde}
                  hasta={periodo.hasta}
                  inicial={v.informe}
                  sugeridos={v.sugeridos}
                  firmantesBase={v.firmantesBase}
                  editable={Boolean(sesion.rol && ROLES_REDACTAN.includes(sesion.rol))}
                  enlaceImprimir={enlaceImprimir}
                />
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
