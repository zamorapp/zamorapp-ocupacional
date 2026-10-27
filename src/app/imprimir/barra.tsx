"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ANEXOS_LISTOS } from "./anexos";

// esperarAnexos: «Imprimir» se habilita cuando los exámenes escaneados terminan de dibujarse (si no, saldrían en blanco)
export function BarraImpresion({ volver, titulo, bloqueado, esperarAnexos }: { volver: string; titulo: string; bloqueado?: boolean; esperarAnexos?: boolean }) {
  const [preparando, setPreparando] = useState(Boolean(esperarAnexos));
  useEffect(() => {
    if (!esperarAnexos) return;
    const listo = () => setPreparando(false);
    window.addEventListener(ANEXOS_LISTOS, listo);
    return () => window.removeEventListener(ANEXOS_LISTOS, listo);
  }, [esperarAnexos]);
  return (
    <div className="sticky top-0 z-10 mb-6 flex items-center gap-3 border-b bg-background/90 px-4 py-3 backdrop-blur print:hidden">
      <Button variant="ghost" asChild><Link href={volver}><ArrowLeft /> Volver</Link></Button>
      <span className="min-w-0 truncate font-medium">{titulo}</span>
      <span className="ml-auto hidden text-xs text-muted-foreground lg:inline">Consejo: en el diálogo, desmarca «Encabezados y pies de página».</span>
      <Button className="ml-auto lg:ml-0" disabled={bloqueado || preparando} onClick={() => window.print()}>
        {preparando ? <Loader2 className="animate-spin" /> : <Printer />} {preparando ? "Preparando anexos…" : "Imprimir o guardar PDF"}
      </Button>
    </div>
  );
}
