"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { guardarTasa } from "./acciones";

export function TasaBcv({ actual, hoy, editable }: { actual: { fecha: string; tasa: number } | null; hoy: string; editable: boolean }) {
  const [tasa, setTasa] = useState(actual?.fecha === hoy ? String(actual.tasa) : "");
  const [msg, setMsg] = useState<string | null>(null);
  const [ocupado, iniciar] = useTransition();
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-card px-3 py-2 text-sm">
      <span className="font-medium">Tasa BCV</span>
      {actual ? (
        <span className="text-muted-foreground">
          {actual.tasa.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 4 })} Bs/$ · {actual.fecha.split("-").reverse().join("/")}
          {actual.fecha !== hoy && <span className="ml-1 text-amber-700">(no es de hoy)</span>}
        </span>
      ) : (
        <span className="text-amber-700">sin cargar</span>
      )}
      {editable && (
        <form
          className="ml-auto flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            iniciar(async () => { const r = await guardarTasa(hoy, Number(tasa.replace(",", "."))); setMsg(r.ok ? "Guardada" : r.mensaje); });
          }}
        >
          <Input value={tasa} onChange={(e) => setTasa(e.target.value)} placeholder="Tasa de hoy" inputMode="decimal" className="h-8 w-28" />
          <Button size="sm" variant="outline" disabled={ocupado || !tasa}>{ocupado && <Loader2 className="animate-spin" />} Guardar</Button>
          {msg && <span className="text-xs text-muted-foreground">{msg}</span>}
        </form>
      )}
    </div>
  );
}
