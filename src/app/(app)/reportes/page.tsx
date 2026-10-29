import type { Metadata } from "next";
import Link from "next/link";
import { FileBarChart2, ShieldAlert } from "lucide-react";
import { Semaforo } from "@/components/app/semaforo";
import { BarrasH, Columnas, Dona, EjeMeses, Meta, nombreMes, Pareto, Piramide } from "@/components/graficos";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ETIQUETA_ORIGEN, type Origen } from "@/lib/consultas-tipos";
import { empresaActivaId } from "@/lib/empresa-activa";
import { parametrosPeriodo, type ConsultaPeriodo } from "@/lib/periodos";
import { indicesCovenin, tasasEnfermedadOcupacional, textoMetodoHoras } from "@/lib/reportes";
import { obtenerSesion } from "@/lib/sesion";
import { totales } from "@/lib/vigilancia-analisis";
import { cargarVigilancia } from "@/lib/vigilancia";
import { EditorInforme } from "./editor-informe";
import { ExploradorCausas } from "./explorador-causas";
import { SelectorPeriodo } from "./selector-periodo";

export const metadata: Metadata = { title: "Reportes" };
export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<ConsultaPeriodo> };

const ROLES_REDACTAN = ["administrador", "gerente_medico", "medico", "enfermeria", "coordinador_sst"];

// Variación contra el período anterior, en tinta neutra (subir no siempre es malo: más consultas preventivas es bueno)
function Variacion({ actual, base, contra }: { actual: number; base: number | undefined; contra: string }) {
  if (base === undefined) return null;
  if (!base) return <span className="text-xs text-muted-foreground">sin datos en {contra}</span>;
  const v = Math.round(((actual - base) * 1000) / base) / 10;
  return <span className="text-xs text-muted-foreground" title={`${contra}: ${base.toLocaleString("es-VE")}`}>{v > 0 ? "▲" : v < 0 ? "▼" : "="} {Math.abs(v).toLocaleString("es-VE")} % vs {contra}</span>;
}

function Indicador({ titulo, valor, detalle, estado, children }: { titulo: string; valor: string; detalle: string; estado?: "ok" | "aviso" | "alerta"; children?: React.ReactNode }) {
  return (
    <Card className="gap-1 py-4">
      <CardContent className="space-y-1 px-5">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">{estado && <Semaforo estado={estado} />}{titulo}</div>
        <div className="font-cifra text-2xl font-semibold tracking-tight">{valor}</div>
        <div className="text-xs text-muted-foreground">{detalle}</div>
        {children}
      </CardContent>
    </Card>
  );
}

// Tarjeta de gráfico con su lectura inmediata debajo (la misma que sale en el informe impreso)
function Grafico({ titulo, children, detalle, analisis, className }: { titulo: string; children: React.ReactNode; detalle?: string; analisis?: string; className?: string }) {
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="text-base">{titulo}</CardTitle>
        {detalle && <CardDescription>{detalle}</CardDescription>}
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        {children}
        {analisis && <p className="border-l-2 border-primary/50 pl-3 text-[13px] leading-relaxed text-muted-foreground">{analisis}</p>}
      </CardContent>
    </Card>
  );
}

const num = (n: number | null | undefined) => (n === null || n === undefined ? "—" : n.toLocaleString("es-VE"));

