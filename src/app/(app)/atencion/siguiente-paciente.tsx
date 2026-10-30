"use client";

import { useState, useTransition } from "react";
import { ArrowRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { SiguienteCita } from "@/lib/citas";
import { atenderSiguiente } from "./acciones";

// Al terminar una consulta: abre la del primero que espera, sin volver a la cola (un clic en vez de tres)
export function SiguientePaciente({ siguiente, variante = "outline" }: { siguiente: SiguienteCita | null; variante?: "outline" | "default" }) {
  const [ocupado, iniciar] = useTransition();
  const [error, setError] = useState("");
  if (!siguiente) return null;
  const nombre = siguiente.corto || siguiente.paciente;
  return (
    <span className="inline-flex flex-col items-end gap-1">
      <Button variant={variante} disabled={ocupado} data-accion="siguiente-paciente"
        aria-label={`Siguiente: ${nombre}, ${siguiente.enEspera} en espera`}
        onClick={() => iniciar(async () => { const r = await atenderSiguiente(); if (r && !r.ok) setError(r.mensaje); })}>
        {ocupado ? <Loader2 className="animate-spin" /> : <ArrowRight />}
        <span className="max-w-48 truncate">Siguiente: {nombre}</span>
        {siguiente.enEspera > 1 && <span className="rounded-full bg-muted px-1.5 text-xs font-medium tabular-nums text-muted-foreground">{siguiente.enEspera}<span className="sr-only"> en espera</span></span>}
      </Button>
      {error && <span role="status" className="text-xs text-destructive">{error}</span>}
    </span>
  );
}
