import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { obtenerConsulta } from "@/lib/consultas";
import { opciones } from "@/lib/listas";
import { obtenerSesion } from "@/lib/sesion";
import { listarAdjuntos } from "@/lib/adjuntos";
import { EditorConsulta } from "./editor-consulta";

export const metadata: Metadata = { title: "Consulta" };
export const dynamic = "force-dynamic";

const LISTAS = [
  "motivo_consulta", "clasificacion_aptitud", "limitacion_ocupacional", "paraclinico", "antecedente_medico",
  "causa_reposo", "ente_emisor_reposo", "sistema_organico", "medicina", "presentacion_medicina", "via_administracion",
  "frecuencia_dosis", "duracion_tratamiento", "especialidad", "perfil_examen_fisico", "perfil_examen_funcional", "grupo_paraclinicos", "recomendacion_aptitud", "recomendacion_empresa", "recomendacion_paciente",
];

export default async function Consulta({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sesion = await obtenerSesion();
  const [consulta, listas] = await Promise.all([obtenerConsulta(id), opciones(sesion.orgId, LISTAS)]);
  if (!consulta) notFound();
  const adjuntos = sesion.demo || !sesion.orgId ? null : { orgId: sesion.orgId, lista: await listarAdjuntos(consulta.trabajador.id) };

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <Link href="/atencion" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Atención médica
      </Link>
      <EditorConsulta inicial={consulta.datos} trabajador={consulta.trabajador} medico={consulta.medico} listas={listas} adjuntos={adjuntos} />
    </div>
  );
}
