"use client";

import { ArrowLeft, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { comparar, explicarMotivo, nombreTabla } from "@/lib/escritorio-bandeja";
import type { Motor } from "@/lib/movil/motor";
import { cn } from "@/lib/utils";
import { useMotor } from "./usar-motor";

// Lo que espera subir y lo que la nube no aceptó (conflicto o rechazo), con su motivo en palabras simples.
// Mismos textos y comparación que la pantalla Conflictos de la PC (escritorio-bandeja.ts), dichos para el teléfono.
// Nada se descarta solo: el médico elige «Reintentar» (sobre lo que hay ahora en la nube) o «Descartar» (manda la nube).
export function Pendientes({ motor, enLinea, volver }: { motor: Motor; enLinea: boolean; volver: () => void }) {
  const e = useMotor(motor);
  const cambios = [...motor.bandeja.values()].sort((a, b) => Number(a.estado === "pendiente") - Number(b.estado === "pendiente") || b.orden - a.orden);
  const revisar = cambios.filter((c) => c.estado !== "pendiente");
  const porSubir = cambios.filter((c) => c.estado === "pendiente");
  const aqui = (t: string) => t.replace(/esta PC/g, "este teléfono").replace(/la PC/g, "el teléfono");

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button size="icon" variant="ghost" onClick={volver} aria-label="Volver"><ArrowLeft /></Button>
        <h2 className="flex-1 font-semibold">Sincronía</h2>
        <Button size="sm" disabled={!enLinea || e.sincronizando} onClick={() => motor.sincronizar()}>
          {e.sincronizando ? <Loader2 className="animate-spin" /> : <RefreshCw />} Sincronizar ahora
        </Button>
      </div>
      {!enLinea && <p className="text-sm text-muted-foreground">Sin señal: todo queda guardado en el teléfono y sube solo al volver la señal.</p>}

      {revisar.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-sm font-semibold text-destructive">Por revisar ({revisar.length})</h3>
          <ul className="space-y-2">
            {revisar.map((c) => (
              <li key={c.id} className="space-y-2 rounded-xl border border-destructive/30 bg-card p-3">
                <div className="text-sm font-medium">{nombreTabla(c.tabla)} · {aqui(explicarMotivo(c.motivo, c.estado).titulo)}</div>
                <p className="text-xs text-muted-foreground">{aqui(explicarMotivo(c.motivo, c.estado).texto)}</p>
                {c.datos && (
                  <table className="w-full table-fixed text-xs">
                    <thead><tr className="text-left text-muted-foreground"><th className="w-1/4 font-normal">Campo</th><th className="font-normal">Teléfono</th><th className="font-normal">Nube</th></tr></thead>
                    <tbody>
                      {comparar(c.datos, motor.tabla(c.tabla).get(c.fila_id) ?? null).slice(0, 8).map((f) => (
                        <tr key={f.campo} className={cn("align-top", f.distinto && "font-medium")}>
                          <td className="py-0.5 pr-1 text-muted-foreground">{f.etiqueta}</td>
                          <td className="break-words py-0.5 pr-1">{f.pc}</td>
                          <td className="break-words py-0.5">{f.nube}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => motor.resolver(c.id, "descartar")}>Quedarme con la nube</Button>
                  <Button size="sm" onClick={() => motor.resolver(c.id, "reintentar")}>Subir lo del teléfono</Button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="space-y-2">
        <h3 className="text-sm font-semibold">Por subir ({porSubir.length})</h3>
        {porSubir.length ? (
          <ul className="divide-y rounded-xl border bg-card text-sm">
            {porSubir.slice(0, 100).map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-2 px-4 py-2.5">
                <span>{nombreTabla(c.tabla)} · {c.op === "I" ? "nuevo" : c.op === "D" ? "borrado" : "cambio"}</span>
                <span className={cn("text-xs", c.intentos ? "text-aviso-texto" : "text-muted-foreground")}>{c.intentos ? `${c.intentos} intentos` : "esperando"}</span>
              </li>
            ))}
          </ul>
        ) : <p className="text-sm text-muted-foreground">Todo está subido.</p>}
      </section>
    </div>
  );
}
