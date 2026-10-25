"use client";

import { useTransition } from "react";
import { AlertTriangle, Eye, Loader2 } from "lucide-react";
import { ignorarAlertaLegal } from "./acciones";

// Aviso de datos legales faltantes con opción de ignorarlo (no bloquea el trabajo con la empresa)
export function AlertaLegal({ empresaId, faltan, ignorada, editable }: { empresaId: string; faltan: string[]; ignorada: boolean; editable: boolean }) {
  const [ocupado, iniciar] = useTransition();
  if (!faltan.length) return null;

  if (ignorada) {
    return (
      <button
        type="button"
        disabled={!editable || ocupado}
        onClick={() => iniciar(async () => void (await ignorarAlertaLegal(empresaId, false)))}
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        title={`Falta: ${faltan.join(", ")}`}
      >
        {ocupado ? <Loader2 className="size-3 animate-spin" /> : <Eye className="size-3" />} Aviso de datos legales oculto · mostrar
      </button>
    );
  }

  return (
    <div className="flex items-start gap-2 rounded-md bg-aviso/15 px-3 py-2 text-xs">
      <AlertTriangle className="size-4 shrink-0 text-amber-600" />
      <span className="flex-1">Falta para el informe trimestral: {faltan.join(", ")}.</span>
      {editable && (
        <button
          type="button"
          disabled={ocupado}
          onClick={() => iniciar(async () => void (await ignorarAlertaLegal(empresaId, true)))}
          className="shrink-0 font-medium text-amber-700 hover:underline"
        >
          {ocupado ? <Loader2 className="size-3 animate-spin" /> : "Ignorar"}
        </button>
      )}
    </div>
  );
}
