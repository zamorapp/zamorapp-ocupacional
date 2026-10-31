"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Archive, Loader2, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { ajustarAlertaVencimientos, cambiarEstadoEmpresa } from "../empresas/acciones";
import type { AjusteEmpresa } from "@/lib/panel";

// Engranaje de la alerta de vencimientos: ajustar ESA empresa sin salir del Inicio.
// Mostrar/ocultar en Inicio, días de aviso, periodicidad e inactivar (con confirmación). Nada se borra.
export function AjustarAlerta({ empresa }: { empresa: AjusteEmpresa }) {
  const [abierto, setAbierto] = useState(false);
  const [mostrar, setMostrar] = useState(true);
  const [dias, setDias] = useState(String(empresa.diasAviso));
  const [meses, setMeses] = useState(String(empresa.periodicidad));
  const [confirmar, setConfirmar] = useState(false);
  const [mensaje, setMensaje] = useState<{ ok: boolean; texto: string } | null>(null);
  const [ocupado, iniciar] = useTransition();

  const guardar = () => iniciar(async () => {
    setMensaje(null);
    const r = await ajustarAlertaVencimientos(empresa.id, { mostrar, diasAviso: Number(dias), periodicidad: Number(meses) });
    setMensaje({ ok: r.ok, texto: r.mensaje });
    if (r.ok) setAbierto(false);
  });
  const inactivar = () => iniciar(async () => {
    setMensaje(null);
    const r = await cambiarEstadoEmpresa(empresa.id, false);
    setMensaje({ ok: r.ok, texto: r.mensaje });
    if (r.ok) setAbierto(false);
  });

  return (
    <Popover open={abierto} onOpenChange={(v) => { setAbierto(v); if (!v) setConfirmar(false); }}>
      <PopoverAnchor asChild>
        <button type="button" aria-expanded={abierto} onClick={() => setAbierto((v) => !v)} aria-label={`Ajustar la alerta de ${empresa.nombre}`} title="Ajustar esta alerta"
          className="grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground transition hover:bg-muted hover:text-foreground">
          <Settings2 className="size-4" />
        </button>
      </PopoverAnchor>
      <PopoverContent align="end" className="w-80 space-y-4">
        <div>
          <p className="text-sm font-medium leading-tight">{empresa.nombre}</p>
          <p className="text-xs text-muted-foreground">Alerta de exámenes periódicos en el Inicio</p>
        </div>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" checked={mostrar} onChange={(e) => setMostrar(e.target.checked)} className="mt-0.5 size-4 accent-[var(--primary)]" />
          <span>Mostrar en el Inicio<span className="block text-xs text-muted-foreground">Apagada, la empresa sigue en el reporte de vencimientos.</span></span>
        </label>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor={`dias-${empresa.id}`} className="mb-1.5 text-xs">Avisar con (días)</Label>
            <Input id={`dias-${empresa.id}`} type="number" inputMode="numeric" min={0} max={180} value={dias} onChange={(e) => setDias(e.target.value)} className="h-9" />
          </div>
          <div>
            <Label htmlFor={`meses-${empresa.id}`} className="mb-1.5 text-xs">Periódico cada (meses)</Label>
            <Input id={`meses-${empresa.id}`} type="number" inputMode="numeric" min={1} max={60} value={meses} onChange={(e) => setMeses(e.target.value)} className="h-9" />
          </div>
        </div>
        <Button size="sm" className="w-full" disabled={ocupado} onClick={guardar}>
          {ocupado && <Loader2 className="animate-spin" />} Guardar
        </Button>
        {mensaje && !mensaje.ok && <p role="status" className="text-xs text-alerta-texto">{mensaje.texto}</p>}
        <div className="space-y-2 border-t pt-3">
          {!confirmar ? (
            <button type="button" onClick={() => setConfirmar(true)} className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground">
              <Archive className="size-3.5" /> Ya no la atiendo: inactivar empresa
            </button>
          ) : (
            <div className="space-y-2 rounded-md bg-muted/60 p-2.5 text-xs">
              <p>Sale del Inicio, los avisos y los listados. Sus trabajadores, consultas y documentos quedan guardados. Se reactiva en Empresas › Ver inactivas.</p>
              <div className="flex gap-2">
                <Button size="sm" variant="destructive" disabled={ocupado} onClick={inactivar}>Sí, inactivar</Button>
                <Button size="sm" variant="ghost" onClick={() => setConfirmar(false)}>Ignorar</Button>
              </div>
            </div>
          )}
          <Link href="/empresas" className="block text-xs text-primary hover:underline">Más ajustes de la empresa</Link>
        </div>
      </PopoverContent>
    </Popover>
  );
}
