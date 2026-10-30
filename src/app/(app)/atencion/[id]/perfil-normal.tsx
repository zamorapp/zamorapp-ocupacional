"use client";

import { CheckCircle2, Copy, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { EvaluacionAnterior } from "@/lib/consultas";

const corta = (iso: string) => iso.split("-").reverse().join("/");

// La evaluación que se ofrece copiar: el post vacacional parte del pre vacacional; los demás, de la última evaluación
export function evaluacionParaCopiar(evaluaciones: EvaluacionAnterior[], motivo: string | null | undefined) {
  if (!evaluaciones.length) return null;
  if (motivo === "POSV") return evaluaciones.find((e) => e.motivo === "PREV") ?? evaluaciones[0];
  return evaluaciones[0];
}

export const evaluacionNormal = (e: EvaluacionAnterior) => e.clasificacion === "elegible" && e.diagnosticos === 0;

// Oferta (no aviso): «El pre vacacional del 12/08/2026 salió Elegible, sin diagnósticos. ¿Hacer este post vacacional igual?»
export function OfertaCopia({ ev, motivo, clasificacion, conPerfil, onCopiar, onDescartar }: {
  ev: EvaluacionAnterior;
  motivo: string; // nombre del motivo actual
  clasificacion: string; // nombre legible de la clasificación de la anterior
  conPerfil: boolean; // la anterior fue normal y el motivo actual tiene plantilla: aptitud y recomendaciones salen de ella
  onCopiar: () => void;
  onDescartar: () => void;
}) {
  const hallazgos = ev.diagnosticos > 0;
  return (
    <div role="region" aria-label="Copiar la evaluación anterior"
      className="mt-2 flex flex-wrap items-start gap-x-3 gap-y-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-sm">
      <Copy className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
      <div className="min-w-0 flex-1 basis-64">
        <p>
          El <b>{ev.motivoNombre.toLowerCase()}</b> del {corta(ev.fecha)} salió {clasificacion},{" "}
          {hallazgos
            ? <span className="text-aviso-texto">con {ev.diagnosticos} diagnóstico{ev.diagnosticos === 1 ? "" : "s"}</span>
            : "sin diagnósticos"}. ¿Hacer este {motivo.toLowerCase()} igual?
        </p>
        <p className="text-xs text-muted-foreground">
          Copia antecedentes y examen.{conPerfil && <> Aptitud y recomendaciones: perfil de {motivo}.</>} Signos vitales y fecha: hoy.
        </p>
      </div>
      <div className="flex gap-2">
        <Button type="button" size="sm" onClick={onCopiar}><Copy /> Copiar igual</Button>
        <Button type="button" size="sm" variant="ghost" onClick={onDescartar}>Ahora no</Button>
      </div>
    </div>
  );
}

// Lo que dejó «Copiar igual» o «Perfil normal», con Deshacer
export function FranjaAplicada({ tipo, texto, onDeshacer, onListo }: {
  tipo: "copia" | "perfil";
  texto: string;
  onDeshacer: () => void;
  onListo?: () => void;
}) {
  const Icono = tipo === "copia" ? Copy : CheckCircle2;
  return (
    <div role="status" className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-sm">
      <Icono className="size-4 shrink-0 text-primary" aria-hidden />
      <span className="min-w-0 flex-1 basis-56">{texto}</span>
      <Button type="button" size="sm" variant="ghost" className="h-7" onClick={onDeshacer}><RotateCcw /> Deshacer</Button>
      {onListo && <Button type="button" size="sm" variant="ghost" className="h-7 text-muted-foreground" onClick={onListo}>Listo</Button>}
    </div>
  );
}

export function BotonPerfilNormal({ motivo, onClick }: { motivo: string; onClick: () => void }) {
  return (
    <Button type="button" size="sm" variant="outline" className="border-ok/50 text-ok-texto hover:bg-ok/10 hover:text-ok-texto" onClick={onClick}
      title={`Examen sin alteraciones, aptitud y recomendaciones de ${motivo}. Solo llena lo vacío; no firma.`}>
      <CheckCircle2 /> Perfil normal
    </Button>
  );
}
