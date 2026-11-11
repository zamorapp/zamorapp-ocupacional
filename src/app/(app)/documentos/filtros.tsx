"use client";

import { useRouter } from "next/navigation";
import { CalendarDays } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

// Documentos (Cesar, 11-nov): cualquier rango de fechas (antes solo 90 días y las de julio no salían) y una sola
// «Fecha de impresión» que usan todos los botones de lote, para no cambiarla en cada hoja.
// text-foreground explícito: el texto del campo de fecha de Chromium quedaba gris en tema oscuro.
const FECHA = "h-10 text-foreground tabular-nums";

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
    <div className="grid grid-cols-1 items-start gap-4 rounded-xl border bg-card p-4 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] md:gap-0">
      {/* Filtra la lista */}
      <fieldset className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:pr-4">
        <legend className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Consultas</legend>
        <div>
          <Label htmlFor="desde" className="mb-1.5 h-5">Desde</Label>
          <Input id="desde" type="date" className={FECHA} value={desde} max={hasta} onChange={(e) => e.target.value && ir({ desde: e.target.value })} />
        </div>
        <div>
          <Label htmlFor="hasta" className="mb-1.5 h-5">Hasta</Label>
          <Input id="hasta" type="date" className={FECHA} value={hasta} min={desde} onChange={(e) => e.target.value && ir({ hasta: e.target.value })} />
        </div>
      </fieldset>
      {/* Va impresa en el papel */}
      <fieldset className="border-t pt-4 md:border-t-0 md:border-l md:pt-0 md:pl-4">
        <legend className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">En la hoja</legend>
        <Label htmlFor="impreso" className="mb-1.5 h-5"><CalendarDays className="size-4" aria-hidden /> Fecha de impresión</Label>
        <Input
          id="impreso"
          type="date"
          className={cn(FECHA, otra && "border-aviso bg-aviso/10 dark:bg-aviso/15")}
          value={impreso}
          onChange={(e) => ir({ impreso: e.target.value || hoy })}
        />
        <div className="mt-1 flex min-h-6 items-center justify-between gap-2 text-xs">
          <span className={otra ? "text-aviso-texto" : "text-muted-foreground"}>{otra ? "Sale en todas las hojas de abajo." : "Por defecto, hoy."}</span>
          {otra && <Button type="button" variant="ghost" size="sm" className="h-auto px-2 py-1 text-xs text-primary max-sm:min-h-11" onClick={() => ir({ impreso: hoy })}>Hoy</Button>}
        </div>
      </fieldset>
    </div>
  );
}
