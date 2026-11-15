"use client";

import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { CampoSelect } from "@/components/app/campo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { sumarDias } from "@/lib/fecha";


// Empresa y día que se ven en la lista (la enfermera de una sola empresa no ve el selector)
export function Filtros({ empresas, empresa, fecha, hoy }: { empresas: { id: string; nombre: string }[]; empresa: string; fecha: string; hoy: string }) {
  const router = useRouter();
  const ir = (cambios: { empresa?: string; fecha?: string }) => {
    const p = new URLSearchParams({ empresa, fecha, ...cambios });
    if (!p.get("empresa")) p.delete("empresa");
    router.replace(`/enfermeria?${p}`, { scroll: false });
  };
  return (
    <div className="grid grid-cols-1 gap-3 rounded-xl border bg-card p-4 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
      {empresas.length > 1 ? (
        <CampoSelect id="empresa" etiqueta="Empresa" value={empresa} onChange={(e) => ir({ empresa: e.target.value })}>
          <option value="">Todas las empresas</option>
          {empresas.map((e) => <option key={e.id} value={e.id}>{e.nombre}</option>)}
        </CampoSelect>
      ) : (
        <div><p className="mb-1.5 text-sm font-medium">Empresa</p><p className="flex h-10 items-center text-sm">{empresas[0]?.nombre ?? "—"}</p></div>
      )}
      <div>
        <Label htmlFor="dia" className="mb-1.5">Día</Label>
        <div className="flex items-center gap-1">
          <Button type="button" variant="outline" size="icon" aria-label="Día anterior" onClick={() => ir({ fecha: sumarDias(fecha, -1) })}><ChevronLeft /></Button>
          <Input id="dia" type="date" value={fecha} max={hoy} onChange={(e) => e.target.value && ir({ fecha: e.target.value })} className="h-10 min-w-0" />
          <Button type="button" variant="outline" size="icon" aria-label="Día siguiente" disabled={fecha >= hoy} onClick={() => ir({ fecha: sumarDias(fecha, 1) })}><ChevronRight /></Button>
        </div>
      </div>
    </div>
  );
}
