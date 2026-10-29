"use client";

import { useActionState, useState, useTransition } from "react";
import { AtSign, Check, Loader2, Pencil, ShieldOff, UserPlus, X } from "lucide-react";
import { confirmar } from "@/components/app/confirmar";
import { Aviso, Campo, CampoSelect } from "@/components/app/campo";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ETIQUETA_ROL, ROLES_EMPRESA, type Rol } from "@/lib/sesion-roles";
import { agregarUsuario, cambiarRol, guardarUsuarioIngreso, reiniciarDosPasos, type Resultado } from "../acciones";
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
        {aviso && <div className="border-b px-5 py-3"><Aviso resultado={aviso} /></div>}
        <ul className="divide-y">
          {miembros.map((m) => (
            <li key={m.id} className={`flex flex-wrap items-start gap-3 px-5 py-3 sm:items-center ${m.activo ? "" : "opacity-50"}`}>
              <Avatar className="size-9">
                <AvatarFallback className="bg-primary/10 text-sm text-primary">{iniciales(m.nombre || m.correo)}</AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1 basis-[calc(100%-3rem)] sm:basis-0">
                <div className="truncate font-medium">{m.nombre || m.correo}{m.usuario_id === yo && " (tú)"}</div>
                <div className="truncate text-sm text-muted-foreground">{m.correo}{ROLES_EMPRESA.includes(m.rol) && m.empresas?.length ? ` · ${m.empresas.map((id) => nombreEmpresa.get(id) ?? "").join(", ")}` : ""}</div>
                {(esAdmin || m.usuario) && <UsuarioCorto miembro={m} editable={esAdmin} alGuardar={setAviso} />}
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
                  {m.usuario_id !== yo && ["administrador", "gerente_medico"].includes(m.rol) && (
                    <Button variant="ghost" size="sm" title="Si perdió el teléfono del código de dos pasos" onClick={async () => {
                      if (!(await confirmar({ titulo: `¿Reiniciar la verificación en dos pasos de ${m.nombre || m.correo}?`, texto: "Úsalo solo si perdió el teléfono y sus códigos de respaldo. Al entrar escaneará un código QR nuevo.", accion: "Reiniciar", peligro: true }))) return;
                      iniciar(async () => setAviso(await reiniciarDosPasos(m.usuario_id)));
                    }}>
                      <ShieldOff /> Reiniciar dos pasos
                    </Button>
                  )}
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

// Usuario corto para entrar sin escribir el correo (como en el SAME). La contraseña es la misma de su cuenta.
function UsuarioCorto({ miembro, editable, alGuardar }: { miembro: Miembro; editable: boolean; alGuardar: (r: Resultado) => void }) {
  const [editando, setEditando] = useState(false);
  const [valor, setValor] = useState(miembro.usuario ?? "");
  const [guardando, iniciar] = useTransition();

  const guardar = () =>
    iniciar(async () => {
      const r = await guardarUsuarioIngreso(miembro.usuario_id, valor);
      alGuardar(r);
      if (r.ok) setEditando(false);
    });

  if (!editando) {
    return (
      <button
        type="button"
        disabled={!editable}
        onClick={() => { setValor(miembro.usuario ?? sugerirUsuario(miembro)); setEditando(true); }}
        className="mt-1 inline-flex max-w-full items-center gap-1 rounded-md text-sm text-primary enabled:hover:underline disabled:text-muted-foreground"
        title={editable ? "Usuario para entrar sin escribir el correo" : "Tu usuario para entrar"}
      >
        <AtSign className="size-3.5 shrink-0" />
        {miembro.usuario ? <span className="truncate font-mono">{miembro.usuario}</span> : <span>Asignar usuario de ingreso</span>}
        {editable && miembro.usuario && <Pencil className="size-3 shrink-0 opacity-60" />}
      </button>
    );
  }

  return (
    <form onSubmit={(e) => { e.preventDefault(); guardar(); }} className="mt-1.5 flex flex-wrap items-center gap-1.5">
      <div className="relative w-full sm:w-auto">
        <AtSign className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <input
          autoFocus
          value={valor}
          onChange={(e) => setValor(e.target.value.toLowerCase().replace(/\s/g, ""))}
          maxLength={30}
          pattern="[a-z0-9][a-z0-9._\-]{2,29}|"
          title="De 3 a 30 letras o números, sin espacios, tildes ni @. Vacío lo quita."
          placeholder="usuario"
          aria-label="Usuario de ingreso"
          autoCapitalize="none"
          spellCheck={false}
          className="h-8 w-full rounded-md border bg-transparent pl-7 pr-2 font-mono text-sm outline-none sm:w-40 focus-visible:ring-[3px] focus-visible:ring-ring/50"
        />
      </div>
      <Button type="submit" size="sm" className="h-8" disabled={guardando}>
        {guardando ? <Loader2 className="animate-spin" /> : <Check />} Guardar
      </Button>
      <Button type="button" variant="ghost" size="sm" className="h-8" onClick={() => setEditando(false)} aria-label="Cancelar">
        <X />
      </Button>
      <p className="basis-full text-xs text-muted-foreground">Entra con este usuario y la misma contraseña de su cuenta. Déjalo vacío para quitarlo.</p>
    </form>
  );
}

// Primer nombre sin tildes (p. ej. «César Zamora» → «cesar»), o la parte del correo antes de la @
function sugerirUsuario(m: Miembro) {
  const base = (m.nombre?.split(/\s+/)[0] || m.correo.split("@")[0] || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  return base.replace(/[^a-z0-9._-]/g, "").slice(0, 30);
}
