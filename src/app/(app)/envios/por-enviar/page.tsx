import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { contarPendientes, listarPlantillas, porEnviar } from "@/lib/envios";
import { obtenerSesion } from "@/lib/sesion";
import { PestanasEnvios } from "../pestanas";
import { Bandeja } from "./bandeja";

export const metadata: Metadata = { title: "Por enviar" };
export const dynamic = "force-dynamic";
// Crear el enlace genera el PDF de las constancias en el servidor
export const maxDuration = 60;

export default async function PorEnviar() {
  const sesion = await obtenerSesion();
  if (!sesion.clinico) notFound();
  const [grupos, plantillas, pendientes] = await Promise.all([porEnviar(), listarPlantillas(), contarPendientes()]);

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Envíos a empresas</h1>
        <p className="text-muted-foreground">Constancias firmadas que aún no le llegan a la empresa. Un toque y sale por WhatsApp desde tu teléfono.</p>
      </div>
      <PestanasEnvios pendientes={pendientes} porEnviar={grupos.reduce((n, g) => n + g.consultas.length, 0)} />
      <Bandeja grupos={grupos} plantillas={plantillas} />
    </div>
  );
}
