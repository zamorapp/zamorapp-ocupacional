import type { Metadata } from "next";
import { supabaseConfigurado } from "@/lib/config";
import type { ConsultaPeriodo } from "@/lib/periodos";
import { obtenerSesion } from "@/lib/sesion";
import { crearClienteServidor } from "@/lib/supabase/server";
import { cargarVigilancia } from "@/lib/vigilancia";
import { InformeVigilancia, type OrgInforme } from "./informe";

export const metadata: Metadata = { title: "Informe de vigilancia epidemiológica" };
export const dynamic = "force-dynamic";
// «Enviar a la empresa» genera el PDF de esta página en el servidor
export const maxDuration = 60;

type Props = { searchParams: Promise<ConsultaPeriodo & { empresa?: string; para?: string }> };

export default async function Vigilancia({ searchParams }: Props) {
  const q = await searchParams;
  const sesion = await obtenerSesion();
  const empresaId = q.empresa || null;
  // «para=empresa»: la versión que se envía a RR. HH. (la pone el servidor al enviar): sin discapacidad (#41)
  // y sin cifras pequeñas que identifiquen a alguien en empresas chicas (umbral en Configuración › Organización)
  const paraEmpresa = q.para === "empresa" && Boolean(empresaId);
  const s0 = supabaseConfigurado && !sesion.demo ? await crearClienteServidor() : null;
  const [v, org, logoEmpresa] = await Promise.all([
    cargarVigilancia(sesion, empresaId, q, { paraEmpresa }),
    s0 && sesion.orgId ? s0.from("organizaciones").select("nombre, rif, direccion, telefono, correo, logo, ajustes").eq("id", sesion.orgId).single().then(({ data }) => data as OrgInforme) : null,
    s0 && empresaId ? s0.from("empresas").select("logo").eq("id", empresaId).maybeSingle().then(({ data }) => (data?.logo as string | null) ?? null) : null,
  ]);
  return <InformeVigilancia v={v} org={org} logoEmpresa={logoEmpresa} paraEmpresa={paraEmpresa} puedeEnviar={Boolean(sesion.clinico || sesion.rol === "administrador")} />;
}
