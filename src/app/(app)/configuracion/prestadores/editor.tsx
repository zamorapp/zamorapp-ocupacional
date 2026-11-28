"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { guardarPrestador } from "./acciones";

export type Prestador = { id: string; nombre: string; correo: string; activo: boolean };

export function EditorPrestadores({ prestadores }: { prestadores: Prestador[] }) {
  const [actual, editar] = useState<Prestador | null>(null);
  const [aviso, setAviso] = useState<{ error: boolean; texto: string } | null>(null);
  const [ocupado, iniciar] = useTransition();

  function guardar(formulario: FormData) {
    setAviso(null);
    iniciar(async () => {
      const error = await guardarPrestador(formulario).catch(() => "No se pudo guardar. Revisa la conexión.");
      setAviso({ error: Boolean(error), texto: error ?? "Prestador guardado." });
      if (!error) editar(null);
    });
  }

  return (
    <div className="space-y-4">
      <Button onClick={() => { editar({ id: "", nombre: "", correo: "", activo: true }); setAviso(null); }} disabled={ocupado}>Agregar prestador</Button>
      {actual && <form key={actual.id} action={guardar} className="space-y-4 rounded-xl border bg-card p-4">
        <input type="hidden" name="id" value={actual.id} />
        <label className="block space-y-1.5 text-sm font-medium">Nombre del prestador
          <Input name="nombre" required maxLength={120} defaultValue={actual.nombre} disabled={ocupado} />
        </label>
        <label className="block space-y-1.5 text-sm font-medium">Correo autorizado para recibir órdenes
          <Input name="correo" type="email" required maxLength={254} defaultValue={actual.correo} disabled={ocupado} />
        </label>
        <label className="flex items-center gap-2 text-sm"><input name="activo" type="checkbox" defaultChecked={actual.activo} disabled={ocupado} /> Disponible para remisiones</label>
        <div className="flex flex-wrap gap-2">
          <Button disabled={ocupado}>Guardar</Button>
          <Button type="button" variant="outline" disabled={ocupado} onClick={() => editar(null)}>Cancelar</Button>
        </div>
      </form>}
      {aviso && <p role={aviso.error ? "alert" : "status"} className={aviso.error ? "text-sm text-alerta-texto" : "text-sm"}>{aviso.texto}</p>}
      {prestadores.length ? <ul className="space-y-2">
        {prestadores.map((p) => <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-4">
          <div className="min-w-0 break-words">
            <p className="font-medium">{p.nombre}</p>
            <p className="break-all text-sm text-muted-foreground">{p.correo}{p.activo ? "" : " · Desactivado"}</p>
          </div>
          <Button variant="outline" disabled={ocupado} onClick={() => { editar(p); setAviso(null); }}>Editar</Button>
        </li>)}
      </ul> : <p className="text-sm text-muted-foreground">Aún no hay prestadores registrados.</p>}
    </div>
  );
}
