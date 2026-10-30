"use client";

import { useState, useTransition } from "react";
import { Check, Loader2, Pencil, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Dependencia } from "@/lib/puestos";
import { crearDependencia, renombrarDependencia } from "./acciones";

export function Dependencias({ empresaId, dependencias, editable }: { empresaId: string; dependencias: Dependencia[]; editable: boolean }) {
  const [nombre, setNombre] = useState("");
  const [editando, setEditando] = useState<{ id: string; nombre: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, iniciar] = useTransition();
  const correr = (f: () => Promise<{ ok: boolean; mensaje: string }>, despues?: () => void) =>
    iniciar(async () => { const r = await f(); setError(r.ok ? null : r.mensaje); if (r.ok) despues?.(); });

  return (
    <div className="space-y-2">
      <ul className="divide-y rounded-lg border">
        {dependencias.length === 0 && <li className="px-4 py-6 text-center text-sm text-muted-foreground">Sin dependencias ni departamentos.</li>}
        {dependencias.map((d) => (
          <li key={d.id} className="flex items-center gap-3 px-4 py-2 text-sm">
            {editando?.id === d.id ? (
              <>
                <Input autoFocus value={editando.nombre} onChange={(e) => setEditando({ ...editando, nombre: e.target.value })} className="h-8" />
                <Button size="icon" variant="ghost" className="size-8" onClick={() => correr(() => renombrarDependencia(empresaId, d.id, editando.nombre), () => setEditando(null))}><Check /></Button>
              </>
            ) : (
              <>
                <span className="flex-1 font-medium">{d.nombre}</span>
                <span className="text-xs text-muted-foreground">{d.puestos} puestos · {d.trabajadores} trab.</span>
                {editable && <Button size="icon" variant="ghost" className="size-8" onClick={() => setEditando({ id: d.id, nombre: d.nombre })}><Pencil /></Button>}
              </>
            )}
          </li>
        ))}
      </ul>
      {editable && (
        <form
          className="flex gap-2"
          onSubmit={(e) => { e.preventDefault(); correr(() => crearDependencia(empresaId, nombre), () => setNombre("")); }}
        >
          <Input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Nueva dependencia o departamento" className="h-9" />
          <Button type="submit" variant="outline" disabled={ocupado || !nombre.trim()}>{ocupado ? <Loader2 className="animate-spin" /> : <Plus />} Agregar</Button>
        </form>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
