"use client";

import { AlertTriangle, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { type Faltante, irACampo } from "@/lib/ir-a-campo";
import { cn } from "@/lib/utils";

// Aviso de datos faltantes de una historia: cada dato es un botón que lleva a su casilla (que también está en rojo).
// Rojo si falta algo importante, ámbar si todo es opcional. Nunca bloquea: «Ignorar» lo esconde.
export function AvisoFaltantes({ faltan, titulo = "Falta", nota, onIr, onIgnorar, className, id }: {
  faltan: Faltante[];
  titulo?: string;
  nota?: React.ReactNode;
  onIr?: (f: Faltante) => void; // cambia de pestaña antes de buscar la casilla
  onIgnorar?: () => void;
  className?: string;
  id?: string;
}) {
  if (!faltan.length) return null;
  const rojo = faltan.some((f) => f.importante !== false);
  const ir = (f: Faltante) => { onIr?.(f); irACampo(f.campo); };
  return (
    <div id={id} role="alert" className={cn("flex flex-wrap items-center gap-x-2 gap-y-1.5 rounded-lg px-3 py-2 text-sm",
      rojo ? "bg-alerta/10 text-alerta-texto" : "bg-aviso/10 text-aviso-texto", className)}>
      <AlertTriangle className="size-4 shrink-0" aria-hidden />
      <span className="font-medium">{titulo}:</span>
      {faltan.map((f) => (
        <button key={f.campo} type="button" onClick={() => ir(f)} title="Ir a la casilla"
          className={cn("inline-flex items-center gap-1 rounded-md border px-2 py-0.5 font-medium underline-offset-2 transition hover:underline",
            f.importante === false ? "border-aviso/60 bg-aviso/15 hover:bg-aviso/25" : "border-alerta/60 bg-alerta/15 hover:bg-alerta/25")}>
          {f.etiqueta} <ArrowRight className="size-3.5" aria-hidden />
        </button>
      ))}
      {nota && <span className="min-w-0 basis-full text-xs opacity-90 sm:basis-auto">{nota}</span>}
      {onIgnorar && <Button type="button" size="sm" variant="ghost" className="ml-auto h-7 text-current" onClick={onIgnorar}>Ignorar</Button>}
    </div>
  );
}
