"use client";

import { AlertTriangle, ArrowRight, CheckCircle2, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { type Faltante, irACampo } from "@/lib/ir-a-campo";
import type { DatosConsulta, FilaExamen } from "@/lib/consultas-tipos";

// Evaluación preventiva en una sola pantalla (pre-empleo, periódico, egreso, reintegro…): lo que cambia en cada
// trabajador (signos, hallazgos, paraclínicos, aptitud) a la vista, y lo que la plantilla ya dejó listo
// (examen normal, recomendaciones) resumido con un enlace a su paso. Usa los mismos bloques y el mismo estado
// que los pasos: no hay datos aparte ni nada que sincronizar.

const alterada = (f: FilaExamen) => f.valor.trim() !== f.normal.trim();

function Hallazgos({ titulo, filas, onEditar, onNormal }: { titulo: string; filas: FilaExamen[]; onEditar: () => void; onNormal?: () => void }) {
  const llenas = filas.filter((f) => f.valor.trim());
  const alteradas = filas.filter(alterada);
  return (
    <div className="min-w-0 rounded-lg border p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium">{titulo}</span>
        <Button type="button" size="sm" variant="ghost" className="h-7 px-2" onClick={onEditar}>Editar <ArrowRight /></Button>
      </div>
      {llenas.length === 0 ? (
        onNormal ? (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-aviso-texto">Sin llenar.</p>
            <Button type="button" size="sm" variant="outline" className="h-7 border-ok/50 px-2 text-ok-texto hover:bg-ok/10 hover:text-ok-texto" onClick={onNormal}>
              <CheckCircle2 /> Marcar normal
            </Button>
          </div>
        ) : <p className="text-sm text-aviso-texto">Sin llenar: ábrelo para marcar lo normal.</p>
      ) : alteradas.length === 0 ? (
        <p className="flex items-center gap-1.5 text-sm text-ok-texto"><CheckCircle2 className="size-4" /> Normal ({llenas.length} {llenas.length === 1 ? "fila" : "filas"})</p>
      ) : (
        <ul className="space-y-0.5 text-sm">
          {alteradas.map((f) => <li key={f.clave} className="truncate" title={`${f.nombre}: ${f.valor}`}><b className="text-alerta-texto">{f.nombre}:</b> {f.valor || "—"}</li>)}
        </ul>
      )}
    </div>
  );
}

const lineas = (t: string) => t.split("\n").filter((l) => l.trim()).length;

export function VistaRapida({ d, signos, paraclinicos, sano, aptitud, acciones, onIr, onNormal, perfilNormal }: {
  d: DatosConsulta;
  signos: React.ReactNode;
  paraclinicos: React.ReactNode;
  sano: React.ReactNode;
  aptitud: React.ReactNode;
  acciones: React.ReactNode; // Guardar / Cerrar, firmar e imprimir
  onIr: (paso: string) => void;
  // Llena el examen con lo normal sin salir de la pantalla (un clic en vez de abrir el paso Examen)
  onNormal?: { funcional?: () => void; fisico?: () => void };
  perfilNormal?: React.ReactNode; // «Perfil normal» del motivo: examen, aptitud y recomendaciones en un clic
}) {
  // Lo mínimo para cerrar una evaluación preventiva; solo orienta, nunca impide cerrar
  // Cada dato lleva a su casilla, que está marcada en ámbar en esta misma pantalla
  const faltan = [
    !d.signos.ta?.trim() && { campo: "signo-ta", etiqueta: "tensión arterial" },
    !d.signos.peso?.trim() && { campo: "signo-peso", etiqueta: "peso" },
    !d.sano && !d.diagnosticos.some((x) => x.descripcion.trim()) && { campo: "sano", etiqueta: "diagnóstico o «sano»" },
    !d.aptitud.clasificacion && { campo: "aptitud", etiqueta: "aptitud" },
  ].filter(Boolean) as Faltante[];
  const recomendaciones = lineas(d.recomendacionesEmpresa) + lineas(d.recomendacionesTrabajador);

  return (
    <div className="space-y-4">
      <p className="flex scroll-mt-24 items-start gap-2 rounded-lg bg-primary/5 px-3 py-2 text-sm text-muted-foreground">
        <Zap className="mt-0.5 size-4 shrink-0 text-primary" />
        <span>Evaluación rápida: todo lo esencial en una pantalla. Los pasos de arriba siguen disponibles para el detalle.</span>
      </p>
      {signos}
      <section className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">Examen</h3>
          {perfilNormal}
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Hallazgos titulo="Funcional" filas={d.examenFuncional} onEditar={() => onIr("examen")} onNormal={onNormal?.funcional} />
          <Hallazgos titulo="Físico" filas={d.examenFisico} onEditar={() => onIr("examen")} onNormal={onNormal?.fisico} />
        </div>
      </section>
      {d.paraclinicos.length > 0 ? paraclinicos : (
        <button type="button" onClick={() => onIr("paraclinicos")} className="flex w-full items-center justify-between gap-2 rounded-lg border border-dashed px-4 py-3 text-left text-sm text-muted-foreground hover:border-primary/50">
          Sin paraclínicos. Agregar exámenes o un perfil <ArrowRight className="size-4" />
        </button>
      )}
      {d.sano ? sano : (
        <div className="space-y-2">
          {sano}
          {d.diagnosticos.some((x) => x.descripcion.trim()) && (
            <button type="button" onClick={() => onIr("diagnostico")} className="text-sm text-primary hover:underline">
              {d.diagnosticos.filter((x) => x.descripcion.trim()).length} diagnóstico(s) · ver o editar
            </button>
          )}
        </div>
      )}
      {aptitud}
      <button type="button" onClick={() => onIr("conclusiones")} className="flex w-full items-center justify-between gap-2 rounded-lg border px-4 py-3 text-left text-sm hover:border-primary/50">
        <span>{recomendaciones ? `${recomendaciones} recomendaciones a la empresa y al trabajador` : "Sin recomendaciones a la empresa ni al trabajador"}{d.conclusiones.trim() ? " · con conclusiones" : ""}</span>
        <span className="inline-flex shrink-0 items-center gap-1 text-primary">Revisar <ArrowRight className="size-4" /></span>
      </button>
      <div className={cn("flex flex-wrap items-center gap-3 rounded-xl border p-4", faltan.length ? "border-aviso/50 bg-aviso/5" : "border-ok/50 bg-ok/5")}>
        <span className="flex min-w-0 flex-1 basis-56 items-center gap-2 text-sm">
          {faltan.length
            ? <span className="flex flex-wrap items-center gap-1.5">
                <AlertTriangle className="size-4 shrink-0 text-aviso-texto" /> Falta:
                {faltan.map((f) => (
                  <button key={f.campo} type="button" title="Ir a la casilla" onClick={() => irACampo(f.campo)}
                    className="inline-flex items-center gap-1 rounded-md border border-aviso/60 bg-aviso/15 px-2 py-0.5 font-medium text-aviso-texto hover:bg-aviso/25 hover:underline">
                    {f.etiqueta} <ArrowRight className="size-3.5" aria-hidden />
                  </button>
                ))}
                <span className="text-muted-foreground">Puedes cerrar igual.</span>
              </span>
            : <><CheckCircle2 className="size-4 shrink-0 text-ok-texto" /> Lista para cerrar.</>}
        </span>
        <div className="flex flex-wrap gap-2">{acciones}</div>
      </div>
    </div>
  );
}
