import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { obtenerSesion } from "@/lib/sesion";
import { crearClienteServidor } from "@/lib/supabase/server";
import { Volver } from "../volver";
import { EditorPrestadores, type Prestador } from "./editor";

export const metadata: Metadata = { title: "Prestadores de exámenes" };

export default async function Prestadores() {
  const sesion = await obtenerSesion();
  if (sesion.demo || !sesion.orgId || !sesion.clinico || !["administrador", "gerente_medico"].includes(sesion.rol ?? "")) notFound();
  const { data, error } = await (await crearClienteServidor()).from("prestadores_examenes")
    .select("id, nombre, correo, activo").eq("org_id", sesion.orgId).order("nombre");
  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <Volver />
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Prestadores de exámenes</h1>
      <p className="text-muted-foreground">Registra los correos que el servicio ha autorizado para recibir órdenes.</p>
      {error ? <p role="alert" className="text-sm text-alerta-texto">No se pudo cargar el directorio. Requiere conexión.</p>
        : <EditorPrestadores prestadores={(data ?? []) as Prestador[]} />}
    </div>
  );
}
