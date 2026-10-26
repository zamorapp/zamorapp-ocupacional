"use client";

import { useEffect, useRef, useState } from "react";
import { History, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { buscarDiagnosticos, type DiagnosticoEncontrado } from "../acciones";

type Props = {
  cie10: string;
  descripcion: string;
  onElegir: (d: { cie10: string; descripcion: string }) => void;
  onEscribir: (descripcion: string) => void;
  autoFocus?: boolean;
};

// Escribe parte del nombre o del código ("sindrome tunel", "M54") y elige de la lista.
// Primero salen los diagnósticos que el servicio ya usó, luego el catálogo CIE-10.
export function BuscadorDiagnostico({ cie10, descripcion, onElegir, onEscribir, autoFocus }: Props) {
  const [abierto, setAbierto] = useState(false);
  const [resultados, setResultados] = useState<DiagnosticoEncontrado[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [activo, setActivo] = useState(0);
  const caja = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!abierto || descripcion.trim().length < 2) {
      setResultados([]);
      return;
    }
    let vigente = true;
    setBuscando(true);
    const t = setTimeout(async () => {
      const r = await buscarDiagnosticos(descripcion);
      if (vigente) {
        setResultados(r);
        setActivo(0);
        setBuscando(false);
      }
    }, 200);
    return () => {
      vigente = false;
      clearTimeout(t);
    };
  }, [descripcion, abierto]);

  useEffect(() => {
    const fuera = (e: MouseEvent) => {
      if (caja.current && !caja.current.contains(e.target as Node)) setAbierto(false);
    };
    document.addEventListener("mousedown", fuera);
    return () => document.removeEventListener("mousedown", fuera);
  }, []);

  const elegir = (r: DiagnosticoEncontrado) => {
    onElegir({ cie10: r.cie10, descripcion: r.descripcion });
    setAbierto(false);
  };

  return (
    <div ref={caja} className="relative">
      <div className="flex h-9 items-center rounded-md border bg-transparent focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20">
        <span className={cn("w-20 shrink-0 border-r px-2 font-mono text-sm", cie10 ? "text-foreground" : "text-muted-foreground")}>{cie10 || "CIE-10"}</span>
        <input
          value={descripcion}
          autoFocus={autoFocus}
          placeholder="Escribe el diagnóstico o el código…"
          onFocus={() => setAbierto(true)}
          onChange={(e) => {
            onEscribir(e.target.value);
            setAbierto(true);
          }}
          onKeyDown={(e) => {
            if (!resultados.length) return;
            if (e.key === "ArrowDown") { e.preventDefault(); setActivo((a) => Math.min(a + 1, resultados.length - 1)); }
            if (e.key === "ArrowUp") { e.preventDefault(); setActivo((a) => Math.max(a - 1, 0)); }
            if (e.key === "Enter") { e.preventDefault(); elegir(resultados[activo]); }
            if (e.key === "Escape") setAbierto(false);
          }}
          className="h-full min-w-0 flex-1 bg-transparent px-2 text-sm outline-none"
        />
        {buscando && <Loader2 className="mr-2 size-4 animate-spin text-muted-foreground" />}
      </div>
      {abierto && resultados.length > 0 && (
        <ul className="absolute z-30 mt-1 max-h-72 w-full overflow-y-auto rounded-lg border bg-popover py-1 shadow-lg">
          {resultados.map((r, i) => (
            <li key={r.cie10 + r.descripcion}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => elegir(r)}
                onMouseEnter={() => setActivo(i)}
                className={cn("flex w-full items-start gap-3 px-3 py-1.5 text-left text-sm", i === activo && "bg-primary/10")}
              >
                <span className="w-16 shrink-0 font-mono text-xs leading-5 text-muted-foreground">{r.cie10}</span>
                <span className="flex-1">{r.descripcion}</span>
                {r.usos >= 900000 ? (
                  <span className="shrink-0 rounded-full bg-primary/10 px-2 text-xs text-primary" title="De tu lista «Mis diagnósticos»">Mío</span>
                ) : r.usos > 0 && (
                  <span className="flex shrink-0 items-center gap-1 text-xs text-primary" title="Usado antes en el servicio">
                    <History className="size-3" /> {r.usos}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
