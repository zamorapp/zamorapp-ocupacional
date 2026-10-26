"use client";

import { useState, useTransition } from "react";
import { Check, Inbox, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { Cita } from "@/lib/citas";
import { cambiarEstadoCita, confirmarSolicitud } from "./citas-acciones";

function Solicitud({ c }: { c: Cita }) {
  const [fecha, setFecha] = useState(c.fecha);
  const [hora, setHora] = useState(c.hora ?? "");
  const [ocupado, iniciar] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const cambiada = fecha !== c.fecha || hora !== (c.hora ?? "");
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 px-5 py-3 text-sm">
      <div className="min-w-48 flex-1">
        <div className="font-medium">{c.paciente} <span className="font-normal text-muted-foreground">· {c.empresa}</span></div>
        <div className="text-xs text-muted-foreground">{[c.motivo ?? "Sin motivo", c.cedula, c.observacion].filter(Boolean).join(" · ")}</div>
      </div>
      <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className="h-8 w-36" />
      <Input type="time" value={hora} onChange={(e) => setHora(e.target.value)} className="h-8 w-28" />
      <Button size="sm" disabled={ocupado} onClick={() => iniciar(async () => { const r = await confirmarSolicitud(c.id, fecha, hora || null); setError(r.ok ? null : r.mensaje); })}>
        {ocupado ? <Loader2 className="animate-spin" /> : <Check />} {cambiada ? "Reprogramar" : "Confirmar"}
      </Button>
      <Button size="sm" variant="ghost" disabled={ocupado} onClick={() => confirm("¿Rechazar la solicitud?") && iniciar(async () => { const r = await cambiarEstadoCita(c.id, "cancelada"); setError(r.ok ? null : r.mensaje); })}>
        <X /> Rechazar
      </Button>
      {error && <span className="w-full text-xs text-destructive">{error}</span>}
    </li>
  );
}

export function Solicitudes({ solicitudes }: { solicitudes: Cita[] }) {
  if (!solicitudes.length) return null;
  return (
    <Card className="gap-0 border-aviso/50 py-0">
      <CardHeader className="flex flex-row items-center gap-2 border-b bg-aviso/10 py-3">
        <Inbox className="size-5 text-aviso-texto" />
        <CardTitle className="text-base">Solicitudes de empresas por confirmar ({solicitudes.length})</CardTitle>
      </CardHeader>
      <CardContent className="px-0">
        <ul className="divide-y">{solicitudes.map((c) => <Solicitud key={c.id} c={c} />)}</ul>
      </CardContent>
    </Card>
  );
}
