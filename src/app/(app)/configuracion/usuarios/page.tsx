import type { PermisoPortal } from "@/lib/permisos-portal";
import type { Metadata } from "next";
import { supabaseConfigurado } from "@/lib/config";
import { obtenerSesion, type Rol } from "@/lib/sesion";
import { crearClienteServidor } from "@/lib/supabase/server";
import { listarEmpresas, soloEmpresas } from "@/lib/empresas";
import { listarInvitaciones, type Invitacion } from "@/lib/invitaciones";
import { Volver } from "../volver";
import { GestionUsuarios } from "./gestion-usuarios";
import { InvitarPorEnlace } from "./invitar-rrhh";

export const metadata: Metadata = { title: "Usuarios" };

export type Miembro = { id: string; usuario_id: string; correo: string; nombre: string | null; rol: Rol; activo: boolean; acceso_clinico: boolean; empresas: string[] | null; usuario?: string | null; permisos_portal?: PermisoPortal[] | null };

export default async function Usuarios({ searchParams }: { searchParams: Promise<{ empresa?: string; rol?: string }> }) {
  const { empresa: empresaInicial, rol: rolInicial } = await searchParams;
  const [sesion, empresas] = await Promise.all([obtenerSesion(), listarEmpresas(true).then(soloEmpresas)]);
  const esAdmin = !sesion.demo && sesion.rol === "administrador";
  let miembros: Miembro[] = [];
  let invitaciones: Invitacion[] = [];
  let contactos: { empresa_id: string; nombre: string; telefono: string }[] = [];
  if (supabaseConfigurado && !sesion.demo) {
    const supabase = await crearClienteServidor();
    const [{ data }, { data: perms }, inv, { data: cts }] = await Promise.all([
      supabase.rpc("miembros_con_correo"),
      // Permisos del portal de cada persona de empresa (miembros_con_correo devuelve columnas fijas)
      supabase.from("miembros").select("id, permisos_portal").not("permisos_portal", "is", null),
      esAdmin ? listarInvitaciones() : Promise.resolve([]),
      esAdmin ? supabase.from("empresa_contactos").select("empresa_id, nombre, telefono").eq("activo", true).not("telefono", "is", null) : Promise.resolve({ data: [] }),
    ]);
    const permisos = new Map((perms ?? []).map((p) => [p.id as string, p.permisos_portal as PermisoPortal[]]));
    miembros = ((data ?? []) as Miembro[]).map((m) => ({ ...m, permisos_portal: permisos.get(m.id) ?? null }));
    invitaciones = inv;
    contactos = (cts ?? []) as typeof contactos;
  }
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Volver />
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Usuarios y roles</h1>
        <p className="text-muted-foreground">
          ¿Todavía no tiene cuenta? Mándale un enlace con su rol. ¿Ya la tiene? Agrégala abajo con su correo. La historia clínica solo la ven médico, enfermería y gerente médico.
        </p>
      </div>
      {esAdmin && (
        <InvitarPorEnlace
          key={`${rolInicial ?? ""}-${empresaInicial ?? ""}`}
          empresaInicial={empresaInicial}
          rolInicial={rolInicial}
          empresas={empresas.map((e) => ({ id: e.id, nombre: e.razonSocial, contactos: contactos.filter((c) => c.empresa_id === e.id).map((c) => ({ nombre: c.nombre, telefono: c.telefono })) }))}
          invitaciones={invitaciones}
        />
      )}
      {!esAdmin && !sesion.demo && (
        <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
          Las invitaciones por enlace solo las crea un usuario con rol Administrador.
        </p>
      )}
      <GestionUsuarios empresas={empresas.map((e) => ({ id: e.id, nombre: e.razonSocial }))} miembros={miembros} yo={sesion.usuarioId} esAdmin={esAdmin} />
    </div>
  );
}
