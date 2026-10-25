"use client";

import { useState, useTransition } from "react";
import { ClipboardPlus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { iniciarConsulta } from "../../atencion/acciones";

export function BotonConsulta({ trabajadorId, habilitado }: { trabajadorId: string; habilitado: boolean }) {
  const [abriendo, iniciar] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex flex-1 flex-col xl:flex-none">
      <Button
        disabled={!habilitado || abriendo}
        onClick={() => iniciar(async () => { const r = await iniciarConsulta(trabajadorId); if (r && !r.ok) setError(r.mensaje); })}
      >
        {abriendo ? <Loader2 className="animate-spin" /> : <ClipboardPlus />} Nueva consulta
      </Button>
      {error && <span className="mt-1 text-xs text-destructive">{error}</span>}
    </div>
  );
}
