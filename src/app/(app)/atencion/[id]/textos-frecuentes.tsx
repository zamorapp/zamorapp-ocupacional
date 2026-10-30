"use client";

import { useState } from "react";
import { Check, Plus } from "lucide-react";
import { Label } from "@/components/ui/label";
import type { Item } from "@/lib/listas";
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
};

// "PRE,PER" → ["PRE","PER"]; vacío = sirve para cualquier motivo
const motivosDe = (i: Item) => (i.grupo ?? "").split(",").map((x) => x.trim().toUpperCase()).filter(Boolean);

// Campo de texto con un stock de frases frecuentes: un clic pega la frase, otro la quita
export function TextosFrecuentes({ etiqueta, items, motivoCodigo, motivoNombre, valor, onChange, filas = 4 }: Props) {
  const [verTodos, setVerTodos] = useState(false);
  const codigo = motivoCodigo?.toUpperCase() ?? null;

  const delMotivo = codigo ? items.filter((i) => motivosDe(i).includes(codigo)) : [];
  const generales = items.filter((i) => motivosDe(i).length === 0);
  const otros = items.filter((i) => !delMotivo.includes(i) && !generales.includes(i));
  const visibles = [...delMotivo, ...generales, ...(verTodos ? otros : [])];

  const texto = (i: Item) => (i.texto || i.nombre).trim();
  const usado = (i: Item) => valor.split("\n").some((l) => l.trim() === texto(i));

  const alternar = (i: Item) => {
    const lineas = valor.split("\n").filter((l) => l.trim());
    onChange(usado(i) ? lineas.filter((l) => l.trim() !== texto(i)).join("\n") : [...lineas, texto(i)].join("\n"));
  };

  const Chip = ({ i, sugerido }: { i: Item; sugerido: boolean }) => (
    <button
      type="button"
      title={texto(i)}
      aria-pressed={usado(i)}
      onClick={() => alternar(i)}
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2.5 py-1 text-xs transition",
        usado(i)
          ? "border-primary bg-primary text-primary-foreground"
          : sugerido
            ? "border-primary/40 bg-primary/5 text-primary hover:bg-primary/10"
            : "hover:border-primary/50 hover:bg-muted",
      )}
    >
      {usado(i) ? <Check className="size-3" /> : <Plus className="size-3" />}
      {i.nombre}
    </button>
  );

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
