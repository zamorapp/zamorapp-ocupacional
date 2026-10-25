import type { Metadata } from "next";
import { supabaseConfigurado } from "@/lib/config";
import { obtenerSesion, type Rol } from "@/lib/sesion";
import { crearClienteServidor } from "@/lib/supabase/server";
import { Volver } from "../volver";
import { GestionUsuarios } from "./gestion-usuarios";

export const metadata: Metadata = { title: "Usuarios" };

export type Miembro = { id: string; usuario_id: string; correo: string; nombre: string | null; rol: Rol; activo: boolean };

export default async function Usuarios() {
  const sesion = await obtenerSesion();
  let miembros: Miembro[] = [];
  if (supabaseConfigurado && !sesion.demo) {
    const supabase = await crearClienteServidor();
    const { data } = await supabase.rpc("miembros_con_correo");
    miembros = (data ?? []) as Miembro[];
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
      <GestionUsuarios miembros={miembros} yo={sesion.usuarioId} esAdmin={!sesion.demo && sesion.rol === "administrador"} />
    </div>
  );
}
