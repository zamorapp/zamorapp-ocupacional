"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, FileDown } from "lucide-react";
import { Button } from "@/components/ui/button";

// Barra del paciente: el navegador arma el PDF. En el iPhone no hay «Guardar como PDF»: se comparte y se guarda en Archivos.
export function BarraPaciente({ volver, titulo }: { volver: string; titulo: string }) {
  const [ios, setIos] = useState(false);
  useEffect(() => setIos(/iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)), []);
  return (
    <div className="sticky top-0 z-10 mb-4 border-b bg-background/95 px-4 py-2 backdrop-blur print:hidden">
      <div className="mx-auto flex max-w-[216mm] items-center gap-2">
        <Button variant="ghost" size="sm" asChild><Link href={volver}><ArrowLeft /> Volver</Link></Button>
        <span className="hidden min-w-0 flex-1 truncate font-medium sm:inline">{titulo}</span>
        <Button size="lg" className="ml-auto" onClick={() => window.print()}><FileDown /> Descargar PDF</Button>
      </div>
      <p className="mx-auto mt-1 max-w-[216mm] truncate text-xs text-muted-foreground">
        {ios ? "Toca Compartir (□↑) y elige «Guardar en Archivos»." : "Elige «Guardar como PDF» y luego «Descargar»."}
      </p>
    </div>
  );
}
