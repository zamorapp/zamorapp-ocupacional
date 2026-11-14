import { Semaforo } from "@/components/app/semaforo";
import { nivelCumplimiento } from "@/lib/cumplimiento";
import { cn } from "@/lib/utils";

const TRAZO = { ok: "stroke-ok", aviso: "stroke-aviso", alerta: "stroke-alerta" } as const;
const TEXTO = { ok: "text-ok-texto", aviso: "text-aviso-texto", alerta: "text-alerta-texto" } as const;

// Anillo 0-100 con la cifra adentro y la palabra debajo (nunca solo color)
export function AnilloCumplimiento({ puntaje, tamano = "lg", className }: { puntaje: number | null; tamano?: "sm" | "lg"; className?: string }) {
  const n = puntaje === null ? null : nivelCumplimiento(puntaje);
  const r = 42, c = 2 * Math.PI * r;
  const lado = tamano === "lg" ? "size-32" : "size-14";
  return (
    <div className={cn("flex items-center gap-3", tamano === "lg" && "flex-col gap-2", className)}>
      <div className={cn("relative shrink-0", lado)} role="img" aria-label={n ? `Cumplimiento ${puntaje} de 100: ${n.palabra}` : "Cumplimiento sin datos"}>
        <svg viewBox="0 0 100 100" className="size-full -rotate-90">
          <circle cx="50" cy="50" r={r} className="fill-none stroke-muted" strokeWidth="9" />
          {n && <circle cx="50" cy="50" r={r} className={cn("fill-none", TRAZO[n.estado])} strokeWidth="9" strokeLinecap="round" strokeDasharray={`${(c * Math.max(puntaje!, 1)) / 100} ${c}`} />}
        </svg>
        <span className={cn("absolute inset-0 grid place-items-center font-bold tabular-nums", tamano === "lg" ? "text-4xl" : "text-base", n ? TEXTO[n.estado] : "text-muted-foreground")}>
          {puntaje ?? "—"}
        </span>
      </div>
      {n ? (
        <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap font-semibold", tamano === "lg" ? "text-base" : "text-sm", TEXTO[n.estado])}>
          <Semaforo estado={n.estado} /> {n.palabra}
        </span>
      ) : (
        <span className="text-sm text-muted-foreground">Sin datos aún</span>
      )}
    </div>
  );
}
