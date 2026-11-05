"use client";

import { Loader2, Undo2, X } from "lucide-react";
import { Button } from "@/components/ui/button";

// Aviso ámbar tras borrar algo en la misma pantalla: dice qué se borró, «Deshacer» y una X para cerrarlo.
export function FranjaDeshacerLocal({ texto, ocupado, onDeshacer, onCerrar }: { texto: React.ReactNode; ocupado?: boolean; onDeshacer: () => void; onCerrar: () => void }) {
  return (
    <div role="status" className="flex flex-wrap items-center gap-2 rounded-lg border border-aviso/40 bg-aviso/10 px-3 py-2 text-sm">
      <span className="min-w-0 flex-1 basis-48">{texto}</span>
      <Button type="button" size="sm" variant="outline" disabled={ocupado} onClick={onDeshacer}>
        {ocupado ? <Loader2 className="animate-spin" /> : <Undo2 />} Deshacer
      </Button>
      <Button type="button" size="icon" variant="ghost" className="size-8" onClick={onCerrar} aria-label="Cerrar"><X /></Button>
    </div>
  );
}
