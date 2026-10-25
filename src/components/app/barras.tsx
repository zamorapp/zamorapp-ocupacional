import { cn } from "@/lib/utils";

// Lista de barras horizontales para conteos (motivos, sistemas, causas…)
export function Barras({ filas, vacio = "Sin datos en el periodo.", color = "bg-primary", sufijo }: {
  filas: { nombre: string; n: number; detalle?: string }[];
  vacio?: string;
  color?: string;
  sufijo?: string;
}) {
  const max = Math.max(1, ...filas.map((f) => f.n));
  const total = filas.reduce((s, f) => s + f.n, 0);
  if (!filas.length) return <p className="py-4 text-center text-sm text-muted-foreground">{vacio}</p>;
  return (
    <ul className="space-y-2">
      {filas.map((f) => (
        <li key={f.nombre} className="grid grid-cols-[minmax(0,10rem)_minmax(0,1fr)_auto] items-center gap-3 text-sm">
          <span className="truncate" title={f.nombre}>{f.nombre}</span>
          <span className="h-2.5 overflow-hidden rounded-full bg-muted">
            <span className={cn("block h-full rounded-full", color)} style={{ width: `${(f.n / max) * 100}%` }} />
          </span>
          <span className="w-20 text-right tabular-nums">
            <b>{f.n}</b>{sufijo && ` ${sufijo}`} <span className="text-xs text-muted-foreground">{f.detalle ?? (total ? `${Math.round((f.n / total) * 100)} %` : "")}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}
