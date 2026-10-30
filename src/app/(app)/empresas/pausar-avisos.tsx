"use client";

import { useState, useTransition } from "react";
import { Bell, BellOff, Loader2 } from "lucide-react";
import { AVISOS_EMPRESA, type AvisoEmpresa } from "@/lib/empresas-avisos";
import { pausarAvisos } from "./acciones";

// Estado de los avisos de la empresa y botón de un toque para pausarlos todos o reactivarlos
export function PausarAvisos({ empresaId, apagados, editable }: { empresaId: string; apagados: AvisoEmpresa[]; editable: boolean }) {
  const [ocupado, iniciar] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const todos = apagados.length === AVISOS_EMPRESA.length;
  const cambiar = (pausar: boolean) => iniciar(async () => {
    setError(null);
    const r = await pausarAvisos(empresaId, pausar);
    if (!r.ok) setError(r.mensaje);
  });
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
      {apagados.length > 0 && (
        <span className={`inline-flex items-center gap-1 ${todos ? "text-aviso-texto" : "text-muted-foreground"}`} title={AVISOS_EMPRESA.filter((x) => apagados.includes(x.clave)).map((x) => x.nombre).join(" · ")}>
          <BellOff className="size-3" aria-hidden /> {todos ? "Avisos en pausa" : `${apagados.length} ${apagados.length === 1 ? "aviso apagado" : "avisos apagados"}`}
        </span>
      )}
      {editable && (
        <button type="button" disabled={ocupado} onClick={() => cambiar(!todos)} className="inline-flex items-center gap-1 font-medium text-primary hover:underline disabled:opacity-60">
          {ocupado ? <Loader2 className="size-3 animate-spin" /> : todos ? <Bell className="size-3" /> : <BellOff className="size-3" />}
          {todos ? "Reactivar avisos" : "Pausar avisos"}
        </button>
      )}
      {error && <span role="status" className="text-alerta-texto">{error}</span>}
    </div>
  );
}
