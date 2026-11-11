"use client";

import { useRouter } from "next/navigation";
import { CalendarDays } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Campo } from "@/components/app/campo";
import { cn } from "@/lib/utils";

// Documentos (Cesar, 11-nov): cualquier rango de fechas (antes solo 90 días y las de julio no salían) y una sola
// «Fecha de impresión» que usan todos los botones de lote, para no cambiarla en cada hoja.
export function FiltrosDocumentos({ desde, hasta, impreso, hoy, porDefecto }: { desde: string; hasta: string; impreso: string; hoy: string; porDefecto: string }) {
  const router = useRouter();
  const ir = (cambios: { desde?: string; hasta?: string; impreso?: string }) => {
    const v = { desde, hasta, impreso, ...cambios };
    const p = new URLSearchParams();
    if (v.desde && v.desde !== porDefecto) p.set("desde", v.desde);
    if (v.hasta && v.hasta !== hoy) p.set("hasta", v.hasta);
    if (v.impreso && v.impreso !== hoy) p.set("impreso", v.impreso);
    router.replace(`/documentos${p.size ? `?${p}` : ""}`);
  };
  const otra = impreso !== hoy;
  return (
    <div className="grid grid-cols-1 gap-3 rounded-xl border bg-card p-4 sm:grid-cols-3">
      <Campo id="desde" etiqueta="Consultas desde" type="date" value={desde} max={hasta} onChange={(e) => e.target.value && ir({ desde: e.target.value })} />
      <Campo id="hasta" etiqueta="Hasta" type="date" value={hasta} min={desde} onChange={(e) => e.target.value && ir({ hasta: e.target.value })} />
      <div className={cn("space-y-1.5 rounded-lg", otra && "-m-2 border border-aviso bg-aviso/10 p-2")}>
        <Campo
          id="impreso"
          etiqueta={<span className="inline-flex items-center gap-1.5"><CalendarDays className="size-4" aria-hidden /> Fecha de impresión</span>}
          type="date"
          value={impreso}
          onChange={(e) => ir({ impreso: e.target.value || hoy })}
        />
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          {otra ? "Sale en todas las hojas de los botones de abajo." : "Por defecto, hoy. Se usa en todos los lotes."}
          {otra && <Button type="button" variant="link" size="sm" className="h-auto p-0 text-xs" onClick={() => ir({ impreso: hoy })}>Hoy</Button>}
        </p>
      </div>
    </div>
  );
}
