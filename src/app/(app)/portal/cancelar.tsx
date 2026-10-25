"use client";

import { useTransition } from "react";
import { Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cancelarSolicitud } from "./acciones";

export function CancelarSolicitud({ id }: { id: string }) {
  const [ocupado, iniciar] = useTransition();
  return (
    <Button size="sm" variant="ghost" disabled={ocupado} onClick={() => confirm("¿Cancelar esta solicitud?") && iniciar(async () => void (await cancelarSolicitud(id)))}>
      {ocupado ? <Loader2 className="animate-spin" /> : <X />} Cancelar
    </Button>
  );
}
