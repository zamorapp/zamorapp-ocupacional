"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { restaurarDePapelera } from "./acciones";

export function BotonRestaurar({ id }: { id: string }) {
  const [error, setError] = useState("");
  const [enCurso, iniciar] = useTransition();
  const router = useRouter();
  return (
    <div className="flex flex-col items-end gap-1">
      <Button size="sm" variant="outline" disabled={enCurso} onClick={() => iniciar(async () => {
        const r = await restaurarDePapelera(id);
        if (!r.ok) return setError(r.mensaje);
        setError("");
        router.refresh();
      })}>
        {enCurso ? <Loader2 className="animate-spin" /> : <Undo2 />} Restaurar
      </Button>
      {error && <p role="alert" className="max-w-xs text-right text-xs text-alerta-texto">{error}</p>}
    </div>
  );
}
