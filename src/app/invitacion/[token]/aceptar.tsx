"use client";

import { useState, useTransition } from "react";
import { Loader2, LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { aceptar } from "./acciones";

export function Aceptar({ token, texto }: { token: string; texto: string }) {
  const [error, setError] = useState<string | null>(null);
  const [aceptando, iniciar] = useTransition();
  return (
    <div className="space-y-3">
      <Button className="h-11 w-full text-base" disabled={aceptando} onClick={() => iniciar(async () => { const r = await aceptar(token); setError(r.mensaje); })}>
        {aceptando ? <Loader2 className="animate-spin" /> : <LogIn />} {texto}
      </Button>
      {error && <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
    </div>
  );
}
