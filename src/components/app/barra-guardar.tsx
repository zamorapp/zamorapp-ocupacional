"use client";

import { CircleDot, Loader2 } from "lucide-react";
import { Aviso } from "@/components/app/campo";
import { Button } from "@/components/ui/button";

// Barra fija de «Guardar cambios» para formularios largos por pasos. En el celular queda encima de la
// barra inferior de la app (4.5rem + zona segura); desde lg, pegada abajo. La página que la usa deja
// espacio al final (pb-24 lg:pb-6) para que el último campo no quede tapado.
export function BarraGuardar({ sinGuardar, enviando, resultado, editable, texto = "Guardar cambios", sinPermiso = "Solo el administrador puede cambiar estos datos." }: {
  sinGuardar: boolean;
  enviando: boolean;
  resultado: { ok: boolean; mensaje: string } | null;
  editable: boolean;
  texto?: string;
  sinPermiso?: string;
}) {
  return (
    <div className="sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-10 -mx-1 flex flex-wrap items-center gap-3 rounded-xl border bg-background/95 px-4 py-3 shadow-sm backdrop-blur lg:bottom-0">
      {sinGuardar && !enviando ? (
        <p className="flex items-center gap-2 text-sm text-aviso-texto"><CircleDot className="size-4" /> Hay cambios sin guardar</p>
      ) : (
        <Aviso resultado={resultado} />
      )}
      {editable ? (
        <Button type="submit" className="ml-auto" disabled={enviando}>{enviando && <Loader2 className="animate-spin" />} {texto}</Button>
      ) : (
        <p className="ml-auto text-sm text-muted-foreground">{sinPermiso}</p>
      )}
    </div>
  );
}
