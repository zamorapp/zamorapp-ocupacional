"use client";

import { useEffect, useState, useTransition } from "react";
import { BellOff, BellRing, Loader2 } from "lucide-react";
import { AVISOS_EMPRESA, type AvisoEmpresa } from "@/lib/empresas-avisos";
import { pausarAvisos } from "./acciones";

// Interruptor de los avisos de la empresa (Cesar, 31-oct: «no sé cuál es el status»): el estado se ve a simple vista,
// verde con campana «Avisos activos» o ámbar con campana tachada «Avisos en pausa», y un toque lo cambia.
export function PausarAvisos({ empresaId, apagados, editable }: { empresaId: string; apagados: AvisoEmpresa[]; editable: boolean }) {
  const [ocupado, iniciar] = useTransition();
  const [error, setError] = useState<{ mensaje: string; pausar: boolean } | null>(null);
  const [lento, setLento] = useState(false);
  const delServidor = apagados.length === AVISOS_EMPRESA.length;
  // Cesar, 06-nov (escritorio, internet lento): tocaba y no pasaba nada. El interruptor cambia AL INSTANTE y queda
  // así lo que diga el servidor después; solo vuelve atrás si la nube rechaza el cambio (con «Reintentar»).
  const [deseado, setDeseado] = useState<boolean | null>(null);
  const pausados = deseado ?? delServidor;
  useEffect(() => { if (!ocupado && deseado === delServidor) setDeseado(null); }, [ocupado, deseado, delServidor]);
  useEffect(() => {
    if (!ocupado) { setLento(false); return; }
    const t = setTimeout(() => setLento(true), 6000);
    return () => clearTimeout(t);
  }, [ocupado]);
  const nombres = AVISOS_EMPRESA.filter((x) => apagados.includes(x.clave)).map((x) => x.nombre).join(" · ");
  const guardar = (pausar: boolean) => iniciar(async () => {
    setError(null);
    setDeseado(pausar);
    let r: { ok: boolean; mensaje: string };
    try { r = await pausarAvisos(empresaId, pausar); }
    catch { r = { ok: false, mensaje: "Sin conexión: no se guardó." }; }
    if (!r.ok) { setDeseado(null); setError({ mensaje: r.mensaje, pausar }); }
  });
  const cambiar = () => guardar(!pausados);
  const Icono = ocupado ? Loader2 : pausados ? BellOff : BellRing;
  const etiqueta = (
    <>
      <Icono className={`size-3.5 ${ocupado ? "animate-spin" : ""}`} aria-hidden />
      {pausados ? "Avisos en pausa" : "Avisos activos"}
      {!pausados && deseado === null && apagados.length > 0 && <span className="font-normal text-muted-foreground">· {apagados.length} {apagados.length === 1 ? "apagado" : "apagados"}</span>}
    </>
  );
  const tono = pausados ? "border-aviso/40 bg-aviso/15 text-aviso-texto" : "border-ok/30 bg-ok/10 text-ok-texto";
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
      {editable ? (
        <button type="button" role="switch" aria-checked={!pausados} disabled={ocupado} onClick={cambiar} title={nombres ? `Apagados: ${nombres}` : undefined}
          className={`inline-flex items-center gap-2 rounded-full border py-0.5 pl-0.5 pr-2.5 font-medium transition disabled:opacity-60 ${tono}`}>
          {/* El interruptor: a la derecha y verde = activos; a la izquierda y ámbar = en pausa */}
          <span aria-hidden className={`relative h-4 w-7 rounded-full transition-colors ${pausados ? "bg-aviso/60" : "bg-ok"}`}>
            <span className={`absolute top-0.5 size-3 rounded-full bg-white shadow transition-all ${pausados ? "left-0.5" : "left-3.5"}`} />
          </span>
          <span className="inline-flex items-center gap-1">{etiqueta}</span>
        </button>
      ) : (
        <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 font-medium ${tono}`} title={nombres ? `Apagados: ${nombres}` : undefined}>{etiqueta}</span>
      )}
      {editable && (
        <span className="text-muted-foreground" aria-live="polite">
          {ocupado ? (lento ? "Guardando… la conexión está lenta, no cierres" : "Guardando…") : pausados ? "Toca para reactivarlos" : "Toca para pausarlos"}
        </span>
      )}
      {error && (
        <span role="alert" className="inline-flex items-center gap-2 text-alerta-texto">
          {error.mensaje}
          <button type="button" onClick={() => guardar(error.pausar)} className="rounded-full border border-current px-2 py-0.5 font-medium">Reintentar</button>
          <button type="button" onClick={() => setError(null)} className="underline underline-offset-2">Ignorar</button>
        </span>
      )}
    </div>
  );
}
