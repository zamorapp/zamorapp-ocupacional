"use client";

import { useState, useTransition } from "react";
import { ClipboardPlus, Loader2, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { iniciarConsulta } from "../../atencion/acciones";
import { iniciarADistancia } from "../../atencion/telemedicina-acciones";

// «Nueva consulta» y, para el médico, «A distancia» (llamada, videollamada, WhatsApp o nota de voz)
export function BotonConsulta({ trabajadorId, habilitado, distancia = false }: { trabajadorId: string; habilitado: boolean; distancia?: boolean }) {
  const [abriendo, iniciar] = useTransition();
  const [cual, setCual] = useState<"normal" | "distancia" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abrir = (tipo: "normal" | "distancia") => {
    setCual(tipo);
    setError(null);
    iniciar(async () => {
      const r = tipo === "distancia" ? await iniciarADistancia(trabajadorId) : await iniciarConsulta(trabajadorId);
      if (r && !r.ok) setError(r.mensaje);
    });
  };
  return (
    <div className="flex flex-1 flex-col xl:flex-none">
      <div className="flex gap-2">
        <Button className="flex-1 xl:flex-none" disabled={!habilitado || abriendo} onClick={() => abrir("normal")}>
          {abriendo && cual === "normal" ? <Loader2 className="animate-spin" /> : <ClipboardPlus />} Nueva consulta
        </Button>
        {distancia && (
          <Button variant="outline" disabled={!habilitado || abriendo} onClick={() => abrir("distancia")} title="Consulta por llamada, videollamada, WhatsApp o nota de voz">
            {abriendo && cual === "distancia" ? <Loader2 className="animate-spin" /> : <Phone />} A distancia
          </Button>
        )}
      </div>
      {error && <span className="mt-1 text-xs text-destructive">{error}</span>}
    </div>
  );
}
