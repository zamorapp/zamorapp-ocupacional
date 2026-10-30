"use client";

import { useEffect, useState } from "react";
import { Delete, Loader2, Lock } from "lucide-react";
import { cn } from "@/lib/utils";

// Teclado de PIN grande, para el pulgar. Llama a `listo` cuando el PIN tiene el largo pedido (o con «OK»).
export function TecladoPin({ titulo, detalle, error, ocupado, largoMin = 8, alListo }: {
  titulo: string; detalle?: string; error?: string | null; ocupado?: boolean; largoMin?: number; alListo: (pin: string) => void;
}) {
  const [pin, setPin] = useState("");
  useEffect(() => { if (error) setPin(""); }, [error]);
  const tocar = (d: string) => { if (!ocupado && pin.length < 12) setPin(pin + d); };
  const ok = () => { if (pin.length >= largoMin && !ocupado) alListo(pin); };

  return (
    <div className="mx-auto flex w-full max-w-xs flex-col items-center gap-5">
      <span className="grid size-14 place-items-center rounded-2xl bg-primary/10 text-primary">
        {ocupado ? <Loader2 className="size-7 animate-spin" /> : <Lock className="size-7" />}
      </span>
      <div className="text-center">
        <h1 className="text-lg font-semibold">{titulo}</h1>
        {detalle && <p className="mt-1 text-sm text-muted-foreground">{detalle}</p>}
      </div>
      <div className="flex h-4 items-center gap-2.5" aria-label={`${pin.length} números escritos`}>
        {Array.from({ length: Math.max(8, pin.length) }, (_, i) => (
          <span key={i} className={cn("size-3 rounded-full border-2 border-primary/50 transition-colors", i < pin.length && "border-primary bg-primary")} />
        ))}
      </div>
      <p className={cn("min-h-5 text-center text-sm", error ? "text-alerta-texto" : "text-transparent")} role="alert">{error || "·"}</p>
      <div className="grid w-full grid-cols-3 gap-3">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
          <BotonTecla key={d} onClick={() => tocar(d)}>{d}</BotonTecla>
        ))}
        <BotonTecla onClick={() => setPin(pin.slice(0, -1))} aria-label="Borrar"><Delete className="size-6" /></BotonTecla>
        <BotonTecla onClick={() => tocar("0")}>0</BotonTecla>
        <button type="button" onClick={ok} disabled={pin.length < largoMin || ocupado}
          className="h-16 rounded-2xl bg-primary text-lg font-semibold text-primary-foreground transition active:scale-95 disabled:opacity-40">
          OK
        </button>
      </div>
    </div>
  );
}

function BotonTecla(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type="button" {...props} className="grid h-16 place-items-center rounded-2xl bg-muted text-2xl font-medium transition active:scale-95 active:bg-muted-foreground/20" />;
}
