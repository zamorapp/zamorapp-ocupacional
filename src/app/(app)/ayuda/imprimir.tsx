"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { imprimirPagina } from "@/lib/escritorio";

export function BotonImprimir() {
  return (
    <Button variant="outline" className="print:hidden" onClick={() => imprimirPagina().catch((e: Error) => alert(e.message))}>
      <Printer /> Imprimir o guardar PDF
    </Button>
  );
}
