import type { Metadata } from "next";
import { supabaseConfigurado } from "@/lib/config";
import { obtenerSesion } from "@/lib/sesion";
import { crearClienteServidor } from "@/lib/supabase/server";
import { Volver } from "../volver";
import { FormOrganizacion } from "./form-organizacion";

export const metadata: Metadata = { title: "Organización" };

export default async function Organizacion() {
  const sesion = await obtenerSesion();
  let org = null;
  if (supabaseConfigurado && sesion.orgId) {
    const supabase = await crearClienteServidor();
    const { data } = await supabase
      .from("organizaciones")
      .select("nombre, rif, direccion, telefono, correo, ajustes")
      .eq("id", sesion.orgId)
      .maybeSingle();
    org = data;
  }
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Volver />
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Organización y documentos</h1>
        <p className="text-muted-foreground">Datos del servicio de salud que aparecen en membretes, constancias y reposos.</p>
      </div>
      <FormOrganizacion org={org ?? { nombre: sesion.organizacion, rif: null, direccion: null, telefono: null, correo: null, ajustes: {} }} editable={!sesion.demo && sesion.rol === "administrador"} />
    </div>
  );
}
