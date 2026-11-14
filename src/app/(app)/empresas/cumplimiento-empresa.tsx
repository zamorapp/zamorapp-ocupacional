import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { AnilloCumplimiento } from "@/components/app/anillo-cumplimiento";
import { periodoInspeccion, resumenInspeccion } from "@/lib/inspeccion";

// Semáforo INPSASEL en la tarjeta de la empresa: mismos criterios que «Cumplimiento INPSASEL» (últimos 12 meses).
// Solo conteos: nada clínico. Si la base falla, la tarjeta sigue sin el semáforo.
export async function CumplimientoEmpresa({ empresaId, demo }: { empresaId: string; demo?: number }) {
  let puntaje: number | null = demo ?? null;
  if (demo === undefined) {
    const { desde, hasta } = periodoInspeccion();
    try { puntaje = (await resumenInspeccion(empresaId, desde, hasta))?.puntaje ?? null; } catch { return null; }
  }
  return <Fila empresaId={empresaId} puntaje={puntaje} />;
}

function Fila({ empresaId, puntaje }: { empresaId: string; puntaje: number | null }) {
  return (
    <Link href={`/inspeccion?empresa=${empresaId}`} className="flex min-h-11 items-center justify-between gap-3 rounded-lg border bg-muted/30 px-3 py-2 hover:border-primary/50 hover:bg-muted/60">
      <div className="min-w-0">
        <div className="text-xs text-muted-foreground">Cumplimiento INPSASEL</div>
        <AnilloCumplimiento puntaje={puntaje} tamano="sm" className="mt-1" />
      </div>
      <span className="inline-flex shrink-0 items-center gap-1 text-sm text-muted-foreground">Qué falta <ArrowRight className="size-4" /></span>
    </Link>
  );
}

export function EsqueletoCumplimiento() {
  return <div className="h-[4.5rem] animate-pulse rounded-lg border bg-muted/40" role="status" aria-label="Calculando cumplimiento" />;
}
