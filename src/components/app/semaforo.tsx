import type { Estado } from "@/lib/demo";
import { cn } from "@/lib/utils";

// Verde cumple, amarillo por vencer, rojo vencido o riesgo alto.
// Cada estado tiene además su FORMA (círculo, rombo, cuadro) y su nombre para lectores de pantalla:
// se distingue sin color (daltonismo, impresión en gris).
const FORMA: Record<Estado, string> = {
  ok: "rounded-full bg-ok",
  aviso: "rotate-45 rounded-[2px] bg-aviso scale-90",
  alerta: "rounded-[1px] bg-alerta",
};
export const NOMBRE_ESTADO: Record<Estado, string> = { ok: "Bien", aviso: "Revisar", alerta: "Urgente" };

export function Semaforo({ estado, className }: { estado: Estado; className?: string }) {
  return <span role="img" aria-label={NOMBRE_ESTADO[estado]} className={cn("inline-block size-2.5 shrink-0", FORMA[estado], className)} />;
}
