import type { Metadata } from "next";
import { supabaseConfigurado } from "@/lib/config";
import { obtenerSesion, type Rol } from "@/lib/sesion";
import { crearClienteServidor } from "@/lib/supabase/server";
import { listarEmpresas } from "@/lib/empresas";
import { listarInvitaciones, type Invitacion } from "@/lib/invitaciones";
import { Volver } from "../volver";
import { GestionUsuarios } from "./gestion-usuarios";
import { InvitarRrhh } from "./invitar-rrhh";

export const metadata: Metadata = { title: "Usuarios" };

export type Miembro = { id: string; usuario_id: string; correo: string; nombre: string | null; rol: Rol; activo: boolean; acceso_clinico: boolean; empresas: string[] | null; usuario?: string | null };

export default async function Usuarios() {
  const [sesion, empresas] = await Promise.all([obtenerSesion(), listarEmpresas()]);
  const esAdmin = !sesion.demo && sesion.rol === "administrador";
  let miembros: Miembro[] = [];
  let invitaciones: Invitacion[] = [];
  let contactos: { empresa_id: string; nombre: string; telefono: string }[] = [];
  if (supabaseConfigurado && !sesion.demo) {
    const supabase = await crearClienteServidor();
    const [{ data }, inv, { data: cts }] = await Promise.all([
      supabase.rpc("miembros_con_correo"),
      esAdmin ? listarInvitaciones() : Promise.resolve([]),
      esAdmin ? supabase.from("empresa_contactos").select("empresa_id, nombre, telefono").eq("activo", true).not("telefono", "is", null) : Promise.resolve({ data: [] }),
    ]);
    miembros = (data ?? []) as Miembro[];
    invitaciones = inv;
    contactos = (cts ?? []) as typeof contactos;
  }
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Volver />
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Usuarios y roles</h1>
        <p className="text-muted-foreground">
          Cada persona crea su cuenta en la pantalla de ingreso; luego la agregas aquí con su rol. La historia clínica solo la ven médico, enfermería y gerente médico.
        </p>
      </div>
      {esAdmin && empresas.length > 0 && (
        <InvitarRrhh
          empresas={empresas.map((e) => ({ id: e.id, nombre: e.razonSocial, contactos: contactos.filter((c) => c.empresa_id === e.id).map((c) => ({ nombre: c.nombre, telefono: c.telefono })) }))}
          invitaciones={invitaciones}
        />
      )}
      <GestionUsuarios empresas={empresas.map((e) => ({ id: e.id, nombre: e.razonSocial }))} miembros={miembros} yo={sesion.usuarioId} esAdmin={esAdmin} />
    </div>
  );
}
