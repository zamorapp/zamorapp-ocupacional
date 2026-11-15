"use client";

import { useState } from "react";
import type { Causa } from "@/lib/reportes";
import { CORTES, ETIQUETA_CLAVE } from "@/lib/vigilancia-textos";
import { cn } from "@/lib/utils";
import { sinCodigo } from "@/lib/diagnostico-texto";

// Diez primeras causas de morbilidad por el corte que se elija (lo que el SAME reparte en 20 páginas)
export function ExploradorCausas({ cortes, poblacion }: { cortes: Record<string, Record<string, Causa[]>>; poblacion: number }) {
  const disponibles = CORTES.filter(([g]) => Object.keys(cortes[g] ?? {}).length);
  const [grupo, setGrupo] = useState(disponibles[0]?.[0] ?? "tipo");
  const claves = Object.keys(cortes[grupo] ?? {}).sort();
  const [clave, setClave] = useState<string | null>(null);
  const actual = clave && claves.includes(clave) ? clave : claves[0];
  const filas = (actual && cortes[grupo]?.[actual]) || [];

  if (!disponibles.length) return <p className="py-4 text-center text-sm text-muted-foreground">Sin diagnósticos en el período.</p>;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1">
        {disponibles.map(([g, t]) => (
          <button key={g} type="button" onClick={() => { setGrupo(g); setClave(null); }}
            className={cn("rounded-md px-2.5 py-1 text-xs transition", grupo === g ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-muted/70")}>
            {t}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-1">
        {claves.map((k) => (
          <button key={k} type="button" onClick={() => setClave(k)}
            className={cn("rounded-full border px-2.5 py-0.5 text-xs transition", actual === k ? "border-primary text-primary" : "text-muted-foreground hover:bg-muted")}>
            {ETIQUETA_CLAVE[k] ?? k}
          </button>
        ))}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs text-muted-foreground">
              <th className="py-1.5 pr-2 font-medium">Diagnóstico</th>
              <th className="py-1.5 text-right font-medium">Casos</th>
              <th className="py-1.5 text-right font-medium">Pacientes</th>
              <th className="py-1.5 text-right font-medium">Prev. %</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((c) => (
              <tr key={c.cie10} className="border-b last:border-0">
                <td className="py-1.5 pr-2">{sinCodigo(c.cie10) ? <span className="text-muted-foreground">Sin CIE-10 (varios diagnósticos)</span> : <><span className="font-mono text-xs text-muted-foreground">{c.cie10}</span> {c.descripcion}</>}</td>
                <td className="py-1.5 text-right tabular-nums">{c.n}</td>
                <td className="py-1.5 text-right tabular-nums">{c.pacientes ?? "—"}</td>
                <td className="py-1.5 text-right tabular-nums">{poblacion ? (Math.round(((c.pacientes ?? 0) * 1000) / poblacion) / 10).toLocaleString("es-VE") : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">Prevalencia: pacientes afectados sobre la población total de trabajadores efectivos ({poblacion}).</p>
    </div>
  );
}
