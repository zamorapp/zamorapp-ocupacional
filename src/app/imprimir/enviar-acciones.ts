"use server";

import { revalidatePath } from "next/cache";
import { remitenteVisible } from "@/lib/correo";
import { enviarInforme, listarContactos } from "@/lib/envios";
import type { Contacto, EntradaInforme, ResultadoEnvio } from "@/lib/envios-tipos";
import { obtenerSesion } from "@/lib/sesion";

// Contactos de la empresa y correo remitente para el diálogo «Enviar a la empresa» de un informe
export async function datosEnvioInforme(empresaId: string): Promise<{ contactos: Contacto[]; correo: string | null } | null> {
  const sesion = await obtenerSesion();
  if (sesion.demo || !sesion.orgId || (!sesion.clinico && sesion.rol !== "administrador")) return null;
  return { contactos: await listarContactos(empresaId), correo: remitenteVisible() };
}

export async function enviarInformeEmpresa(entrada: EntradaInforme): Promise<ResultadoEnvio> {
  const r = await enviarInforme(entrada);
  revalidatePath("/envios", "layout");
  return r;
}
