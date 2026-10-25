"use client";

import { useActionState, useState, useTransition } from "react";
import { Loader2, UserPlus } from "lucide-react";
import { Aviso, Campo, CampoSelect } from "@/components/app/campo";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ETIQUETA_ROL, type Rol } from "@/lib/sesion-roles";
import { agregarUsuario, cambiarRol, type Resultado } from "../acciones";
import type { Miembro } from "./page";

const ROLES = Object.entries(ETIQUETA_ROL) as [Rol, string][];

function iniciales(texto: string) {
  return texto.split(/[\s@.]+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("");
}

export function GestionUsuarios({ miembros, yo, esAdmin }: { miembros: Miembro[]; yo: string; esAdmin: boolean }) {
  const [estado, accion, enviando] = useActionState(agregarUsuario, null);
  const [aviso, setAviso] = useState<Resultado | null>(null);
  const [ocupado, iniciar] = useTransition();

  const actualizar = (m: Miembro, rol: Rol, activo: boolean) =>
    iniciar(async () => setAviso(await cambiarRol(m.id, rol, activo)));

  return (
    <div className="space-y-4">
      {esAdmin && (
        <Card>
          <CardHeader><CardTitle className="text-base">Agregar usuario</CardTitle></CardHeader>
          <CardContent>
            <form action={accion} className="grid items-end gap-3 sm:grid-cols-[minmax(0,1fr)_14rem_auto]">
              <Campo id="correo" etiqueta="Correo con el que creó su cuenta" type="email" required />
              <CampoSelect id="rol" etiqueta="Rol" defaultValue="medico">
                {ROLES.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </CampoSelect>
              <Button type="submit" disabled={enviando} className="h-10">
                {enviando ? <Loader2 className="animate-spin" /> : <UserPlus />} Agregar
              </Button>
            </form>
            <div className="mt-3"><Aviso resultado={estado} /></div>
          </CardContent>
        </Card>
      )}

      <Card className="gap-0 py-0">
        <div className="flex items-center gap-2 border-b px-5 py-4">
          <span className="font-semibold">{miembros.length} usuarios</span>
          {ocupado && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
        </div>
        {aviso && !aviso.ok && <div className="border-b px-5 py-3"><Aviso resultado={aviso} /></div>}
        <ul className="divide-y">
          {miembros.map((m) => (
            <li key={m.id} className={`flex flex-wrap items-center gap-3 px-5 py-3 ${m.activo ? "" : "opacity-50"}`}>
              <Avatar className="size-9">
                <AvatarFallback className="bg-primary/10 text-sm text-primary">{iniciales(m.nombre || m.correo)}</AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{m.nombre || m.correo}{m.usuario_id === yo && " (tú)"}</div>
                <div className="truncate text-sm text-muted-foreground">{m.correo}</div>
              </div>
              {esAdmin ? (
                <>
                  <select
                    value={m.rol}
                    onChange={(e) => actualizar(m, e.target.value as Rol, m.activo)}
                    className="h-9 rounded-md border bg-transparent px-2 text-sm"
                  >
                    {ROLES.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                  <Button variant="ghost" size="sm" onClick={() => actualizar(m, m.rol, !m.activo)}>
                    {m.activo ? "Desactivar" : "Activar"}
                  </Button>
                </>
              ) : (
                <span className="text-sm text-muted-foreground">{ETIQUETA_ROL[m.rol]}</span>
              )}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
