import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { supabaseConfigurado } from "@/lib/config";
import type { AjustesDocumentos } from "@/lib/documentos";
import { todas } from "@/lib/paginar";
import { obtenerSesion } from "@/lib/sesion";
import { crearClienteServidor } from "@/lib/supabase/server";
import { BarraImpresion } from "../../barra";
import { InformePuesto, type Evaluador } from "../informe-puesto";

export const metadata: Metadata = { title: "Evaluación del puesto de trabajo" };
export const dynamic = "force-dynamic";
// «Enviar a la empresa» genera el PDF de esta página en el servidor
export const maxDuration = 60;

// Página del informe de evaluación del puesto (los datos se cargan aquí; el diseño está en informe-puesto.tsx)
export default async function EvaluacionPuesto({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!supabaseConfigurado || !/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const sesion = await obtenerSesion();
  if (sesion.demo || !sesion.orgId) notFound();
  const supabase = await crearClienteServidor();
  const { data: p } = await supabase
    .from("puestos")
    .select("id, empresa_id, codigo, nombre, descripcion, tareas, herramientas, turno, riesgos, evaluacion, epp, recomendaciones, evaluado_por, evaluado_en, dependencias(nombre)")
    .eq("id", id)
    .maybeSingle();
  if (!p) notFound();

  const [{ data: org }, { data: emp }, expuestos, evaluador] = await Promise.all([
    supabase.from("organizaciones").select("nombre, rif, direccion, telefono, correo, ajustes, logo").eq("id", sesion.orgId).single(),
    supabase.from("empresas").select("razon_social, rif, logo").eq("id", p.empresa_id).single(),
    todas<{ nombres: string; apellidos: string; cedula: string; fecha_ingreso: string | null }>((d, h) =>
      supabase.from("trabajadores").select("nombres, apellidos, cedula, fecha_ingreso", { count: "exact" }).eq("puesto_id", id).in("estado", ["activo", "reposo"]).order("apellidos").range(d, h)),
    p.evaluado_por
      ? Promise.all([
          supabase.from("perfiles").select("nombre_completo, especialidad, mpps, registro_inpsasel, mostrar_firma, mostrar_sello").eq("id", p.evaluado_por).maybeSingle(),
          supabase.rpc("firma_sello", { p_usuario: p.evaluado_por }).maybeSingle(),
        ]).then(([{ data: perfil }, { data: img }]) => (perfil ? { ...perfil, ...((img as { firma_url: string | null; sello_url: string | null } | null) ?? { firma_url: null, sello_url: null }) } : null))
      : Promise.resolve(null),
  ]);

  const doc = {
    org: { ...(org ?? { nombre: sesion.organizacion, rif: null, direccion: null, telefono: null, correo: null, logo: null }), ajustes: (org?.ajustes ?? {}) as AjustesDocumentos },
    empresa: { razon_social: emp?.razon_social ?? "", rif: emp?.rif ?? "", logo: (emp?.logo as string | null) ?? null },
    impreso: { por: sesion.nombre, el: new Intl.DateTimeFormat("es-VE", { dateStyle: "short", timeStyle: "short", timeZone: "America/Caracas" }).format(new Date()) },
  };
  return (
    <div className="min-h-dvh bg-neutral-100 print:bg-white">
      <BarraImpresion volver={`/empresas/${p.empresa_id}`} titulo={`Evaluación del puesto · ${p.nombre}`} envio={(sesion.clinico || sesion.rol === "administrador") ? { documento: "puesto", empresaId: p.empresa_id, empresa: emp?.razon_social ?? "" } : null} />
      <InformePuesto doc={doc} p={{ ...p, dependencia: (p.dependencias as unknown as { nombre: string } | null)?.nombre ?? null }} expuestos={expuestos} ev={evaluador as Evaluador} />
    </div>
  );
}
