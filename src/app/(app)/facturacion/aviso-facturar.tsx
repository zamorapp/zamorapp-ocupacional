"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { FilePlus2, Receipt } from "lucide-react";
import { Button } from "@/components/ui/button";

// Al ver los pacientes atendidos de una empresa con atenciones sin cobrar, se ofrece facturar ese período.
// «Ignorar» lo esconde solo para esa empresa y ese período, en este equipo (nunca bloquea).
export function AvisoFacturar({ empresa, empresaId, desde, hasta, pendientes, otros = 0, etiqueta }: { empresa: string; empresaId: string; desde: string; hasta: string; pendientes: number; otros?: number; etiqueta: string }) {
  const clave = `zamorapp.facturar.ignorado.${empresaId}.${desde}.${hasta}`;
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    let ignorado = false;
    try { ignorado = localStorage.getItem(clave) === "1"; } catch {}
    setVisible(!ignorado);
  }, [clave]);
  if (!visible) return null;
  const params = new URLSearchParams({ empresa: empresaId, desde, hasta, factura: "1" });
  const ignorar = () => { setVisible(false); try { localStorage.setItem(clave, "1"); } catch {} };
  return (
    <div role="status" data-aviso="facturar" className="flex flex-wrap items-center gap-3 rounded-xl border border-primary/30 bg-primary/5 px-4 py-3">
      <Receipt className="size-5 shrink-0 text-primary" aria-hidden />
      <div className="min-w-0 flex-1">
        <div className="font-medium">¿Quieres facturar este período?</div>
        <div className="text-sm text-muted-foreground">
          {empresa} · {etiqueta}: {[
            pendientes > 0 && `${pendientes} ${pendientes === 1 ? "paciente atendido" : "pacientes atendidos"}`,
            otros > 0 && `${otros} ${otros === 1 ? "servicio más (vigilancia o evaluación de puesto)" : "servicios más (vigilancia, evaluaciones de puestos)"}`,
          ].filter(Boolean).join(" y ")} sin facturar.
        </div>
      </div>
      <div className="flex gap-2 max-sm:w-full">
        <Button variant="ghost" onClick={ignorar} className="max-sm:flex-1">Ignorar</Button>
        <Button asChild className="max-sm:flex-1"><Link href={`/facturacion/nuevo?${params}`}><FilePlus2 /> Sí, facturar</Link></Button>
      </div>
    </div>
  );
}
