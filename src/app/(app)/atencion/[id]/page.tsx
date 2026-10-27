import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { historialConsulta, listarVersiones, obtenerConsulta } from "@/lib/consultas";
import { plantillasDeOrg } from "@/lib/plantillas-servidor";
import { opciones } from "@/lib/listas";
import { obtenerSesion } from "@/lib/sesion";
import { listarAdjuntos } from "@/lib/adjuntos";
import { datosOrganizacion } from "@/lib/organizacion";
import { PLANTILLA_APTITUD } from "@/lib/mensajes";
import { crearClienteServidor } from "@/lib/supabase/server";
import { EditorConsulta } from "./editor-consulta";

export const metadata: Metadata = { title: "Consulta" };
export const dynamic = "force-dynamic";

const LISTAS = [
  "motivo_consulta", "clasificacion_aptitud", "limitacion_ocupacional", "paraclinico", "antecedente_medico",
  "causa_reposo", "ente_emisor_reposo", "sistema_organico", "medicina", "presentacion_medicina", "via_administracion",
  "frecuencia_dosis", "duracion_tratamiento", "especialidad", "perfil_examen_fisico", "perfil_examen_funcional", "grupo_paraclinicos", "recomendacion_aptitud", "recomendacion_empresa", "recomendacion_paciente", "modelo_informe_libre",
  "declaracion_ocupacional", "diagnostico_declarable",
];

export default async function Consulta({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ paso?: string }> }) {
  const [{ id }, { paso }] = await Promise.all([params, searchParams]);
  const sesion = await obtenerSesion();
  const [consulta, listas, versiones] = await Promise.all([obtenerConsulta(id), opciones(sesion.orgId, LISTAS), sesion.demo ? [] : listarVersiones(id)]);
  if (!consulta) notFound();
  // Contacto de RR. HH. de la empresa para enviar el resultado de aptitud
  const [org, contacto] = await Promise.all([
    datosOrganizacion(),
    sesion.demo ? null : crearClienteServidor().then((s) => s.from("consultas").select("empresas(telefono, correo)").eq("id", id).single()).then((r) => (r.data?.empresas ?? null) as unknown as { telefono: string | null; correo: string | null } | null),
  ]);
  const envio = { servicio: org.nombre, plantilla: org.ajustes.mensaje_aptitud ?? PLANTILLA_APTITUD, telefono: contacto?.telefono ?? null, correo: contacto?.correo ?? null };
  // Mismo criterio que validar_firma() en la base: el autor, el gerente médico o el administrador con acceso clínico; nunca enfermería
  const puedeFirmar = sesion.clinico && sesion.rol !== "enfermeria" &&
    (!consulta.medicoId || consulta.medicoId === sesion.usuarioId || sesion.rol === "gerente_medico" || sesion.rol === "administrador");
  const [historial, plantillas] = await Promise.all([
    sesion.demo ? { mediciones: [], reposos: [], discapacidadRegistrada: false } : historialConsulta(consulta.trabajador.id, id),
    plantillasDeOrg(sesion.orgId),
  ]);
  const adjuntos = sesion.demo || !sesion.orgId ? null : { orgId: sesion.orgId, lista: await listarAdjuntos(consulta.trabajador.id) };

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <Link href="/atencion" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Atención médica
      </Link>
      <EditorConsulta inicial={consulta.datos} trabajador={consulta.trabajador} medico={consulta.medico} listas={listas} adjuntos={adjuntos} envio={envio} puedeFirmar={puedeFirmar} versiones={versiones} historial={historial} plantillas={plantillas} nueva={consulta.nueva} pasoInicial={paso} />
    </div>
  );
}
