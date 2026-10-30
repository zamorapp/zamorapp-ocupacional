"use client";

import { useRef, useState } from "react";
import { AlertTriangle, CalendarDays, Lock, Pencil } from "lucide-react";
import { sumarDias } from "@/lib/fecha";

const corta = (iso: string) => iso.split("-").reverse().join("/");

// Fecha de la evaluación: la que sale en los impresos. Se puede poner en el pasado o en el futuro (pedido de Cesar);
// la hora real de registro y firma queda aparte en la base y en Auditoría. «hoy» llega del servidor (o de la hora
// anclada en el escritorio), nunca de new Date(): Cesar cambia la fecha de Windows para abrir el SAME.
export function FechaEvaluacion({ antes, fecha, hoy, registrada, modo, onCambiar }: {
  antes: string; // el estado de la consulta, en la misma línea
  fecha: string;
  hoy: string;
  registrada: string;
  modo: "editable" | "cerrada" | "firmada";
  onCambiar: (fecha: string) => void;
}) {
  const selector = useRef<HTMLInputElement>(null);
  const [ignorada, setIgnorada] = useState<string | null>(null);
  const futura = fecha > hoy;

  if (modo !== "editable") {
    return (
      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 sm:justify-end">
        {antes}
        <span className="inline-flex items-center gap-1 font-medium text-foreground">
          {modo === "firmada" ? <Lock className="size-3.5" aria-hidden /> : <CalendarDays className="size-3.5" aria-hidden />}
          <span className="sr-only">Fecha de la evaluación:</span> {corta(fecha)}
        </span>
        {modo === "firmada" && <span>· Se cambia con Corregir</span>}
      </div>
    );
  }

  const abrir = () => {
    const el = selector.current;
    if (!el) return;
    try { el.showPicker(); } catch { el.focus(); el.click(); }
  };

  return (
    <div className="flex flex-col items-start gap-1 sm:items-end">
      <div className="flex flex-wrap items-center gap-2 sm:justify-end">
        {antes}
        <button type="button" onClick={abrir} aria-label={`Fecha de la evaluación: ${corta(fecha)}, cambiar`}
          className="inline-flex items-center gap-1.5 rounded-full border bg-background px-2.5 py-1 text-xs font-medium text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <CalendarDays className="size-3.5" aria-hidden /> {corta(fecha)} <Pencil className="size-3 opacity-60" aria-hidden />
        </button>
        <input ref={selector} type="date" tabIndex={-1} aria-hidden className="sr-only" value={fecha}
          min="2000-01-01" max={sumarDias(hoy, 366)} onChange={(e) => e.target.value && onCambiar(e.target.value)} />
        {fecha !== hoy && (
          <button type="button" onClick={() => onCambiar(hoy)} className="text-xs text-primary underline-offset-2 hover:underline">Volver a hoy</button>
        )}
      </div>
      {futura && ignorada !== fecha && (
        <span role="status" className="inline-flex items-center gap-2 rounded-md bg-aviso/10 px-2 py-1 text-xs text-aviso-texto">
          <AlertTriangle className="size-3.5 shrink-0" aria-hidden />
          <span>Fecha futura: los impresos saldrán con el {corta(fecha)}.</span>
          <button type="button" onClick={() => setIgnorada(fecha)} className="font-medium underline-offset-2 hover:underline">Ignorar</button>
        </span>
      )}
      {!futura && fecha !== registrada && <span className="text-xs text-muted-foreground">Registrada el {corta(registrada)}</span>}
    </div>
  );
}

// Días entre dos fechas «AAAA-MM-DD» (sin horas: no depende de la zona)
export const diasEntre = (desde: string, hasta: string) =>
  Math.round((Date.parse(hasta + "T12:00:00Z") - Date.parse(desde + "T12:00:00Z")) / 86_400_000);
