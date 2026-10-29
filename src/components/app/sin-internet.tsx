"use client";

// Escritorio sin internet: lo que solo existe en la nube (enlaces de WhatsApp, invitaciones de RR. HH.) se avisa
// antes de intentarlo, en vez de fallar. Lee el mismo estado que el indicador del encabezado, para que nunca se
// contradigan. En la web siempre hay conexión y no muestra nada.
import { CloudOff, Loader2, RefreshCw } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { ESCRITORIO } from "@/lib/escritorio-actualizar";
import { refrescarEstado, useEstadoEscritorio } from "@/lib/escritorio-estado";

export function useSinInternet(): boolean {
  const e = useEstadoEscritorio();
  return ESCRITORIO && e.conocido && !e.enLinea;
}

// Siempre con una salida: «Reintentar» y, si la hay, otra vía (p. ej. «Enviar por correo»)
export function RequiereInternet({ texto, salida }: { texto: string; salida?: ReactNode }) {
  const [probando, setProbando] = useState(false);
  return (
    <div role="status" className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md bg-aviso/10 px-3 py-2 text-sm text-aviso-texto">
      <p className="flex min-w-0 flex-1 basis-64 items-start gap-2">
        <CloudOff className="mt-0.5 size-4 shrink-0" aria-hidden /> <span><strong className="font-medium">Requiere internet.</strong> {texto}</span>
      </p>
      <div className="flex flex-wrap gap-2">
        {salida}
        <Button type="button" size="sm" variant="outline" disabled={probando}
          onClick={async () => { setProbando(true); await refrescarEstado(); setProbando(false); }}>
          {probando ? <Loader2 className="animate-spin" /> : <RefreshCw />} Reintentar
        </Button>
      </div>
    </div>
  );
}
