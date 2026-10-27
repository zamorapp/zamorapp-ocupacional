"use client";

import { useActionState, useState, useTransition } from "react";
import { Loader2, UserPlus } from "lucide-react";
import { Aviso, Campo, CampoSelect } from "@/components/app/campo";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ETIQUETA_ROL, ROLES_EMPRESA, type Rol } from "@/lib/sesion-roles";
import { agregarUsuario, cambiarRol, type Resultado } from "../acciones";
import type { Miembro } from "./page";

const ROLES = Object.entries(ETIQUETA_ROL) as [Rol, string][];
// Personas de la empresa cliente: deben tener su empresa asignada

function iniciales(texto: string) {
  return texto.split(/[\s@.]+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("");
}

export function GestionUsuarios({ miembros, yo, esAdmin, empresas }: { miembros: Miembro[]; yo: string; esAdmin: boolean; empresas: { id: string; nombre: string }[] }) {
  const [rolNuevo, setRolNuevo] = useState<Rol>("medico");
  const nombreEmpresa = new Map(empresas.map((e) => [e.id, e.nombre]));
  const [estado, accion, enviando] = useActionState(agregarUsuario, null);
  const [aviso, setAviso] = useState<Resultado | null>(null);
  const [ocupado, iniciar] = useTransition();

  const actualizar = (m: Miembro, cambio: Partial<Pick<Miembro, "rol" | "activo" | "acceso_clinico">>) => {
    const n = { ...m, ...cambio };
    iniciar(async () => setAviso(await cambiarRol(m.id, n.rol, n.activo, n.acceso_clinico)));
  };

  return (
    <div className="space-y-4">
      {esAdmin && (
        <Card>
          <CardHeader><CardTitle className="text-base">Agregar usuario</CardTitle></CardHeader>
          <CardContent>
            <form action={accion} className="grid items-end gap-3 sm:grid-cols-[minmax(0,1fr)_14rem_auto]">
              <Campo id="correo" etiqueta="Correo con el que creó su cuenta" type="email" required />
              <CampoSelect id="rol" etiqueta="Rol" value={rolNuevo} onChange={(e) => setRolNuevo(e.target.value as Rol)}>
                {ROLES.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </CampoSelect>
              {ROLES_EMPRESA.includes(rolNuevo) && (
                <div className="sm:col-span-3">
                  <p className="mb-1.5 text-sm font-medium">Empresa a la que pertenece * (solo verá esa)</p>
                  <div className="flex flex-wrap gap-3">
                    {empresas.map((e) => (
                      <label key={e.id} className="flex items-center gap-1.5 text-sm">
                        <input type="checkbox" name="empresas" value={e.id} className="size-4 accent-[var(--primary)]" /> {e.nombre}
                      </label>
                    ))}
                  </div>
                </div>
              )}
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
                <div className="truncate text-sm text-muted-foreground">{m.correo}{ROLES_EMPRESA.includes(m.rol) && m.empresas?.length ? ` · ${m.empresas.map((id) => nombreEmpresa.get(id) ?? "").join(", ")}` : ""}</div>
              </div>
              {esAdmin ? (
                <>
                  <select
                    value={m.rol}
                    onChange={(e) => actualizar(m, { rol: e.target.value as Rol })}
                    className="h-9 rounded-md border bg-transparent px-2 text-sm"
                  >
                    {ROLES.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                  <label className="flex items-center gap-1.5 text-sm" title="Puede abrir historias clínicas">
                    <input type="checkbox" checked={m.acceso_clinico || ["medico", "enfermeria", "gerente_medico"].includes(m.rol)} disabled={["medico", "enfermeria", "gerente_medico"].includes(m.rol)} onChange={(e) => actualizar(m, { acceso_clinico: e.target.checked })} className="size-4 accent-[var(--primary)]" />
                    Clínico
                  </label>
                  <Button variant="ghost" size="sm" onClick={() => actualizar(m, { activo: !m.activo })}>
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
