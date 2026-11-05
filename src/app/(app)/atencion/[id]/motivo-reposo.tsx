"use client";

// Motivo clínico del reposo (Cesar, 05-nov): «se indica reposo por presentar…». Vacío = la hoja imprime la propuesta
// armada con el motivo de consulta y los hallazgos positivos del examen físico, y aquí se ve completa antes de imprimir.
import { useState } from "react";
import { Pencil, RotateCcw, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { DatosConsulta } from "@/lib/consultas-tipos";
import { MAXIMO_MOTIVO_REPOSO, proponerMotivoReposo } from "@/lib/reposo-motivo";

export function MotivoReposo({ d, onCambio }: { d: DatosConsulta; onCambio: (texto: string) => void }) {
  const propio = d.reposo.motivoClinico ?? "";
  const propuesta = proponerMotivoReposo(d);
  const escrito = propio.trim().length > 0;
  // «Usar el automático» borra lo escrito: queda «Deshacer» hasta que el médico vuelva a escribir
  const [anterior, setAnterior] = useState("");
  return (
    <div className="col-span-2 sm:col-span-4" data-prueba="motivo-reposo">
      <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
        <label htmlFor="reposo-motivo" className="text-sm font-medium">
          Motivo clínico <span className="text-xs font-normal text-muted-foreground">· sale en la copia del servicio médico, no en la de RR. HH.</span>
        </label>
        {escrito ? (
          <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => { setAnterior(propio); onCambio(""); }}
            title="Borra tu texto y vuelve al que se arma solo con el motivo y el examen">
            <RotateCcw className="size-3.5" /> Usar el automático
          </Button>
        ) : (
          <div className="flex gap-1.5">
            {anterior && (
              <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => { onCambio(anterior); setAnterior(""); }}>
                <Undo2 className="size-3.5" /> Deshacer
              </Button>
            )}
            {propuesta && (
              <Button type="button" size="sm" variant="outline" className="h-7 px-2.5 text-xs" onClick={() => { setAnterior(""); onCambio(propuesta); }}>
                <Pencil className="size-3.5" /> Editar
              </Button>
            )}
          </div>
        )}
      </div>
      {escrito ? (
        <>
          <Textarea id="reposo-motivo" rows={3} maxLength={MAXIMO_MOTIVO_REPOSO} value={propio} onChange={(e) => onCambio(e.target.value)} />
          <p className="mt-1 text-right text-xs tabular-nums text-muted-foreground">{propio.length}/{MAXIMO_MOTIVO_REPOSO}</p>
        </>
      ) : propuesta ? (
        <button type="button" id="reposo-motivo" onClick={() => onCambio(propuesta)}
          className="w-full rounded-md border border-dashed bg-muted/40 px-3 py-2 text-left text-sm hover:bg-muted"
          title="Toca para editarlo">
          <span className="mb-0.5 block text-xs text-muted-foreground">Automático, del motivo de consulta y los hallazgos del examen:</span>
          {propuesta}
        </button>
      ) : (
        <Textarea id="reposo-motivo" rows={2} maxLength={MAXIMO_MOTIVO_REPOSO} value=""
          placeholder="Ej.: Se indica reposo médico por presentar dolor lumbar con limitación funcional para la flexión del tronco."
          onChange={(e) => onCambio(e.target.value)} />
      )}
    </div>
  );
}
