"use client";

import Link from "next/link";
import { ArrowLeft, FileDown } from "lucide-react";
import { Button } from "@/components/ui/button";

// Barra del paciente: el navegador arma el PDF («Guardar como PDF» en el celular o la computadora)
export function BarraPaciente({ volver, titulo }: { volver: string; titulo: string }) {
  return (
    <div className="sticky top-0 z-10 mb-4 border-b bg-background/95 px-4 py-3 backdrop-blur print:hidden">
      <div className="mx-auto flex max-w-[216mm] flex-wrap items-center gap-2">
        <Button variant="ghost" size="sm" asChild><Link href={volver}><ArrowLeft /> Volver</Link></Button>
        <span className="min-w-0 flex-1 truncate font-medium">{titulo}</span>
        <Button size="lg" onClick={() => window.print()}><FileDown /> Descargar PDF</Button>
      </div>
      <p className="mx-auto mt-1 max-w-[216mm] text-xs text-muted-foreground">En la ventana que se abre, elige «Guardar como PDF» y luego «Guardar» o «Descargar».</p>
    </div>
  );
}
