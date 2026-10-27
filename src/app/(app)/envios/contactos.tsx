"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { Pencil, ShieldCheck, Trash2, Users } from "lucide-react";
import { Aviso, Campo } from "@/components/app/campo";
import { confirmar } from "@/components/app/confirmar";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import type { Contacto } from "@/lib/envios-tipos";
import { guardarContacto, quitarContacto } from "./acciones";

// Contactos de la empresa para envíos: RR. HH., SST y el personal de salud autorizado a recibir la consulta médica
export function Contactos({ empresaId, contactos, puedeAutorizar }: { empresaId: string; contactos: Contacto[]; puedeAutorizar: boolean }) {
  const [editando, setEditando] = useState<Contacto | null>(null);
  const [estado, accion, guardando] = useActionState(guardarContacto, null);
  const [, iniciar] = useTransition();
  const [clave, setClave] = useState(0);

  useEffect(() => {
    if (estado?.ok) { setEditando(null); setClave((k) => k + 1); }
  }, [estado]);

  return (
    <Dialog>
      <DialogTrigger asChild><Button variant="outline" size="sm"><Users /> Contactos · {contactos.length}</Button></DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Contactos de la empresa</DialogTitle>
          <DialogDescription>A quién le llegan los envíos. La consulta médica solo va al personal de salud marcado como autorizado.</DialogDescription>
        </DialogHeader>
        {contactos.length > 0 && (
          <ul className="divide-y rounded-md border">
            {contactos.map((c) => (
              <li key={c.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5 font-medium">{c.nombre}{c.recibeConsulta && <ShieldCheck className="size-3.5 text-primary" aria-label="Personal de salud autorizado" />}</span>
                  <span className="block truncate text-xs text-muted-foreground">{[c.cargo, c.correo, c.telefono].filter(Boolean).join(" · ")}</span>
                </span>
                <Button variant="ghost" size="icon" aria-label={`Editar a ${c.nombre}`} onClick={() => { setEditando(c); setClave((k) => k + 1); }}><Pencil /></Button>
                <Button variant="ghost" size="icon" aria-label={`Quitar a ${c.nombre}`} onClick={async () => {
                  if (await confirmar({ titulo: `¿Quitar a ${c.nombre}?`, texto: "Deja de aparecer para envíos. Los envíos anteriores siguen en el registro.", accion: "Quitar", peligro: true })) iniciar(async () => { await quitarContacto(c.id); });
                }}><Trash2 /></Button>
              </li>
            ))}
          </ul>
        )}
        <form key={clave} action={accion} className="grid grid-cols-1 gap-3 rounded-md border p-3 sm:grid-cols-2">
          <p className="text-sm font-medium sm:col-span-2">{editando ? `Editar a ${editando.nombre}` : "Agregar contacto"}</p>
          <input type="hidden" name="empresa_id" value={empresaId} />
          {editando && <input type="hidden" name="id" value={editando.id} />}
          <Campo id="nombre" etiqueta="Nombre *" defaultValue={editando?.nombre} required />
          <Campo id="cargo" etiqueta="Cargo" defaultValue={editando?.cargo ?? ""} placeholder="RR. HH., SST, médico de la empresa…" />
          <Campo id="correo" etiqueta="Correo" type="email" defaultValue={editando?.correo ?? ""} />
          <Campo id="telefono" etiqueta="Teléfono (WhatsApp)" type="tel" defaultValue={editando?.telefono ?? ""} placeholder="0414-1234567" />
          <label className="flex items-start gap-2 text-sm sm:col-span-2">
            <input type="checkbox" name="recibe_consulta" defaultChecked={editando?.recibeConsulta} disabled={!puedeAutorizar} className="mt-0.5 size-4 accent-primary" />
            <span>Personal de salud autorizado: recibe la consulta médica
              <span className="block text-xs text-muted-foreground">{puedeAutorizar ? "Solo médicos o enfermería de la empresa, para el archivo cerrado." : "Solo el gerente médico o el administrador lo puede marcar."}</span>
            </span>
          </label>
          {!puedeAutorizar && editando?.recibeConsulta && <input type="hidden" name="recibe_consulta" value="on" />}
          <div className="flex gap-2 sm:col-span-2">
            <Button type="submit" disabled={guardando}>{guardando ? "Guardando…" : "Guardar"}</Button>
            {editando && <Button type="button" variant="ghost" onClick={() => { setEditando(null); setClave((k) => k + 1); }}>Cancelar</Button>}
          </div>
          <div className="sm:col-span-2"><Aviso resultado={estado} /></div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
