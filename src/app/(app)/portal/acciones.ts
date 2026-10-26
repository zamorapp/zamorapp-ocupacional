"use server";

import { revalidatePath } from "next/cache";
import { obtenerSesion } from "@/lib/sesion";
import { crearClienteServidor } from "@/lib/supabase/server";

export type Resultado = { ok: boolean; mensaje: string };

const texto = (d: FormData, k: string) => String(d.get(k) ?? "").trim() || null;

// La empresa pide la cita; el servicio médico la confirma o reprograma
const TOPE_LOTE = 200;

// Una o varias citas con la misma fecha y motivo, en un solo insert. La RLS decide qué trabajadores ve el usuario:
// los que no aparecen (otra empresa o borrados) se informan como rechazados.
export async function solicitarCita(_: Resultado | null, datos: FormData): Promise<Resultado> {
  const sesion = await obtenerSesion();
  if (sesion.demo || !sesion.orgId) return { ok: false, mensaje: "No disponible en modo demo." };
  const ids = [...new Set(datos.getAll("trabajador_id").map(String).filter(Boolean))];
  const fecha = texto(datos, "fecha");
  if (!ids.length || !fecha) return { ok: false, mensaje: "Elige al menos un trabajador y la fecha." };
  if (ids.length > TOPE_LOTE) return { ok: false, mensaje: `Máximo ${TOPE_LOTE} trabajadores por solicitud.` };
  const hoy = new Date().toLocaleDateString("en-CA", { timeZone: "America/Caracas" });
  if (fecha < hoy) return { ok: false, mensaje: "La fecha ya pasó." };

  const supabase = await crearClienteServidor();
  const { data: visibles } = await supabase.from("trabajadores").select("id, empresa_id").in("id", ids);
  const validos = visibles ?? [];
  const rechazados = ids.length - validos.length;
  if (!validos.length) return { ok: false, mensaje: "Ninguno de los trabajadores elegidos pertenece a tus empresas." };

  const comun = {
    org_id: sesion.orgId,
    fecha,
    hora: texto(datos, "hora"),
    motivo_id: texto(datos, "motivo_id"),
    nota_empresa: texto(datos, "nota"),
    estado: "solicitada" as const,
    origen: "portal" as const,
    solicitada_por: sesion.usuarioId,
  };
  const { error } = await supabase.from("citas").insert(validos.map((t) => ({ ...comun, empresa_id: t.empresa_id, trabajador_id: t.id })));
  if (error) return { ok: false, mensaje: error.code === "42501" ? "Tu usuario no puede solicitar citas para esta empresa." : error.message };
  revalidatePath("/portal");
  const n = validos.length;
  return {
    ok: true,
    mensaje: `${n === 1 ? "Solicitud enviada" : `${n} solicitudes enviadas`} al servicio médico.${rechazados ? ` ${rechazados} no se enviaron: no pertenecen a tus empresas.` : ""}`,
  };
}

export async function cancelarSolicitud(id: string): Promise<Resultado> {
  const supabase = await crearClienteServidor();
  const { error } = await supabase.from("citas").update({ estado: "cancelada" }).eq("id", id).eq("estado", "solicitada");
  if (error) return { ok: false, mensaje: error.message };
  revalidatePath("/portal");
  return { ok: true, mensaje: "" };
}
