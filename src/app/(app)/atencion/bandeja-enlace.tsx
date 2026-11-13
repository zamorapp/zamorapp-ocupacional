"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Loader2, RefreshCw, UserPlus, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";

// Mientras llega la bandeja: la misma cabecera de «Pacientes por enlace» (mismo alto), para que la pantalla no salte.
// Si no hay nada que mostrar, PorRevisar no pinta nada y la cabecera desaparece.
export function BandejaCargando() {
  return (
    <Card className="gap-0 py-0" aria-busy="true">
      <CardHeader className="flex flex-row flex-wrap items-center gap-2 py-3">
        <UserPlus className="size-5 text-primary" />
        <CardTitle className="text-base">Pacientes por enlace</CardTitle>
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground"><Loader2 className="size-3.5 animate-spin" /> Buscando…</span>
      </CardHeader>
    </Card>
  );
}

// La nube no respondió (sin internet o tardó más de 4 s): se dice y se puede volver a pedir sin recargar todo a mano
export function BandejaSinLeer() {
  const router = useRouter();
  const [leyendo, iniciar] = useTransition();
  return (
    <Card className="gap-0 py-0" role="status">
      <CardHeader className="flex flex-row flex-wrap items-center gap-2 py-3">
        <UserPlus className="size-5 text-primary" />
        <CardTitle className="text-base">Pacientes por enlace</CardTitle>
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground"><WifiOff className="size-3.5" /> No se pudo leer la bandeja (sin internet)</span>
        <Button variant="outline" size="sm" className="ml-auto" disabled={leyendo} onClick={() => iniciar(() => router.refresh())}>
          {leyendo ? <Loader2 className="animate-spin" /> : <RefreshCw />} Reintentar
        </Button>
      </CardHeader>
    </Card>
  );
}
