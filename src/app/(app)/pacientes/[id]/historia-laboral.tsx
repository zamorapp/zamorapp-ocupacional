"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { BriefcaseBusiness, Loader2, Pencil, Plus, Trash2, X } from "lucide-react";
import { Aviso, Campo, CampoTexto } from "@/components/app/campo";
import { Button } from "@/components/ui/button";
import { CONDICIONES, type EmpleoAnterior } from "@/lib/historia-laboral";
import { GRUPOS_RIESGO } from "@/lib/pacientes";
import { eliminarEmpleo, guardarEmpleo } from "./historia-acciones";

function Formulario({ trabajadorId, e, alTerminar }: { trabajadorId: string; e: EmpleoAnterior | null; alTerminar: () => void }) {
  const [estado, accion, enviando] = useActionState(guardarEmpleo, null);
  useEffect(() => { if (estado?.ok) alTerminar(); }, [estado, alTerminar]);
  return (
    <form action={accion} className="grid gap-3 rounded-lg border bg-muted/30 p-4 sm:grid-cols-3">
      <input type="hidden" name="trabajador_id" value={trabajadorId} />
      {e && <input type="hidden" name="id" value={e.id} />}
      <Campo id="empresa" etiqueta="Empresa *" defaultValue={e?.empresa} required autoFocus />
      <Campo id="industria" etiqueta="Actividad o industria" defaultValue={e?.industria ?? ""} />
      <Campo id="cargo" etiqueta="Cargo" defaultValue={e?.cargo ?? ""} />
      <Campo id="duracion" etiqueta="Tiempo (ej. 2 años, 6 meses)" defaultValue={e?.duracion ?? ""} />
      <Campo id="horario" etiqueta="Horario" defaultValue={e?.horario ?? ""} />
      <Campo id="epp" etiqueta="Equipos de protección" defaultValue={e?.epp ?? ""} />
      <CampoTexto id="descripcion" etiqueta="Tareas del cargo" rows={2} className="sm:col-span-3" defaultValue={e?.descripcion ?? ""} />
      {CONDICIONES.map(([k, n]) => <Campo key={k} id={`cond_${k}`} etiqueta={`Condición: ${n}`} defaultValue={e?.condiciones[k] ?? ""} />)}
      {GRUPOS_RIESGO.map(([k, n]) => <Campo key={k} id={`riesgo_${k}`} etiqueta={`Riesgos ${n.toLowerCase()} (separados por coma)`} defaultValue={(e?.riesgos[k] ?? []).join(", ")} />)}
      <Campo id="problemas_salud" etiqueta="Problemas de salud" defaultValue={e?.problemas_salud ?? ""} />
      <Campo id="accidentes" etiqueta="Accidentes de trabajo" defaultValue={e?.accidentes ?? ""} />
      <Campo id="enfermedades" etiqueta="Enfermedades ocupacionales" defaultValue={e?.enfermedades ?? ""} />
      <CampoTexto id="observaciones" etiqueta="Observaciones" rows={2} className="sm:col-span-3" defaultValue={e?.observaciones ?? ""} />
      <div className="flex items-center gap-2 sm:col-span-3">
        <Aviso resultado={estado && !estado.ok ? estado : null} />
        <Button type="button" variant="ghost" className="ml-auto" onClick={alTerminar}><X /> Cancelar</Button>
        <Button type="submit" disabled={enviando}>{enviando && <Loader2 className="animate-spin" />} Guardar</Button>
      </div>
    </form>
  );
}

const Dato = ({ k, v }: { k: string; v: string | null | undefined }) => (v ? <div><span className="text-muted-foreground">{k}: </span>{v}</div> : null);

/** Empleos anteriores del trabajador con sus riesgos, accidentes y enfermedades (antecedentes laborales). */
export function HistoriaLaboral({ trabajadorId, empleos }: { trabajadorId: string; empleos: EmpleoAnterior[] }) {
  const [editando, setEditando] = useState<string | null>(null);
  const [ocupado, iniciar] = useTransition();
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <p className="flex-1 text-sm text-muted-foreground">Empleos anteriores, riesgos a los que estuvo expuesto y problemas de salud relacionados.</p>
        {ocupado && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
        <Button size="sm" onClick={() => setEditando("nuevo")} disabled={editando === "nuevo"}><Plus /> Agregar empleo</Button>
      </div>
      {editando === "nuevo" && <Formulario trabajadorId={trabajadorId} e={null} alTerminar={() => setEditando(null)} />}
      {empleos.length === 0 && editando !== "nuevo" && (
        <div className="grid place-items-center gap-2 py-10 text-sm text-muted-foreground"><BriefcaseBusiness className="size-7" /> Sin empleos anteriores registrados.</div>
      )}
      {empleos.map((e) =>
        editando === e.id ? (
          <Formulario key={e.id} trabajadorId={trabajadorId} e={e} alTerminar={() => setEditando(null)} />
        ) : (
          <div key={e.id} className="group rounded-lg border p-4 text-sm">
            <div className="flex items-start gap-2">
              <div className="flex-1">
                <div className="font-medium">{e.cargo ? `${e.cargo} · ` : ""}{e.empresa}</div>
                <div className="text-muted-foreground">{[e.industria, e.duracion, e.horario].filter(Boolean).join(" · ")}</div>
              </div>
              <Button variant="ghost" size="icon" className="size-8" title="Editar" onClick={() => setEditando(e.id)}><Pencil /></Button>
              <Button variant="ghost" size="icon" className="size-8 hover:text-destructive" title="Eliminar"
                onClick={() => confirm(`¿Eliminar el empleo en ${e.empresa}?`) && iniciar(async () => { await eliminarEmpleo(e.id, trabajadorId); })}><Trash2 /></Button>
            </div>
            <div className="mt-2 grid gap-1 sm:grid-cols-2">
              <Dato k="Tareas" v={e.descripcion} />
              <Dato k="Protección" v={e.epp} />
              {CONDICIONES.map(([k, n]) => <Dato key={k} k={n} v={e.condiciones[k]} />)}
              {GRUPOS_RIESGO.map(([k, n]) => <Dato key={k} k={`Riesgo ${n.toLowerCase()}`} v={(e.riesgos[k] ?? []).join(", ")} />)}
              <Dato k="Problemas de salud" v={e.problemas_salud} />
              <Dato k="Accidentes" v={e.accidentes} />
              <Dato k="Enfermedades ocupacionales" v={e.enfermedades} />
              <Dato k="Observaciones" v={e.observaciones} />
            </div>
          </div>
        ),
      )}
    </div>
  );
}
