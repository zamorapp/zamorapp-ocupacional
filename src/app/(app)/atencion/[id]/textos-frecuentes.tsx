"use client";

import { useState } from "react";
import { Check, ChevronDown, Plus, Search, X } from "lucide-react";
import { Label } from "@/components/ui/label";
import { fraseUsada, quitarFrase, sumarFrase } from "@/lib/frases";
import type { Item } from "@/lib/listas";
import { agruparPorCategoria } from "@/lib/recomendaciones-categorias";
import { cn } from "@/lib/utils";
import { TextoDictado } from "./dictado";

type Props = {
  etiqueta: string;
  items: Item[];
  motivoCodigo: string | null;
  motivoNombre: string | null;
  valor: string;
  onChange: (v: string) => void;
  filas?: number;
  /** Recomendaciones de empresa y trabajador: además de las del motivo, botones por categoría (columna, HTA…) y buscador */
  categorias?: boolean;
};

// "PRE,PER" → ["PRE","PER"]; vacío = sirve para cualquier motivo
const motivosDe = (i: Item) => (i.grupo ?? "").split(",").map((x) => x.trim().toUpperCase()).filter(Boolean);

// Campo de texto con un stock de frases frecuentes: un clic pega la frase, otro la quita
export function TextosFrecuentes({ etiqueta, items, motivoCodigo, motivoNombre, valor, onChange, filas = 4, categorias }: Props) {
  const [verTodos, setVerTodos] = useState(false);
  const [abierta, setAbierta] = useState<string | null>(null);
  const [buscar, setBuscar] = useState("");
  const codigo = motivoCodigo?.toUpperCase() ?? null;

  const delMotivo = codigo ? items.filter((i) => motivosDe(i).includes(codigo)) : [];
  const generales = items.filter((i) => motivosDe(i).length === 0);
  const otros = items.filter((i) => !delMotivo.includes(i) && !generales.includes(i));
  const visibles = [...delMotivo, ...generales, ...(verTodos ? otros : [])];

  const texto = (i: Item) => (i.texto || i.nombre).trim();
  // Una frase puede tener varias líneas (recomendaciones completas): se marca, suma y quita como bloque
  const usado = (i: Item) => fraseUsada(valor, texto(i));
  const alternar = (i: Item) => onChange(usado(i) ? quitarFrase(valor, texto(i)) : sumarFrase(valor, texto(i)));

  const Chip = ({ i, sugerido }: { i: Item; sugerido: boolean }) => (
    <button
      type="button"
      title={texto(i)}
      aria-pressed={usado(i)}
      onClick={() => alternar(i)}
      className={cn(
        "inline-flex max-w-full items-center gap-1 whitespace-nowrap rounded-full border px-2.5 py-1 text-xs transition",
        usado(i)
          ? "border-primary bg-primary text-primary-foreground"
          : sugerido
            ? "border-primary/40 bg-primary/5 text-primary hover:bg-primary/10"
            : "hover:border-primary/50 hover:bg-muted",
      )}
    >
      {usado(i) ? <Check className="size-3 shrink-0" /> : <Plus className="size-3 shrink-0" />}
      <span className="truncate">{i.nombre}</span>
    </button>
  );

  if (categorias && items.length > 0) {
    const grupos = agruparPorCategoria(items);
    const q = buscar.trim().toLowerCase();
    const halladas = q ? items.filter((i) => `${i.nombre} ${i.texto ?? ""}`.toLowerCase().includes(q)) : [];
    const grupo = grupos.find((g) => g.categoria === abierta);
    return (
      <div className="space-y-2">
        <Label>{etiqueta}</Label>
        <div className="space-y-2 rounded-lg border bg-muted/30 p-2.5">
          {delMotivo.length > 0 && (
            <div>
              <p className="mb-1.5 text-xs text-muted-foreground">Sugeridas para <b className="text-foreground">{motivoNombre}</b></p>
              <div className="flex flex-wrap gap-1.5">{delMotivo.map((i) => <Chip key={i.id} i={i} sugerido />)}</div>
            </div>
          )}
          <div className="relative">
            <Search className="pointer-events-none absolute top-2 left-2.5 size-3.5 text-muted-foreground" />
            <input
              type="search"
              value={buscar}
              onChange={(e) => setBuscar(e.target.value)}
              placeholder="Buscar: hernia, lumbalgia, tensión…"
              aria-label={`Buscar en ${etiqueta.toLowerCase()}`}
              className="h-8 w-full rounded-md border bg-card pr-8 pl-8 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            />
            {buscar && <button type="button" aria-label="Limpiar búsqueda" onClick={() => setBuscar("")} className="absolute top-1.5 right-1.5 rounded p-0.5 text-muted-foreground hover:bg-muted"><X className="size-3.5" /></button>}
          </div>
          {q ? (
            halladas.length
              ? <div className="flex flex-wrap gap-1.5">{halladas.map((i) => <Chip key={i.id} i={i} sugerido={false} />)}</div>
              : <p className="text-xs text-muted-foreground">Nada con «{buscar.trim()}». Escríbela abajo o agrégala en Configuración › Datos clínicos.</p>
          ) : (
            <>
              <div className="flex flex-wrap gap-1.5" role="group" aria-label="Categorías">
                {grupos.map((g) => {
                  const usadas = g.items.filter(usado).length;
                  const activa = abierta === g.categoria;
                  return (
                    <button
                      key={g.categoria}
                      type="button"
                      aria-expanded={activa}
                      onClick={() => setAbierta(activa ? null : g.categoria)}
                      className={cn(
                        "inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium transition",
                        activa ? "border-primary bg-primary/10 text-primary" : "bg-card hover:border-primary/50",
                      )}
                    >
                      {g.nombre}
                      <span className={cn("rounded px-1 tabular-nums", usadas ? "bg-primary text-primary-foreground" : "text-muted-foreground")}>{usadas ? `${usadas}/${g.items.length}` : g.items.length}</span>
                      <ChevronDown className={cn("size-3 transition-transform", activa && "rotate-180")} />
                    </button>
                  );
                })}
              </div>
              {grupo && (
                <div className="flex flex-wrap gap-1.5 border-t pt-2">
                  {grupo.items.map((i) => <Chip key={i.id} i={i} sugerido={delMotivo.includes(i)} />)}
                </div>
              )}
            </>
          )}
        </div>
        <TextoDictado id={`frecuentes-${etiqueta}`} valor={valor} filas={filas} onChange={onChange} placeholder="Elige recomendaciones arriba, escribe o dicta" />
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <Label>{etiqueta}</Label>
      {items.length > 0 && (
        <div className="rounded-lg border bg-muted/30 p-2.5">
          {delMotivo.length > 0 && (
            <p className="mb-1.5 text-xs text-muted-foreground">Frecuentes para <b className="text-foreground">{motivoNombre}</b> y generales</p>
          )}
          <div className="flex flex-wrap gap-1.5">
            {visibles.map((i) => <Chip key={i.id} i={i} sugerido={delMotivo.includes(i)} />)}
            {otros.length > 0 && (
              <button type="button" onClick={() => setVerTodos(!verTodos)} className="px-2 py-1 text-xs text-primary hover:underline">
                {verTodos ? "Ver menos" : `+${otros.length} de otros motivos`}
              </button>
            )}
          </div>
        </div>
      )}
      <TextoDictado id={`frecuentes-${etiqueta}`} valor={valor} filas={filas} onChange={onChange} placeholder="Elige frases arriba, escribe o dicta" />
    </div>
  );
}