export default async function Reportes({ searchParams }: Props) {
  const [q, sesion, empresaId] = await Promise.all([searchParams, obtenerSesion(), empresaActivaId()]);
  const v = await cargarVigilancia(sesion, empresaId, q);
  const { r, s, acc, periodo, empresa, causas, entes, aptitudes, ausentismo } = v;
  const a = v.analisis?.secciones;
  const actual = s ? totales(s) : null;
  const previo = v.sAnt ? totales(v.sAnt) : null;
  const contra = "período anterior";
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
            <Indicador titulo="Población" valor={num(r.poblacion.total)} detalle={`${r.poblacion.femenino} F · ${r.poblacion.masculino} M`} />
            <Indicador titulo="Consultas" valor={num(r.consultas.total)} detalle={`${r.consultas.pacientes} pacientes · ${r.consultas.preventivas} preventivas`}>
              {actual && <Variacion actual={actual.consultas} base={previo?.consultas} contra={contra} />}
            </Indicador>
            <Indicador titulo="Prevalencia" valor={`${num(r.poblacion.total ? Math.round(((r.morbilidad.pacientes ?? 0) * 1000) / r.poblacion.total) / 10 : 0)} %`} detalle={`${r.morbilidad.total} diagnósticos`}>
              {actual && <Variacion actual={actual.diagnosticos} base={previo?.diagnosticos} contra={contra} />}
            </Indicador>
            <Indicador titulo="Días perdidos" valor={num(r.ausentismo.dias_perdidos)} detalle={`${r.ausentismo.reposos} reposos · PAD ${num(ausentismo.pad)}`}>
              {actual && <Variacion actual={actual.dias} base={previo?.dias} contra={contra} />}
            </Indicador>
            <Indicador titulo="% ausentismo" valor={`${num(ausentismo.pct)} %`} detalle="Meta < 2,5 %" estado={ausentismo.pct < 2.5 ? "ok" : "alerta"} />
            <Indicador titulo="Referencias" valor={num(r.referencias?.total ?? 0)} detalle="a especialistas" />
          </div>

          {v.analisis && (
            <Card className="border-primary/30 bg-primary/[0.04]">
              <CardHeader>
                <CardTitle className="text-base">Hallazgos clave · {periodo.etiqueta}</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-1 gap-4 text-sm lg:grid-cols-[1fr_1.4fr]">
                <ul className="space-y-1.5">
                  {v.analisis.hallazgos.map((h) => <li key={h} className="flex gap-2"><span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary" />{h}</li>)}
                </ul>
                <p className="leading-relaxed text-muted-foreground">{v.analisis.conclusion}</p>
              </CardContent>
            </Card>
          )}

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
                  <CardDescription>Índices por millón de horas hombre · {textoMetodoHoras(acc.metodo)}{acc.estimado_auto ? " Carga las horas reales en la empresa." : ""} El método se cambia en Configuración › Organización.</CardDescription>
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
                    [acc.metodo === "same" ? "HHE" : "HHT", num(acc.hht), acc.metodo === "same" ? "fórmula del SAME" : acc.metodo === "covenin" ? "estimadas" : "según nómina"],
                  ].map(([t, n, d]) => (
                    <div key={t} className="rounded-lg border p-3">
                      <div className="text-xs text-muted-foreground">{t}</div>
                      <div className="text-xl font-semibold">{n}</div>
                      <div className="text-xs text-muted-foreground">{d}</div>
                    </div>
                  ))}
                </CardContent>
                {a?.accidentes && <CardContent><p className="border-l-2 border-primary/50 pl-3 text-[13px] leading-relaxed text-muted-foreground">{a.accidentes}</p></CardContent>}
              </Card>
            );
          })()}

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {s && (
              <Grafico titulo="Tendencia del período" detalle="Consultas y días de reposo de cada mes." analisis={a?.uso}>
                <div className="grid grid-cols-2 gap-6">
                  <div><div className="mb-2 text-xs text-muted-foreground">Consultas</div><Columnas puntos={s.por_mes.map((m) => ({ etiqueta: nombreMes(m.mes), n: m.consultas }))} /><EjeMeses etiquetas={s.por_mes.map((m) => nombreMes(m.mes))} /></div>
                  <div><div className="mb-2 text-xs text-muted-foreground">Días de reposo</div><Columnas serie={2} puntos={s.por_mes.map((m) => ({ etiqueta: nombreMes(m.mes), n: m.dias_reposo }))} sufijo="días" /><EjeMeses etiquetas={s.por_mes.map((m) => nombreMes(m.mes))} /></div>
                </div>
              </Grafico>
            )}
            {s && <Grafico titulo="Pirámide de la población" detalle="Trabajadores efectivos por edad y sexo." analisis={a?.poblacion}><Piramide grupos={s.piramide} /></Grafico>}
            {s && <Grafico className="lg:col-span-2" titulo="Morbilidad por capítulo CIE-10 (Pareto)" detalle="Barras: % de diagnósticos de cada grupo · línea: % acumulado." analisis={a?.morbilidad}><Pareto filas={s.capitulos} /></Grafico>}
            <Grafico titulo="Tipo de atención y motivos de consulta">
              <Dona partes={[{ nombre: "Preventivas", n: r.consultas.preventivas }, { nombre: "Asistenciales", n: r.consultas.no_preventivas }]} centro={num(r.consultas.total)} sub="consultas" />
              <BarrasH filas={r.consultas.por_motivo} />
            </Grafico>
            <Grafico titulo="Diez primeras causas de morbilidad" detalle="Explora por tipo de consulta, origen, sexo, edad, actividad, sistema, motivo o dependencia.">
              <ExploradorCausas cortes={r.morbilidad.cortes ?? {}} poblacion={r.poblacion.total} />
            </Grafico>
            <Grafico titulo="Ausentismo" detalle="Porcentaje de ausentismo frente a la meta y días perdidos por causa." analisis={a?.ausentismo}>
              <Meta valor={ausentismo.pct} meta={2.5} />
              <BarrasH filas={r.ausentismo.por_causa.map((c) => ({ nombre: causas[c.nombre] ?? c.nombre, n: c.dias }))} sufijo="d" serie={2} />
            </Grafico>
            <Grafico titulo="Origen de los diagnósticos">
              <Dona partes={Object.entries(r.morbilidad.por_origen).map(([k, n]) => ({ nombre: ETIQUETA_ORIGEN[k as Origen] ?? k, n }))} centro={num(r.morbilidad.total)} sub="diagnósticos" />
            </Grafico>
            <Grafico titulo="Reposos por ente emisor (días)">
              <BarrasH filas={r.ausentismo.por_ente.map((c) => ({ nombre: entes[c.nombre] ?? c.nombre, n: c.dias ?? c.n }))} sufijo="d" />
            </Grafico>
            <Grafico titulo="Uso del servicio por dependencia" detalle="Consultas y personal efectivo de cada dependencia.">
              <BarrasH filas={(r.consultas.por_dependencia ?? []).map((d) => ({ nombre: d.nombre, n: d.n, detalle: `de ${d.personal}` }))} />
            </Grafico>
            <Grafico titulo="Referencias a especialidades" analisis={a?.referencias}>
              <BarrasH filas={r.referencias?.por_especialidad ?? []} />
            </Grafico>
            <Grafico titulo="Aptitud emitida" analisis={a?.aptitud}>
              <Dona partes={Object.entries(r.aptitud).map(([k, n]) => ({ nombre: aptitudes[k] ?? k, n }))} centro={num(Object.values(r.aptitud).reduce((x, y) => x + y, 0))} sub="evaluaciones" />
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
                  datos={v.datosAnalisis}
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
