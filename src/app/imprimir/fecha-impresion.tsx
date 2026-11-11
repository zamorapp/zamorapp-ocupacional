"use client";

import { useSyncExternalStore } from "react";
import { useSearchParams } from "next/navigation";
import { CalendarDays } from "lucide-react";
import { hoyCaracas } from "@/lib/fecha";

// Fecha de impresión editable (Cesar, 11-nov): por defecto hoy; se cambia en la barra de cualquier hoja y viaja en
// la dirección (?impreso=AAAA-MM-DD), así el lote, la vista previa y el PDF la respetan sin tocar la base de datos.
// Solo cambia el pie «Impreso por … · fecha»: la fecha de la evaluación sigue siendo la de la consulta.
const ISO = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

const EVENTO = "zamorapp:fecha-impresion";
const valida = (v: string | null) => (v && ISO.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`)) ? v : null);
const suscribir = (cb: () => void) => {
  window.addEventListener(EVENTO, cb);
  window.addEventListener("popstate", cb);
  return () => {
    window.removeEventListener(EVENTO, cb);
    window.removeEventListener("popstate", cb);
  };
};

// La barra y todos los pies de la hoja leen la misma fecha y cambian juntos al instante
export function useFechaImpresion(): string | null {
  const inicial = useSearchParams().get("impreso");
  return valida(useSyncExternalStore(suscribir, () => new URLSearchParams(window.location.search).get("impreso"), () => inicial));
}

const corta = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(2, 4)}`;

// En el pie: la fecha elegida (sin hora) o, si no se eligió, la fecha y hora reales de impresión
export function FechaImpreso({ el }: { el: string }) {
  const f = useFechaImpresion();
  return <span data-prueba="fecha-impresion">{f ? corta(f) : el}</span>;
}

// "05-11-2026": para el nombre del PDF
export const fechaArchivo = (iso: string) => `${iso.slice(8, 10)}-${iso.slice(5, 7)}-${iso.slice(0, 4)}`;

export function CampoFechaImpresion() {
  const f = useFechaImpresion();
  const hoy = hoyCaracas();
  const cambiar = (v: string) => {
    const url = new URL(window.location.href);
    if (!v || v === hoy) url.searchParams.delete("impreso");
    else url.searchParams.set("impreso", v);
    // Sin recargar la hoja; la dirección guarda la fecha para el PDF y para volver a abrirla
    window.history.replaceState(window.history.state, "", url);
    window.dispatchEvent(new Event(EVENTO));
  };
  return (
    <label className="flex items-center gap-1.5 rounded-md border bg-background px-2 py-1 text-sm" title="Fecha que sale en el pie de la hoja. Por defecto, hoy.">
      <CalendarDays className="size-4 text-muted-foreground" aria-hidden />
      <span className="whitespace-nowrap text-muted-foreground">Fecha de impresión</span>
      <input
        type="date"
        data-accion="fecha-impresion"
        className="bg-transparent font-medium tabular-nums outline-none"
        value={f ?? hoy}
        onChange={(e) => cambiar(e.target.value)}
      />
      {f && f !== hoy && (
        <button type="button" className="text-xs font-medium text-primary underline-offset-2 hover:underline" onClick={() => cambiar("")}>
          Hoy
        </button>
      )}
    </label>
  );
}
