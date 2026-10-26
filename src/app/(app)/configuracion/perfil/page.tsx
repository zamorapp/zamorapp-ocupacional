import type { Metadata } from "next";
import { supabaseConfigurado } from "@/lib/config";
import { ETIQUETA_ROL, obtenerSesion } from "@/lib/sesion";
import { crearClienteServidor } from "@/lib/supabase/server";
import { Volver } from "../volver";
import { FormPerfil } from "./form-perfil";
import { FirmaSello } from "./firma-sello";

export const metadata: Metadata = { title: "Mi perfil" };

export default async function Perfil() {
  const sesion = await obtenerSesion();
  let perfil = null;
  if (supabaseConfigurado && !sesion.demo) {
    const supabase = await crearClienteServidor();
    // Las imágenes de firma y sello no se leen de la tabla: van por firma_sello() (privadas)
    const [{ data }, { data: imagenes }] = await Promise.all([
      supabase
        .from("perfiles")
        .select("nombre_completo, cedula, telefono, mpps, colegio_medicos, registro_inpsasel, especialidad, correo, mostrar_firma, mostrar_sello")
        .eq("id", sesion.usuarioId)
        .maybeSingle(),
      supabase.rpc("firma_sello", { p_usuario: sesion.usuarioId }).maybeSingle(),
    ]);
    perfil = data ? { ...data, ...((imagenes as { firma_url: string | null; sello_url: string | null } | null) ?? { firma_url: null, sello_url: null }) } : null;
  }
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Volver />
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Mi perfil profesional</h1>
        <p className="text-muted-foreground">
          {sesion.correo} · {sesion.rol ? ETIQUETA_ROL[sesion.rol] : "Sin rol"}. Estos datos salen en constancias, reposos y récipes.
        </p>
      </div>
      <FormPerfil perfil={perfil} editable={!sesion.demo} />
      {!sesion.demo && <FirmaSello firma={perfil?.firma_url ?? null} sello={perfil?.sello_url ?? null} mostrarFirma={perfil?.mostrar_firma ?? true} mostrarSello={perfil?.mostrar_sello ?? true} />}
    </div>
  );
}
