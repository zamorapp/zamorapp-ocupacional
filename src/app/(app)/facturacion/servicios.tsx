"use client";

import { useState, useTransition } from "react";
import { Loader2, Plus, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { type Categoria, ETIQUETA_CATEGORIA, ETIQUETA_UNIDAD, type Servicio, type Unidad } from "@/lib/facturacion-tipos";
import { cn } from "@/lib/utils";
import { guardarServicio } from "./acciones";

const NUEVO: Servicio = { id: "", codigo: "", nombre: "", categoria: "otro", unidad: "servicio", precioUsd: 0, motivos: "", activo: true };
const SELECT = "h-9 w-full rounded-md border bg-transparent px-2 text-sm";

function Fila({ inicial, editable, alGuardar }: { inicial: Servicio; editable: boolean; alGuardar?: () => void }) {
  const [s, setS] = useState(inicial);
  const [ocupado, iniciar] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const cambios = JSON.stringify(s) !== JSON.stringify(inicial);
  const set = <K extends keyof Servicio>(k: K, v: Servicio[K]) => setS((x) => ({ ...x, [k]: v }));
  return (
    <div className={cn("grid grid-cols-1 items-center gap-2 border-b px-4 py-2 last:border-0 lg:grid-cols-[6rem_minmax(0,2.5fr)_minmax(0,1.3fr)_7rem_7rem_minmax(0,1.2fr)_auto_auto]", !s.activo && "opacity-50")}>
      <Input value={s.codigo} disabled={!editable} placeholder="Código" className="h-9" onChange={(e) => set("codigo", e.target.value)} />
      <Input value={s.nombre} disabled={!editable} placeholder="Nombre del servicio" className="h-9" onChange={(e) => set("nombre", e.target.value)} />
      <select value={s.categoria} disabled={!editable} onChange={(e) => set("categoria", e.target.value as Categoria)} className={SELECT}>
        {Object.entries(ETIQUETA_CATEGORIA).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
      </select>
      <select value={s.unidad} disabled={!editable} onChange={(e) => set("unidad", e.target.value as Unidad)} className={SELECT}>
        {Object.entries(ETIQUETA_UNIDAD).map(([k, v]) => <option key={k} value={k}>Por {v}</option>)}
      </select>
      <div className="relative">
        <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
        <Input type="number" min={0} step="0.01" disabled={!editable} value={s.precioUsd} className="h-9 pl-5" onChange={(e) => set("precioUsd", Number(e.target.value))} />
      </div>
      <Input value={s.motivos} disabled={!editable} placeholder="Motivos (PRE, PER…)" title="Códigos de motivo de consulta que se cobran con este servicio" className="h-9 font-mono text-xs" onChange={(e) => set("motivos", e.target.value)} />
      <label className="flex items-center gap-1.5 text-xs">
        <input type="checkbox" disabled={!editable} checked={s.activo} onChange={(e) => set("activo", e.target.checked)} className="size-4 accent-[var(--primary)]" /> Activo
      </label>
      {editable && (
        <Button
          size="sm"
          variant={cambios ? "default" : "ghost"}
          disabled={!cambios || ocupado}
          onClick={() => iniciar(async () => {
            const r = await guardarServicio(s);
            setError(r.ok ? null : r.mensaje);
            if (r.ok) alGuardar?.();
          })}
        >
          {ocupado ? <Loader2 className="animate-spin" /> : <Save />}
        </Button>
      )}
      {error && <span className="text-xs text-destructive lg:col-span-8">{error}</span>}
    </div>
  );
}

export function Servicios({ servicios, editable }: { servicios: Servicio[]; editable: boolean }) {
  const [nuevo, setNuevo] = useState(false);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <p className="flex-1 text-sm text-muted-foreground">
          Precios en dólares; en la nota de cobro se convierten a bolívares con la tasa BCV. En <b>Motivos</b> pon los códigos de motivo de consulta que se cobran con ese servicio, para armar el cobro solo.
        </p>
        {editable && <Button onClick={() => setNuevo(true)} disabled={nuevo}><Plus /> Nuevo servicio</Button>}
      </div>
      <Card className="gap-0 py-0">
        {nuevo && <Fila key="nuevo" inicial={NUEVO} editable alGuardar={() => setNuevo(false)} />}
        {servicios.map((s) => <Fila key={s.id + s.precioUsd + s.nombre} inicial={s} editable={editable} />)}
        {servicios.length === 0 && !nuevo && <p className="px-4 py-10 text-center text-sm text-muted-foreground">Sin servicios.</p>}
      </Card>
    </div>
  );
}
