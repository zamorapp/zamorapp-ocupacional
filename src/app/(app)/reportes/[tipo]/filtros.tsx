"use client";

import { useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Columns3, Loader2, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import type { Columna, Opcion } from "@/lib/reportes-catalogo";

const CAMPO = "h-9 rounded-md border bg-card px-2 text-sm";

// Búsqueda, opciones, filtros y columnas opcionales del reporte. Todo va en la URL:
// la impresión y el Excel salen exactamente igual a lo que se ve.
export function FiltrosReporte({ columnas, valores, opciones, elegidas, ver }: {
  columnas: Columna[];
  valores: Record<string, string[]>;
  opciones: Opcion[];
  elegidas: Record<string, string>;
  ver: string[];
}) {
  const router = useRouter();
  const ruta = usePathname();
  const q = useSearchParams();
  const [texto, setTexto] = useState(q.get("q") ?? "");
  // Mientras llega el reporte filtrado, el botón gira: el cálculo puede tardar unos segundos
  const [cargando, iniciar] = useTransition();

  const ir = (cambios: Record<string, string | null>) => {
    const p = new URLSearchParams(q.toString());
    for (const [k, v] of Object.entries(cambios)) {
      if (v) p.set(k, v);
      else p.delete(k);
    }
    iniciar(() => router.push(`${ruta}?${p}`, { scroll: false }));
  };
  const hayFiltros = [...q.keys()].some((k) => k.startsWith("f_") || k === "q");
  const titulo = (k: string) => columnas.find((c) => c.k === k)?.t ?? k;
  const opcionales = columnas.filter((c) => c.opcional);

  return (
    <div className="flex flex-wrap items-end gap-2 rounded-xl border bg-card p-3">
      <form
        className="flex min-w-0 flex-1 basis-56 items-center gap-1"
        onSubmit={(e) => {
          e.preventDefault();
          ir({ q: texto.trim() || null });
        }}
      >
        <label className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute top-2.5 left-2.5 size-4 text-muted-foreground" />
          <input value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Buscar paciente, cédula, diagnóstico…" aria-label="Buscar en el reporte" className={`${CAMPO} w-full pl-8`} />
        </label>
        <Button type="submit" size="sm" variant="outline" disabled={cargando}>{cargando ? <><Loader2 className="animate-spin" /> Buscando…</> : "Buscar"}</Button>
      </form>

      {opciones.map((o) => (
        <label key={o.k} className="grid gap-1 text-xs font-medium text-primary">
          {o.t}
          <select value={elegidas[o.k] ?? ""} onChange={(e) => ir({ [`o_${o.k}`]: e.target.value || null })} className={`${CAMPO} border-primary/40`}>
            {o.valores.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
          </select>
        </label>
      ))}

      {Object.entries(valores).map(([k, vs]) =>
        vs.length > 1 || q.get(`f_${k}`) ? (
          <label key={k} className="grid gap-1 text-xs text-muted-foreground">
            {titulo(k)}
            <select value={q.get(`f_${k}`) ?? ""} onChange={(e) => ir({ [`f_${k}`]: e.target.value || null })} className={`${CAMPO} max-w-52`}>
              <option value="">Todos</option>
              {vs.map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
          </label>
        ) : null,
      )}

      {opcionales.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" size="sm" variant="outline" className="h-9"><Columns3 /> Mostrar{ver.length ? ` (${ver.length})` : ""}</Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64">
            <DropdownMenuLabel className="flex items-center justify-between text-xs text-muted-foreground">
              Columnas adicionales
              <button
                type="button"
                className="font-medium text-primary hover:underline"
                onClick={() => ir({ ver: ver.length === opcionales.length ? null : opcionales.map((c) => c.k).join(",") })}
              >
                {ver.length === opcionales.length ? "Ninguna" : "Todas"}
              </button>
            </DropdownMenuLabel>
            {opcionales.map((c) => (
              <DropdownMenuCheckboxItem
                key={c.k}
                checked={ver.includes(c.k)}
                onSelect={(e) => e.preventDefault()}
                onCheckedChange={(si) => ir({ ver: (si ? [...ver, c.k] : ver.filter((k) => k !== c.k)).join(",") || null })}
              >
                {c.t}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      {hayFiltros && (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => {
            setTexto("");
            ir(Object.fromEntries([...q.keys()].filter((k) => k.startsWith("f_") || k === "q").map((k) => [k, null])));
          }}
        >
          <X /> Quitar filtros
        </Button>
      )}
    </div>
  );
}
