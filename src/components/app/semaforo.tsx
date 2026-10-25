import type { Estado } from "@/lib/demo";
import { cn } from "@/lib/utils";

const COLOR: Record<Estado, string> = {
  ok: "bg-ok",
  aviso: "bg-aviso",
  alerta: "bg-alerta",
};

// Verde cumple, amarillo por vencer, rojo vencido o riesgo alto.
export function Semaforo({ estado, className }: { estado: Estado; className?: string }) {
  return <span className={cn("inline-block size-2.5 shrink-0 rounded-full", COLOR[estado], className)} />;
}
