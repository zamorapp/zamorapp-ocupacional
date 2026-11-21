"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Pencil, Plus, UserCheck, UserX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { nombreCompleto, type Especialista } from "@/lib/especialistas-tipos";
import { cambiarActivoEspecialista, crearEspecialista, editarEspecialista } from "./acciones";

// Editor del registro de especialistas: agregar, editar y desactivar (nada se borra)
const INPUT = "h-10 w-full rounded-md border bg-transparent px-3 text-sm";
const VACIO = { id: "", nombres: "", apellidos: "", especialidad: "", direccion: "", telefono: "", correo: "", notas: "" };
type Form = typeof VACIO;

export function EditorEspecialistas({ especialistas, especialidades }: { especialistas: Especialista[]; especialidades: string[] }) {
  const router = useRouter();
  const [editando, setEditando] = useState<Form | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, iniciar] = useTransition();

  const abrir = (e?: Especialista) => {
    setError(null);
    setEditando(e
      ? { id: e.id, nombres: e.nombres, apellidos: e.apellidos, especialidad: e.especialidad, direccion: e.direccion ?? "", telefono: e.telefono ?? "", correo: e.correo ?? "", notas: e.notas ?? "" }
      : VACIO);
  };

  const guardar = () => iniciar(async () => {
    if (!editando) return;
    const datos = new FormData();
    for (const [k, v] of Object.entries(editando)) if (k !== "id") datos.set(k, v);
    const r = editando.id ? await editarEspecialista(editando.id, datos) : await crearEspecialista(datos);
    if (!r.ok) { setError(r.mensaje); return; }
    setEditando(null);
    setAviso(r.mensaje);
    router.refresh();
  });

  const cambiarActivo = (e: Especialista) => iniciar(async () => {
    const r = await cambiarActivoEspecialista(e.id, !e.activo);
    if (!r.ok) { setError(r.mensaje); return; }
    setError(null);
    setAviso(r.mensaje);
    router.refresh();
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">{especialistas.filter((e) => e.activo).length} activos · {especialistas.length} en total</p>
        <Button onClick={() => abrir()}><Plus /> Agregar especialista</Button>
      </div>
      {aviso && <p className="rounded-lg bg-ok/15 px-3 py-2 text-sm text-ok-texto">{aviso}</p>}
      {error && !editando && <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
      {especialistas.length === 0 ? (
        <p className="rounded-lg border bg-card p-6 text-center text-sm text-muted-foreground">
          Todavía no hay especialistas registrados. Agrega el primero con «Agregar especialista».
        </p>
      ) : (
        <ul className="divide-y rounded-xl border bg-card">
          {especialistas.map((e) => (
            <li key={e.id} className="flex flex-wrap items-center gap-2 px-4 py-3">
              <div className="min-w-48 flex-1">
                <p className="font-medium">{nombreCompleto(e)}{!e.activo && <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">inactivo</span>}</p>
                <p className="text-sm text-muted-foreground">{[e.especialidad, e.direccion, e.telefono, e.correo].filter(Boolean).join(" · ")}</p>
              </div>
              <Button size="sm" variant="outline" onClick={() => abrir(e)}><Pencil /> Editar</Button>
              <Button size="sm" variant="outline" disabled={ocupado} onClick={() => cambiarActivo(e)} className={e.activo ? "text-destructive" : "text-ok-texto"}>
                {e.activo ? <><UserX /> Desactivar</> : <><UserCheck /> Activar</>}
              </Button>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={editando !== null} onOpenChange={(v) => !v && setEditando(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editando?.id ? "Editar especialista" : "Agregar especialista"}</DialogTitle>
            <DialogDescription>Nombre, apellido y especialidad son obligatorios; la dirección del consultorio y el contacto son opcionales.</DialogDescription>
          </DialogHeader>
          {editando && (
            <form id="especialista" onSubmit={(e) => { e.preventDefault(); guardar(); }} className="grid grid-cols-2 gap-3">
              <label className="text-sm font-medium">Nombre
                <Input required value={editando.nombres} onChange={(e) => setEditando({ ...editando, nombres: e.target.value })} className="mt-1" placeholder="María" />
              </label>
              <label className="text-sm font-medium">Apellido
                <Input required value={editando.apellidos} onChange={(e) => setEditando({ ...editando, apellidos: e.target.value })} className="mt-1" placeholder="Pérez" />
              </label>
              <label className="col-span-2 text-sm font-medium">Especialidad
                <input list="especialidades" required value={editando.especialidad} onChange={(e) => setEditando({ ...editando, especialidad: e.target.value })} className={INPUT + " mt-1"} placeholder="Traumatología" />
                <datalist id="especialidades">{especialidades.map((s) => <option key={s} value={s} />)}</datalist>
              </label>
              <label className="col-span-2 text-sm font-medium">Dirección del consultorio (si la tienes)
                <Input value={editando.direccion} onChange={(e) => setEditando({ ...editando, direccion: e.target.value })} className="mt-1" placeholder="Torre Empresarial, piso 2, oficina 2-4" />
              </label>
              <label className="text-sm font-medium">Teléfono
                <Input type="tel" value={editando.telefono} onChange={(e) => setEditando({ ...editando, telefono: e.target.value })} className="mt-1" placeholder="0414-1234567" />
              </label>
              <label className="text-sm font-medium">Correo
                <Input type="email" value={editando.correo} onChange={(e) => setEditando({ ...editando, correo: e.target.value })} className="mt-1" placeholder="colega@correo.com" />
              </label>
              <label className="col-span-2 text-sm font-medium">Notas (solo las ve el servicio)
                <Input value={editando.notas} onChange={(e) => setEditando({ ...editando, notas: e.target.value })} className="mt-1" placeholder="Atiende martes y jueves" />
              </label>
              {error && <p role="alert" className="col-span-2 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
            </form>
          )}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setEditando(null)} className="max-sm:min-h-11">Cancelar</Button>
            <Button type="submit" form="especialista" disabled={ocupado} className="max-sm:min-h-11">
              {ocupado ? <Loader2 className="animate-spin" /> : <Plus />} {editando?.id ? "Guardar cambios" : "Agregar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
