import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { historialConsulta, listarVersiones, obtenerConsulta } from "@/lib/consultas";
import { plantillasDeOrg } from "@/lib/plantillas-servidor";
import { opciones } from "@/lib/listas";
import { obtenerSesion } from "@/lib/sesion";
import { listarAdjuntos } from "@/lib/adjuntos";
import { alertasDeTrabajador } from "@/lib/alertas";
import { datosOrganizacion } from "@/lib/organizacion";
import { hoyCaracas } from "@/lib/fecha";
import { PLANTILLA_APTITUD } from "@/lib/mensajes";
import { crearClienteServidor } from "@/lib/supabase/server";
import { supabaseConfigurado } from "@/lib/config";
import { EditorConsulta } from "./editor-consulta";
import { declaracionesDeConsulta } from "../../accidentes/acciones";
import { siguienteEnEspera } from "@/lib/citas";

export const metadata: Metadata = { title: "Consulta" };
export const dynamic = "force-dynamic";

const LISTAS = [
  "motivo_consulta", "clasificacion_aptitud", "limitacion_ocupacional", "paraclinico", "antecedente_medico",
  "causa_reposo", "ente_emisor_reposo", "sistema_organico", "medicina", "presentacion_medicina", "via_administracion",
  "frecuencia_dosis", "duracion_tratamiento", "especialidad", "perfil_examen_fisico", "perfil_examen_funcional", "grupo_paraclinicos", "recomendacion_aptitud", "recomendacion_empresa", "recomendacion_paciente", "modelo_informe_libre",
  "declaracion_ocupacional", "diagnostico_declarable", "resultado_reubicacion",
];

export default async function Consulta({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ paso?: string }> }) {
  const [{ id }, { paso }] = await Promise.all([params, searchParams]);
  const demo = !supabaseConfigurado;
  // Todo en dos ramas paralelas: lo que depende de la organización (sesión → listas, plantillas, datos) y lo que
  // depende del trabajador (consulta → historial, adjuntos). Antes eran 6 esperas en fila; ahora la más larga es 3.
  const porOrg = obtenerSesion().then((sesion) => Promise.all([sesion, opciones(sesion.orgId, LISTAS), plantillasDeOrg(sesion.orgId), datosOrganizacion()]));
  const porTrabajador = obtenerConsulta(id).then((consulta) => Promise.all([
    consulta,
    !consulta || demo ? { mediciones: [], reposos: [], discapacidadRegistrada: false } : historialConsulta(consulta.trabajador.id, id),
    !consulta || demo ? null : listarAdjuntos(consulta.trabajador.id),
    !consulta || demo ? [] : alertasDeTrabajador(consulta.trabajador.id, id),
  ]));
  const [[sesion, listas, plantillas, org], [consulta, historial, listaAdjuntos, alertas], versiones, contacto, declaraciones, siguiente] = await Promise.all([
    porOrg,
    porTrabajador,
    demo ? [] : listarVersiones(id),
    // Contacto de RR. HH. de la empresa para enviar el resultado de aptitud
    demo ? null : crearClienteServidor().then((s) => s.from("consultas").select("empresas(telefono, correo)").eq("id", id).maybeSingle()).then((r) => (r.data?.empresas ?? null) as unknown as { telefono: string | null; correo: string | null } | null),
    // Declaraciones de enfermedad ocupacional ya iniciadas desde esta consulta (aviso del paso Diagnóstico)
    declaracionesDeConsulta(id),
    // Primero en espera hoy: «Siguiente paciente» al cerrar o firmar
    demo ? null : siguienteEnEspera(),
  ]);
  if (!consulta) notFound();
  const envio = { servicio: org.nombre, plantilla: org.ajustes.mensaje_aptitud ?? PLANTILLA_APTITUD, telefono: contacto?.telefono ?? null, correo: contacto?.correo ?? null };
  // Mismo criterio que validar_firma() en la base: el autor, el gerente médico o el administrador con acceso clínico; nunca enfermería
  const puedeFirmar = sesion.clinico && sesion.rol !== "enfermeria" &&
    (!consulta.medicoId || consulta.medicoId === sesion.usuarioId || sesion.rol === "gerente_medico" || sesion.rol === "administrador");
  const adjuntos = sesion.demo || !sesion.orgId || !listaAdjuntos ? null : { orgId: sesion.orgId, lista: listaAdjuntos };
  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <Link href="/atencion" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Atención médica
      </Link>
      <EditorConsulta inicial={consulta.datos} trabajador={consulta.trabajador} medico={consulta.medico} listas={listas} adjuntos={adjuntos} envio={envio} puedeFirmar={puedeFirmar} versiones={versiones} historial={historial} plantillas={plantillas} nueva={consulta.nueva} pasoInicial={paso} declaraciones={declaraciones} siguiente={siguiente} hoy={hoyCaracas()} registrada={consulta.registrada}
        puedeCambiarFecha={["medico", "gerente_medico", "administrador"].includes(sesion.rol ?? "")} diasAvisoFecha={org.ajustes.dias_aviso_fecha_futura ?? 90}
        alertas={sesion.clinico ? alertas : []} puedeRevisarAlertas={sesion.clinico && ["medico", "gerente_medico", "administrador"].includes(sesion.rol ?? "")} />
    </div>
  );
}
