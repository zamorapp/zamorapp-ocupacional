"use client";

import { useEffect, useState } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { aplicarTema, leerTema, type Tema } from "@/lib/tema";
import { cn } from "@/lib/utils";

const OPCIONES: { valor: Tema; titulo: string; icono: typeof Sun }[] = [
  { valor: "claro", titulo: "Claro", icono: Sun },
  { valor: "oscuro", titulo: "Oscuro", icono: Moon },
  { valor: "sistema", titulo: "Sistema", icono: Monitor },
];

// Control segmentado de tres opciones; sigue al sistema si así se elige.
export function SelectorTema({ className }: { className?: string }) {
  const [tema, setTema] = useState<Tema>("sistema");
  useEffect(() => {
    setTema(leerTema());
    const medio = matchMedia("(prefers-color-scheme: dark)");
    const alCambiar = () => leerTema() === "sistema" && aplicarTema("sistema");
    medio.addEventListener("change", alCambiar);
    return () => medio.removeEventListener("change", alCambiar);
  }, []);

  return (
    <div role="radiogroup" aria-label="Tema" className={cn("grid grid-cols-3 gap-1 rounded-lg bg-muted p-1", className)}>
      {OPCIONES.map(({ valor, titulo, icono: Icono }) => (
        <button
          key={valor}
          type="button"
          role="radio"
          aria-checked={tema === valor}
          onClick={(e) => {
            e.preventDefault();
            setTema(valor);
            aplicarTema(valor);
          }}
          className={cn(
            "flex items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium transition-colors",
            tema === valor ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
          )}
        >
          <Icono className="size-3.5" /> {titulo}
        </button>
      ))}
    </div>
  );
}
