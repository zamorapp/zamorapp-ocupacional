"use client";

import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatoCelda, type Columna } from "@/lib/reportes-catalogo";
import { cn } from "@/lib/utils";

type Fila = Record<string, string | number | null>;
const POR_PAGINA = 100;

// Tabla del reporte: ordena al tocar el encabezado y muestra de 100 en 100
export function TablaReporte({ columnas, filas, totales }: { columnas: Columna[]; filas: Fila[]; totales: Record<string, number> }) {
  const [orden, setOrden] = useState<{ k: string; asc: boolean } | null>(null);
  const [visibles, setVisibles] = useState(POR_PAGINA);

  const ordenadas = useMemo(() => {
    if (!orden) return filas;
    const col = columnas.find((c) => c.k === orden.k);
    const num = col?.tipo === "num";
    return [...filas].sort((a, b) => {
      const x = a[orden.k], y = b[orden.k];
      if (x === null || x === "") return 1;
      if (y === null || y === "") return -1;
      const r = num ? Number(x) - Number(y) : String(x).localeCompare(String(y), "es");
      return orden.asc ? r : -r;
    });
  }, [filas, orden, columnas]);

  if (!filas.length) return <p className="rounded-xl border border-dashed py-12 text-center text-sm text-muted-foreground">Sin registros en el período con estos filtros.</p>;
  const hayTotales = Object.keys(totales).length > 0;

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto rounded-xl border bg-card">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-muted/60 text-left text-xs text-muted-foreground">
            <tr>
              {columnas.map((c) => {
                const activa = orden?.k === c.k;
                const Icono = activa ? (orden.asc ? ArrowUp : ArrowDown) : ChevronsUpDown;
                return (
                  <th key={c.k} className={cn("px-3 py-2 font-medium whitespace-nowrap", c.tipo === "num" && "text-right")}>
                    <button type="button" onClick={() => setOrden({ k: c.k, asc: activa ? !orden.asc : c.tipo !== "num" })} className="inline-flex items-center gap-1 hover:text-foreground">
                      {c.t} <Icono className={cn("size-3", !activa && "opacity-40")} />
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {ordenadas.slice(0, visibles).map((f, i) => (
              <tr key={String(f.id ?? "") + i} className="border-t hover:bg-muted/30">
                {columnas.map((c) => (
                  <td key={c.k} className={cn("px-3 py-1.5 align-top", c.tipo === "num" ? "text-right tabular-nums" : "min-w-24", c.tipo === "fecha" && "whitespace-nowrap", c.k === "paciente" && "font-medium", (c.ancho ?? 0) >= 30 && "min-w-56")}>
                    {formatoCelda(c, f[c.k])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          {hayTotales && (
            <tfoot className="border-t-2 bg-muted/40 font-semibold">
              <tr>
                {columnas.map((c, i) => (
                  <td key={c.k} className={cn("px-3 py-2", c.tipo === "num" && "text-right tabular-nums")}>
                    {c.k in totales ? totales[c.k].toLocaleString("es-VE") : i === 0 ? "Totales" : ""}
                  </td>
                ))}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>Mostrando {Math.min(visibles, filas.length).toLocaleString("es-VE")} de {filas.length.toLocaleString("es-VE")} registros · la impresión y el Excel llevan todos</span>
        {visibles < filas.length && (
          <Button type="button" size="sm" variant="outline" onClick={() => setVisibles((v) => v + POR_PAGINA * 5)}>Ver más</Button>
        )}
      </div>
    </div>
  );
}
