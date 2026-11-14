"use client";

import { useState } from "react";
import Link from "next/link";
import { Bot } from "lucide-react";
import { Button } from "@/components/ui/button";

// Aviso: el agente dejó propuestas para esta empresa. «Ignorar» lo esconde hasta la próxima vez que abras Reportes.
export function AvisoPropuestas({ n }: { n: number }) {
  const [oculto, setOculto] = useState(false);
  if (oculto || n <= 0) return null;
  return (
    <div role="status" className="flex flex-wrap items-center gap-3 rounded-lg border border-aviso/40 bg-aviso/10 px-4 py-3 text-sm">
      <Bot className="size-5 shrink-0 text-aviso-texto" aria-hidden />
      <span className="min-w-0 flex-1 basis-56">
        <span className="font-medium">Tu agente dejó {n === 1 ? "1 propuesta" : `${n} propuestas`} para esta empresa.</span>{" "}
        Nada cambia hasta que la apruebes.
      </span>
      <span className="flex gap-2">
        <Button asChild size="sm" className="h-11 sm:h-8"><Link href="/reportes/propuestas">Revisar</Link></Button>
        <Button size="sm" variant="ghost" className="h-11 sm:h-8" onClick={() => setOculto(true)}>Ignorar</Button>
      </span>
    </div>
  );
}
