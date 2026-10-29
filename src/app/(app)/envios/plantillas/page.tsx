import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { listarEmpresas } from "@/lib/empresas";
import { contarEnvios, listarPlantillas } from "@/lib/envios";
import { obtenerSesion } from "@/lib/sesion";
import { PestanasEnvios } from "../pestanas";
import { EditorPlantillas } from "./editor-plantillas";

export const metadata: Metadata = { title: "Plantillas de correo" };
export const dynamic = "force-dynamic";

export default async function Plantillas() {
  const sesion = await obtenerSesion();
  if (!sesion.clinico) notFound();
  const [empresas, plantillas, cuentas] = await Promise.all([listarEmpresas(), listarPlantillas(), contarEnvios()]);

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Envíos a empresas</h1>
        <p className="text-muted-foreground">El asunto y el texto de los correos y mensajes de WhatsApp. Una general para todas las empresas y, si alguna lo pide, la suya.</p>
      </div>
      <PestanasEnvios {...cuentas} />
      <EditorPlantillas
        plantillas={plantillas}
        empresas={empresas.map((e) => ({ id: e.id, nombre: e.razonSocial }))}
        puedeGeneral={sesion.rol === "administrador" || sesion.rol === "gerente_medico"}
      />
    </div>
  );
}
