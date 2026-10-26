import type { Metadata } from "next";
import { supabaseConfigurado } from "@/lib/config";
import { obtenerSesion } from "@/lib/sesion";
import { crearClienteServidor } from "@/lib/supabase/server";
import { Volver } from "../volver";
import { FormOrganizacion } from "./form-organizacion";
import { CargarLogo } from "@/components/app/cargar-logo";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { guardarLogoOrganizacion } from "../acciones";

export const metadata: Metadata = { title: "Organización" };

export default async function Organizacion() {
  const sesion = await obtenerSesion();
  let org = null;
  if (supabaseConfigurado && sesion.orgId) {
    const supabase = await crearClienteServidor();
    const { data } = await supabase
      .from("organizaciones")
      .select("nombre, rif, direccion, telefono, correo, ajustes, logo")
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
      <Card>
        <CardHeader><CardTitle className="text-base">Logo del servicio</CardTitle></CardHeader>
        <CardContent className="max-w-md">
          <CargarLogo
            inicial={(org as { logo?: string | null } | null)?.logo ?? null}
            editable={!sesion.demo && sesion.rol === "administrador"}
            guardar={guardarLogoOrganizacion}
            ayuda="Va a la izquierda del membrete en todos los documentos. El logo de cada empresa cliente se carga en su ficha (Empresas) y sale a la derecha."
          />
        </CardContent>
      </Card>
      <FormOrganizacion org={org ?? { nombre: sesion.organizacion, rif: null, direccion: null, telefono: null, correo: null, ajustes: {} }} editable={!sesion.demo && sesion.rol === "administrador"} />
    </div>
  );
}
