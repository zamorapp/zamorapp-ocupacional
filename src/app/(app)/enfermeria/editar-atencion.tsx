"use client";

import { useActionState, useEffect, useState } from "react";
import { Loader2, Pencil } from "lucide-react";
import { Aviso } from "@/components/app/campo";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { hoyCaracas } from "@/lib/fecha";
import { SIGNOS_ENFERMERIA, tipoEnfermeria } from "@/lib/enfermeria-tipos";
import type { AtencionEnfermeria } from "@/lib/enfermeria";
import { editarAtencion } from "./acciones";

// Corregir una atención o evolución ya guardada: lo anotado se cambia; el trabajador, el tipo y la consulta no
// (para eso se borra y se registra de nuevo). La corrección queda en la bitácora.
export function EditarAtencion({ a }: { a: AtencionEnfermeria }) {
  const hoy = hoyCaracas();
  const [abierto, setAbierto] = useState(false);
  const [estado, accion, guardando] = useActionState(editarAtencion.bind(null, a.id), null);
  const tipo = tipoEnfermeria(a.tipo);
  const evolucion = a.tipo === "evolucion";

  useEffect(() => { if (estado?.ok) setAbierto(false); }, [estado]);

  return (
    <Dialog open={abierto} onOpenChange={setAbierto} hayCambios={estado?.ok ? false : undefined}>
      <DialogTrigger asChild>
        <Button size="icon" variant="ghost" className="text-muted-foreground" aria-label="Corregir esta atención" title="Corregir lo anotado">
          <Pencil />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Corregir {evolucion ? "la evolución" : "la atención"}</DialogTitle>
          <DialogDescription>
            {tipo.t}{a.trabajador ? ` · ${a.trabajador.nombre}` : ` · ${a.empresa}`}. El trabajador y el tipo no cambian: si se equivocó de paciente, bórrela y regístrela de nuevo. La corrección queda en la auditoría.
          </DialogDescription>
        </DialogHeader>
        <form action={accion} className="space-y-4">
          <input type="hidden" name="tipo" value={a.tipo} />
          {!evolucion && (
            <div className="space-y-1.5">
              <Label htmlFor={`motivo-${a.id}`}>Motivo</Label>
              <Input id={`motivo-${a.id}`} name="motivo" defaultValue={a.motivo ?? ""} maxLength={200} className="h-10" />
            </div>
          )}
          {tipo.pideSignos && (
            <fieldset className="space-y-1.5">
              <legend className="text-sm font-medium">Signos vitales</legend>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {SIGNOS_ENFERMERIA.map((s) => (
                  <label key={s.k} className="text-xs text-muted-foreground">
                    {s.t} <span className="opacity-70">({s.unidad})</span>
                    <Input name={`s_${s.k}`} defaultValue={a.signos[s.k] ?? ""} inputMode={s.k === "ta" ? "text" : "decimal"} placeholder={s.ejemplo} maxLength={12} className="mt-1 h-10 text-sm text-foreground" />
                  </label>
                ))}
              </div>
            </fieldset>
          )}
          {tipo.pideTratamiento && (
            <div className="space-y-1.5">
              <Label htmlFor={`tratamiento-${a.id}`}>¿Qué hiciste o administraste?</Label>
              <Textarea id={`tratamiento-${a.id}`} name="tratamiento" rows={2} maxLength={1000} defaultValue={a.tratamiento ?? ""} />
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor={`nota-${a.id}`}>{evolucion ? "Evolución de enfermería" : "Observación"}</Label>
            <Textarea id={`nota-${a.id}`} name="nota" rows={evolucion ? 5 : 2} maxLength={2000} required={evolucion} defaultValue={a.nota ?? ""} />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor={`fecha-${a.id}`}>Día de la atención</Label>
              <Input id={`fecha-${a.id}`} name="fecha" type="date" max={hoy} required defaultValue={a.fecha} className="h-10" />
            </div>
            <label className="flex items-center gap-2 self-end rounded-lg border px-3 py-2.5 text-sm">
              <input type="checkbox" name="referido" defaultChecked={a.referido} className="size-4 accent-[var(--primary)]" /> Referir al médico
            </label>
          </div>
          <Aviso resultado={estado} />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setAbierto(false)}>Cancelar</Button>
            <Button type="submit" disabled={guardando}>{guardando ? <Loader2 className="animate-spin" /> : <Pencil />} Guardar corrección</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
