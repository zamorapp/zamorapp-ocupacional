"use client";

import { useState, useTransition } from "react";
import { Loader2, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { leerTasaEscrita } from "@/lib/tasa-bcv";
import { guardarTasa } from "./acciones";

type Tasa = { fecha: string; tasa: number; fuente: "manual" | "bcv" | "respaldo" };

const cifra = (n: number) => n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 4 });
const dia = (iso: string) => iso.split("-").reverse().join("/");
const ORIGEN: Record<Tasa["fuente"], string> = { bcv: "automática del BCV", respaldo: "automática (copia de la oficial)", manual: "escrita a mano" };

// Tasa BCV: se carga sola cada día (el BCV publica la de mañana a las 4–5 p. m.). Si no llegó, se escribe a mano.
export function TasaBcv({ actual, proxima, hoy, editable }: { actual: Tasa | null; proxima: Tasa | null; hoy: string; editable: boolean }) {
  const deHoy = actual?.fecha === hoy;
  const [abierto, setAbierto] = useState(false);
  const [fecha, setFecha] = useState(hoy);
  const [tasa, setTasa] = useState(deHoy ? String(actual!.tasa) : "");
  const [msg, setMsg] = useState<string | null>(null);
  const [ocupado, iniciar] = useTransition();
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg border bg-card px-3 py-2 text-sm">
      <span className="font-medium">Tasa BCV</span>
      {actual ? (
        <span className="tabular-nums" title={`Fecha valor ${dia(actual.fecha)} · ${ORIGEN[actual.fuente]}`}>
          <b>{cifra(actual.tasa)}</b> Bs/$ <span className={deHoy ? "text-muted-foreground" : "text-aviso-texto"}>· {deHoy ? "hoy" : `del ${dia(actual.fecha)}`}</span>
        </span>
      ) : (
        <span className="text-aviso-texto">sin cargar</span>
      )}
      {proxima && <span className="tabular-nums text-muted-foreground">Desde el {dia(proxima.fecha)}: {cifra(proxima.tasa)}</span>}
      {editable && !abierto && (
        <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => setAbierto(true)}><Pencil /> Escribir a mano</Button>
      )}
      {editable && abierto && (
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            iniciar(async () => { const r = await guardarTasa(fecha, leerTasaEscrita(tasa)); setMsg(r.mensaje); if (r.ok) setAbierto(false); });
          }}
        >
          <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value || hoy)} className="h-8 w-36" aria-label="Fecha valor" />
          <Input value={tasa} onChange={(e) => setTasa(e.target.value)} placeholder="Ej. 896,1225" inputMode="decimal" className="h-8 w-28" aria-label="Tasa en bolívares por dólar" />
          <Button size="sm" variant="outline" disabled={ocupado || !tasa}>{ocupado && <Loader2 className="animate-spin" />} Guardar</Button>
          <Button size="sm" variant="ghost" type="button" onClick={() => setAbierto(false)}>Cancelar</Button>
        </form>
      )}
      {msg && <span className="text-xs text-muted-foreground">{msg}</span>}
      {!deHoy && !abierto && <span className="w-full text-xs text-muted-foreground">Se carga sola cada tarde. Si hoy no llegó, escríbela a mano.</span>}
    </div>
  );
}
