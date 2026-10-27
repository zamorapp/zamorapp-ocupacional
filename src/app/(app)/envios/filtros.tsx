"use client";

import { useRouter } from "next/navigation";
import { CampoSelect, Campo } from "@/components/app/campo";

export function Filtros({ empresas, empresa, fecha }: { empresas: { id: string; nombre: string }[]; empresa: string; fecha: string }) {
  const router = useRouter();
  const ir = (cambios: { empresa?: string; fecha?: string }) => {
    const p = new URLSearchParams({ empresa, fecha, ...cambios });
    router.replace(`/envios?${p}`);
  };
  return (
    <div className="grid grid-cols-1 gap-3 rounded-xl border bg-card p-4 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
      <CampoSelect id="empresa" etiqueta="Empresa" value={empresa} onChange={(e) => ir({ empresa: e.target.value })}>
        <option value="">Elige la empresa…</option>
        {empresas.map((e) => <option key={e.id} value={e.id}>{e.nombre}</option>)}
      </CampoSelect>
      <Campo id="fecha" etiqueta="Día de las evaluaciones" type="date" value={fecha} onChange={(e) => e.target.value && ir({ fecha: e.target.value })} />
    </div>
  );
}
