"use client";

import Link from "next/link";
import { ArrowLeft, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

export function BarraImpresion({ volver, titulo, bloqueado }: { volver: string; titulo: string; bloqueado?: boolean }) {
  return (
    <div className="sticky top-0 z-10 mb-6 flex items-center gap-3 border-b bg-background/90 px-4 py-3 backdrop-blur print:hidden">
      <Button variant="ghost" asChild><Link href={volver}><ArrowLeft /> Volver</Link></Button>
      <span className="font-medium">{titulo}</span>
      <Button className="ml-auto" disabled={bloqueado} onClick={() => window.print()}>
        <Printer /> Imprimir o guardar PDF
      </Button>
    </div>
  );
}
