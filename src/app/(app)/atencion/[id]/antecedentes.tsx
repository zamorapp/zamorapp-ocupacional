"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Antecedente } from "@/lib/consultas-tipos";
import type { Item } from "@/lib/listas";
import { cn } from "@/lib/utils";

type Props = { items: Item[]; valor: Antecedente[]; onChange: (v: Antecedente[]) => void };

const esFamiliar = (g: string | null) => g === "familiar";

function Fila({ item, marcado, onMarcar, onObservacion, placeholder }: {
  item: { id: string; nombre: string };
  marcado: Antecedente | undefined;
  onMarcar: (v: boolean) => void;
  onObservacion: (v: string) => void;
  placeholder: string;
}) {
  return (
    <div className="grid grid-cols-[13rem_minmax(0,1fr)] items-center gap-3">
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={Boolean(marcado)} onChange={(e) => onMarcar(e.target.checked)} className="size-4 accent-[var(--primary)]" />
        {item.nombre}
      </label>
      {marcado && <Input value={marcado.observacion} placeholder={placeholder} className="h-8" onChange={(e) => onObservacion(e.target.value)} />}
    </div>
  );
}

// Antecedentes personales siempre visibles; los familiares solo se abren si el trabajador refiere alguno.
// Sin marcas, los documentos dicen "No refiere antecedentes…".
export function Antecedentes({ items, valor, onChange }: Props) {
  const personales = items.filter((i) => !esFamiliar(i.grupo));
  const familiares = items.filter((i) => esFamiliar(i.grupo));
  const marcadosFamiliares = valor.filter((a) => esFamiliar(a.grupo));
  const otrosFamiliares = marcadosFamiliares.filter((a) => a.id.startsWith("otro-"));
  const [refiereFamiliares, setRefiereFamiliares] = useState(marcadosFamiliares.length > 0);

  const marcar = (item: { id: string; nombre: string; grupo: string | null }, si: boolean) =>
    onChange(si ? [...valor, { id: item.id, nombre: item.nombre, grupo: item.grupo, observacion: "" }] : valor.filter((x) => x.id !== item.id));
  const observar = (id: string, observacion: string) => onChange(valor.map((x) => (x.id === id ? { ...x, observacion } : x)));

  const sinPersonales = !valor.some((a) => !esFamiliar(a.grupo));

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <div className="text-sm font-medium">Personales</div>
        {personales.map((a) => (
          <Fila key={a.id} item={a} marcado={valor.find((x) => x.id === a.id)} onMarcar={(si) => marcar(a, si)} onObservacion={(v) => observar(a.id, v)} placeholder="Desde cuándo, tratamiento…" />
        ))}
        {sinPersonales && <p className="text-xs text-muted-foreground">Sin marcas: «No refiere antecedentes personales».</p>}
      </div>

      <div className={cn("rounded-lg border p-3", refiereFamiliares && "border-primary/40 bg-primary/5")}>
        <label className="flex items-center gap-2 text-sm font-medium">
          <input
            type="checkbox"
            checked={refiereFamiliares}
            onChange={(e) => {
              setRefiereFamiliares(e.target.checked);
              if (!e.target.checked) onChange(valor.filter((x) => !esFamiliar(x.grupo)));
            }}
            className="size-4 accent-[var(--primary)]"
          />
          Refiere antecedentes familiares
        </label>
        {!refiereFamiliares ? (
          <p className="mt-1 pl-6 text-xs text-muted-foreground">Sin marcar: «No refiere antecedentes familiares».</p>
        ) : (
          <div className="mt-3 space-y-2 pl-6">
            {familiares.map((a) => (
              <Fila key={a.id} item={a} marcado={valor.find((x) => x.id === a.id)} onMarcar={(si) => marcar(a, si)} onObservacion={(v) => observar(a.id, v)} placeholder="Parentesco: madre, padre, abuelo…" />
            ))}
            {otrosFamiliares.map((a) => (
              <div key={a.id} className="grid grid-cols-[13rem_minmax(0,1fr)_auto] items-center gap-3">
                <Input value={a.nombre} placeholder="Enfermedad" className="h-8" onChange={(e) => onChange(valor.map((x) => (x.id === a.id ? { ...x, nombre: e.target.value } : x)))} />
                <Input value={a.observacion} placeholder="Parentesco" className="h-8" onChange={(e) => observar(a.id, e.target.value)} />
                <button type="button" className="text-muted-foreground hover:text-destructive" onClick={() => onChange(valor.filter((x) => x.id !== a.id))}><Trash2 className="size-4" /></button>
              </div>
            ))}
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => onChange([...valor, { id: `otro-${Date.now()}`, nombre: "", grupo: "familiar", observacion: "" }])}
            >
              <Plus /> Otra enfermedad
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
