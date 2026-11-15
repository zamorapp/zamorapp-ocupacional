"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ClaveDecisionEnfermeria as Clave } from "@/lib/enfermeria-tipos";
import { guardarDecision } from "./acciones";

const OPCIONES: { k: Clave; titulo: string; si: string; no: string }[] = [
  {
    k: "enfermeria_unida",
    titulo: "Unir la morbilidad de enfermería con la mía",
    si: "En Reportes aparecen «Morbilidad unida» (médico y enfermería, con los días de cada uno) y «Días de atención».",
    no: "Cada una va por separado: «Morbilidad» es solo la tuya y «Morbilidad de enfermería», la de ella.",
  },
  {
    k: "enfermeria_vigilancia",
    titulo: "Indicadores de enfermería en la vigilancia",
    si: "El informe de vigilancia (pantalla e impreso) suma una sección de enfermería: atenciones, días, motivos y referidos.",
    no: "El informe de vigilancia queda solo con tus consultas.",
  },
  {
    k: "enfermeria_tasas",
    titulo: "Tasas en la morbilidad de enfermería",
    si: "«Morbilidad de enfermería» suma población, tasa por cada 100 trabajadores, prevalencia e incidencia. Usa la nómina de cada empresa: tenla al día.",
    no: "Apagadas mientras depuras la nómina: sin ella las tasas saldrían falsas. El reporte sigue con casos, pacientes y % de atendidos.",
  },
];

// Las decisiones del médico, a la vista y de un clic. Las cambian el administrador y el gerente médico.
export function Decisiones({ valores, editable }: { valores: Record<Clave, boolean>; editable: boolean }) {
  const [actual, setActual] = useState(valores);
  const [guardando, setGuardando] = useState<Clave | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, iniciar] = useTransition();

  const cambiar = (k: Clave) => {
    const nuevo = !actual[k];
    setGuardando(k); setError(null);
    iniciar(async () => {
      const r = await guardarDecision(k, nuevo);
      if (r.ok) setActual((a) => ({ ...a, [k]: nuevo })); else setError(r.mensaje);
      setGuardando(null);
    });
  };

  return (
    <div className="space-y-2">
      {OPCIONES.map((o) => (
        <div key={o.k} className="flex items-start gap-3 rounded-lg border bg-background p-3">
          <button type="button" role="switch" aria-checked={actual[o.k]} aria-label={o.titulo} disabled={!editable || guardando !== null}
            onClick={() => cambiar(o.k)}
            className={cn("relative mt-0.5 inline-flex h-6 w-11 shrink-0 items-center rounded-full border-2 border-transparent transition disabled:opacity-60",
              actual[o.k] ? "bg-primary" : "bg-muted-foreground/30")}>
            <span className={cn("inline-block size-5 rounded-full bg-background shadow transition", actual[o.k] ? "translate-x-5" : "translate-x-0")} />
          </button>
          <div className="min-w-0 text-sm">
            <p className="font-medium">{o.titulo} {guardando === o.k && <Loader2 className="inline size-3.5 animate-spin" />}</p>
            <p className="text-muted-foreground">{actual[o.k] ? o.si : o.no}</p>
          </div>
        </div>
      ))}
      {error && <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
      {!editable && <p className="text-xs text-muted-foreground">Solo el administrador o el gerente médico cambian estas decisiones.</p>}
    </div>
  );
}
