"use client";

import { useState } from "react";
import { StickyNote } from "lucide-react";
import { Input } from "@/components/ui/input";
import type { Habito } from "@/lib/consultas-tipos";
import { campoVisible, conDetalle, detalleDe, formaDe, habitosNormales, todosNormales, type DetalleHabito } from "@/lib/habitos";
import { cn } from "@/lib/utils";

type Props = { valor: Habito[]; onChange: (v: Habito[]) => void };

const selectCls = "h-8 w-full rounded-md border bg-transparent px-2 text-sm dark:bg-input/30";

// Hábitos psicobiológicos: tocar una opción arma el texto clínico solo (lib/habitos.ts).
// Hábitos propios de la organización sin forma conocida siguen como texto libre.
export function Habitos({ valor, onChange }: Props) {
  const normales = todosNormales(valor);
  const cambiar = (i: number, h: Habito) => onChange(valor.map((x, j) => (j === i ? h : x)));

  return (
    <div className="space-y-3">
      <label
        className={cn(
          "flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors",
          normales ? "border-ok/50 bg-ok/10 text-ok-texto" : "border-dashed text-muted-foreground hover:text-foreground",
        )}
      >
        <input
          type="checkbox"
          checked={normales}
          onChange={(e) => onChange(e.target.checked ? habitosNormales(valor) : valor.map((h) => (formaDe(h.clave)?.opcional ? h : { ...h, detalle: {}, valor: "" })))}
          className="size-4 accent-[var(--primary)]"
        />
        <span>
          No refiere hábitos psicobiológicos de importancia
          <span className="block text-xs font-normal text-muted-foreground">Sueño, actividad física y alimentación quedan en lo normal.</span>
        </span>
      </label>
      <div className="divide-y">
        {valor.map((h, i) => (
          <FilaHabito key={h.clave} habito={h} onChange={(n) => cambiar(i, n)} />
        ))}
      </div>
    </div>
  );
}

function FilaHabito({ habito, onChange }: { habito: Habito; onChange: (h: Habito) => void }) {
  const forma = formaDe(habito.clave);
  const d = detalleDe(habito);
  const [verNota, setVerNota] = useState(Boolean(d.nota));

  if (!forma) {
    return (
      <div className="grid grid-cols-1 items-center gap-1 py-2 sm:grid-cols-[8.5rem_minmax(0,1fr)] sm:gap-3">
        <span className="text-sm">{habito.nombre}</span>
        <Input value={habito.valor} className="h-8" placeholder="Niega" onChange={(e) => onChange({ ...habito, valor: e.target.value })} />
      </div>
    );
  }

  const poner = (cambio: DetalleHabito) => onChange(conDetalle(habito, { ...d, ...cambio }));
  const campos = forma.campos.filter((c) => campoVisible(c, d));

  return (
    <div className="grid grid-cols-1 gap-1.5 py-2.5 sm:grid-cols-[8.5rem_minmax(0,1fr)] sm:gap-3">
      <div className="pt-1 text-sm">
        {habito.nombre}
        {forma.opcional && <span className="block text-[11px] text-muted-foreground">Opcional</span>}
      </div>
      <div className="min-w-0 space-y-2">
        <div className="flex flex-wrap items-center gap-1.5">
          {forma.estados.map((e) => {
            const activo = d.estado === e.valor;
            return (
              <button
                key={e.valor}
                type="button"
                aria-pressed={activo}
                onClick={() => poner({ estado: activo ? undefined : e.valor })}
                className={cn(
                  "h-7 rounded-full border px-3 text-xs transition-colors",
                  activo ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted",
                )}
              >
                {e.nombre}
              </button>
            );
          })}
          <button
            type="button"
            title="Agregar una nota"
            aria-label={`Nota de ${habito.nombre}`}
            aria-pressed={verNota}
            onClick={() => setVerNota((v) => !v)}
            className={cn("ml-auto inline-flex size-7 items-center justify-center rounded-full text-muted-foreground hover:bg-muted", (verNota || d.nota) && "text-primary")}
          >
            <StickyNote className="size-4" />
          </button>
        </div>
        {campos.length > 0 && (
          <div className="grid grid-cols-2 gap-2">
            {campos.map((c) => (
              <label key={c.campo} className="space-y-0.5">
                <span className="text-[11px] text-muted-foreground">{c.etiqueta}</span>
                {c.opciones ? (
                  <select value={d[c.campo] ?? ""} onChange={(e) => poner({ [c.campo]: e.target.value || undefined })} className={selectCls}>
                    <option value="">—</option>
                    {c.opciones.map((o) => (
                      <option key={o} value={o}>{c.campo === "horas" ? `${o} ${o === "1" ? "hora" : "horas"}` : o}</option>
                    ))}
                  </select>
                ) : (
                  <Input value={d[c.campo] ?? ""} placeholder={c.libre} className="h-8" onChange={(e) => poner({ [c.campo]: e.target.value })} />
                )}
              </label>
            ))}
          </div>
        )}
        {(verNota || d.nota) && (
          <Input value={d.nota ?? ""} placeholder="Nota (opcional)" className="h-8" onChange={(e) => poner({ nota: e.target.value })} />
        )}
        {habito.valor && <p className="text-xs text-muted-foreground">Sale en el informe: «{habito.valor}»</p>}
      </div>
    </div>
  );
}
