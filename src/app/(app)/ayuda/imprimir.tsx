"use client";

import { useState } from "react";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { imprimirPagina } from "@/lib/escritorio";

export function BotonImprimir() {
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="inline-flex flex-wrap items-center gap-2 print:hidden">
      <Button variant="outline" onClick={() => { setError(null); imprimirPagina().catch((e: Error) => setError(e.message)); }}>
        <Printer /> Imprimir o guardar PDF
      </Button>
      {error && <span role="alert" className="text-sm text-alerta-texto">{error}</span>}
    </span>
  );
}
