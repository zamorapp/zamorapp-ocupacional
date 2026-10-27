"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { CalendarRange } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MESES, ROMANOS, fechaCorta, rangoMeses, trimestreDe, trimestresDelAnio, type Periodo } from "@/lib/periodos";
import { cn } from "@/lib/utils";

const CAMPO = "h-9 rounded-md border bg-card px-2 text-sm";
const corto = (m: string) => m.slice(0, 3);

// Elige el trimestre (I a IV) del año de gestión, otros 3 meses cualquiera, el mes, el año o un rango.
// Siempre muestra las fechas exactas que se van a calcular.
export function SelectorPeriodo({ periodo, inicioEmpresa, empresa }: { periodo: Periodo; inicioEmpresa: number; empresa: string | null }) {
  const router = useRouter();
  const ruta = usePathname();
  const hoy = new Date();
  const inicio = periodo.inicio ?? inicioEmpresa;
  const anioGestion = periodo.anio ?? trimestreDe(hoy.getFullYear(), hoy.getMonth(), inicio).anio;
  const [desde, setDesde] = useState(periodo.desde);
  const [hasta, setHasta] = useState(periodo.hasta);

  const ir = (p: Record<string, string>) => router.push(`${ruta}?${new URLSearchParams(p)}`);
  const irTrimestre = (anio: number, t: number, ini = inicio) => ir({ p: "t", anio: String(anio), t: String(t), inicio: String(ini) });
  const anios = Array.from({ length: 7 }, (_, i) => hoy.getFullYear() + 1 - i);

  return (
    <div className="space-y-3 rounded-xl border bg-card p-3 sm:p-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex items-center gap-2 text-sm">
          <CalendarRange className="size-4 text-primary" />
          <span className="font-medium">Período del informe</span>
        </div>
        <div className="rounded-md bg-primary/10 px-3 py-1 text-sm font-semibold text-primary">
          Del {fechaCorta(periodo.desde)} al {fechaCorta(periodo.hasta)}
        </div>
        <span className="text-sm text-muted-foreground first-letter:uppercase">{periodo.etiqueta}</span>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <label className="grid gap-1 text-xs text-muted-foreground">
          Año de gestión
          <select value={anioGestion} onChange={(e) => irTrimestre(Number(e.target.value), periodo.t ?? 1)} className={CAMPO}>
            {anios.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </label>
        <div className="grid gap-1 text-xs text-muted-foreground">
          Trimestre
          <div className="flex flex-wrap gap-1">
            {trimestresDelAnio(anioGestion, inicio).map((q) => (
              <button
                key={q.t}
                type="button"
                onClick={() => irTrimestre(anioGestion, q.t!)}
                title={q.etiqueta}
                className={cn(
                  "h-9 rounded-md border px-3 text-sm transition",
                  periodo.clave === "t" && periodo.t === q.t && periodo.anio === anioGestion && periodo.inicio === inicio
                    ? "border-primary bg-primary text-primary-foreground"
                    : "hover:bg-muted",
                )}
              >
                <b>{ROMANOS[q.t! - 1]}</b> <span className="text-xs opacity-90">{corto(MESES[Number(q.desde.slice(5, 7)) - 1])}–{corto(MESES[Number(q.hasta.slice(5, 7)) - 1])}</span>
              </button>
            ))}
          </div>
        </div>
        <label className="grid gap-1 text-xs text-muted-foreground">
          La gestión empieza en
          <select value={inicio} onChange={(e) => irTrimestre(anioGestion, periodo.t ?? 1, Number(e.target.value))} className={CAMPO}>
            {MESES.map((m, i) => <option key={m} value={i + 1}>{m}{i + 1 === inicioEmpresa ? (empresa ? " (empresa)" : " (calendario)") : ""}</option>)}
          </select>
        </label>
        <label className="grid gap-1 text-xs text-muted-foreground">
          Otros 3 meses desde
          <input type="month" defaultValue={periodo.clave === "ventana" ? periodo.desde.slice(0, 7) : ""} onChange={(e) => e.target.value && ir({ p: "ventana", mes: e.target.value })} className={CAMPO} />
        </label>
      </div>

      <div className="flex flex-wrap items-end gap-2 border-t pt-3">
        {([["mes", "Este mes"], ["anio", "Año de gestión"]] as const).map(([k, t]) => (
          <Button key={k} type="button" size="sm" variant={periodo.clave === k ? "default" : "outline"} onClick={() => ir({ p: k, inicio: String(inicio) })}>{t}</Button>
        ))}
        <span className="mx-1 hidden h-6 border-l sm:block" />
        <input type="date" aria-label="Desde" value={desde} onChange={(e) => setDesde(e.target.value)} className={CAMPO} />
        <input type="date" aria-label="Hasta" value={hasta} onChange={(e) => setHasta(e.target.value)} className={CAMPO} />
        <Button type="button" size="sm" variant={periodo.clave === "rango" ? "default" : "outline"} disabled={!desde || !hasta || desde > hasta} onClick={() => ir({ p: "rango", desde, hasta })}>Ver rango</Button>
      </div>
      {inicio !== 1 && periodo.clave === "t" && (
        <p className="text-xs text-muted-foreground">Trimestres contados desde {MESES[inicio - 1]}: I {rangoMeses(trimestresDelAnio(anioGestion, inicio)[0].desde, trimestresDelAnio(anioGestion, inicio)[0].hasta)}.</p>
      )}
    </div>
  );
}
