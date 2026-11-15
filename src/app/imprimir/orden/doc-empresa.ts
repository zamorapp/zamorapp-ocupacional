import "server-only";
import { supabaseConfigurado } from "@/lib/config";
import type { AjustesDocumentos } from "@/lib/documentos";
import { ahora } from "@/lib/fecha";
import type { Sesion } from "@/lib/sesion";
import { crearClienteServidor } from "@/lib/supabase/server";

// Membrete de los documentos administrativos para la empresa (orden de evaluación, relación mensual).
// Sin Supabase (demostración) sale un servicio de ejemplo para poder ver el diseño.
export async function docEmpresa(sesion: Sesion, empresaId: string) {
  const impreso = { por: sesion.nombre, el: new Intl.DateTimeFormat("es-VE", { dateStyle: "short", timeStyle: "short", timeZone: "America/Caracas" }).format(new Date(ahora())) };
  if (!supabaseConfigurado || sesion.demo) {
    return {
      org: { nombre: "OcupaVida Salud Ocupacional", rif: "J-50000000-0", direccion: "Maturín, estado Monagas", telefono: "0414-0000000", correo: null, logo: null,
        ajustes: { membrete_titular: "Dr. César Zamora", membrete_credenciales: "Medicina ocupacional" } as AjustesDocumentos },
      empresa: { razon_social: "Construcciones del Oriente, C.A.", rif: "J-40123456-7", logo: null as string | null },
      impreso,
    };
  }
  const supabase = await crearClienteServidor();
  const [{ data: org }, { data: emp }] = await Promise.all([
    supabase.from("organizaciones").select("nombre, rif, direccion, telefono, correo, ajustes, logo").eq("id", sesion.orgId!).single(),
    supabase.from("empresas").select("razon_social, rif, logo").eq("id", empresaId).maybeSingle(),
  ]);
  return {
    org: { ...(org ?? { nombre: sesion.organizacion, rif: null, direccion: null, telefono: null, correo: null, logo: null }), ajustes: (org?.ajustes ?? {}) as AjustesDocumentos },
    empresa: { razon_social: emp?.razon_social ?? "", rif: emp?.rif ?? "", logo: (emp?.logo as string | null) ?? null },
    impreso,
  };
}
