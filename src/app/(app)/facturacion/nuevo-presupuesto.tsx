"use client";

import { useState, useTransition } from "react";
import { FilePlus2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { crearPresupuesto } from "./acciones";

export function NuevoPresupuesto({ empresaId }: { empresaId: string | null }) {
  const [ocupado, iniciar] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex items-center gap-2">
      {error && <span className="text-sm text-destructive">{error}</span>}
      <Button disabled={!empresaId || ocupado} onClick={() => iniciar(async () => { const r = await crearPresupuesto(empresaId ?? ""); if (r && !r.ok) setError(r.mensaje); })}>
        {ocupado ? <Loader2 className="animate-spin" /> : <FilePlus2 />} Nuevo presupuesto
      </Button>
    </div>
  );
}
