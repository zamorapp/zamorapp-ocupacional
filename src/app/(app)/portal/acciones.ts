"use server";

import { revalidatePath } from "next/cache";
import { invalidarEmpresas } from "@/lib/empresas";
import { normalizarCedula } from "@/lib/importar";
import { obtenerSesion } from "@/lib/sesion";
import { crearClienteServidor } from "@/lib/supabase/server";
import { hoyCaracas } from "@/lib/fecha";

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
  const nuevos = leerNuevos(datos);
  const fecha = texto(datos, "fecha");
  if ((!ids.length && !nuevos.length) || !fecha) return { ok: false, mensaje: "Elige al menos un trabajador y la fecha." };
  if (ids.length + nuevos.length > TOPE_LOTE) return { ok: false, mensaje: `Máximo ${TOPE_LOTE} trabajadores por solicitud.` };
  const hoy = hoyCaracas();
  if (fecha < hoy) return { ok: false, mensaje: "La fecha ya pasó." };

  const supabase = await crearClienteServidor();
  // Trabajadores que aún no están en la nómina: RR. HH. los registra aquí mismo con cédula y nombre (la RLS exige su empresa)
  if (nuevos.length) {
    const empresaId = texto(datos, "empresa_nuevos");
    if (!empresaId) return { ok: false, mensaje: "Elige la empresa de los trabajadores nuevos." };
    // Ids creados aquí, sin pedir las filas de vuelta (las columnas de salud están ocultas: ver crearPaciente)
    const creados = nuevos.map((n) => ({ ...n, id: crypto.randomUUID(), org_id: sesion.orgId, empresa_id: empresaId }));
    const { error } = await supabase.from("trabajadores").insert(creados);
    if (error) {
      if (error.code === "23505") return { ok: false, mensaje: "No se pudo registrar uno de los trabajadores nuevos. Búscalo por cédula; si no aparece, avísale al servicio médico." };
      return { ok: false, mensaje: error.code === "42501" ? "Tu usuario no puede registrar trabajadores en esa empresa." : error.message };
    }
    ids.push(...creados.map((c) => c.id));
  }
  // En tandas de 100 para no pasar el límite de largo de la URL (200 UUID ≈ 7,5 KB)
  const tandas = await Promise.all(
    Array.from({ length: Math.ceil(ids.length / 100) }, (_, i) =>
      supabase.from("trabajadores").select("id, empresa_id").in("id", ids.slice(i * 100, i * 100 + 100)),
    ),
  );
  const validos = tandas.flatMap((t) => t.data ?? []);
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
  invalidarEmpresas();
  revalidatePath("/portal");
  const n = validos.length;
  return {
    ok: true,
    mensaje: `${n === 1 ? "Solicitud enviada" : `${n} solicitudes enviadas`} al servicio médico.${rechazados ? ` ${rechazados} no se enviaron: no pertenecen a tus empresas.` : ""}`,
  };
}

type Nuevo = { cedula: string; nombres: string; apellidos: string };

// «nuevo» llega como JSON por cada trabajador que no está en la nómina; se limpia y se descarta lo incompleto
function leerNuevos(datos: FormData): Nuevo[] {
  const vistos = new Set<string>();
  return datos.getAll("nuevo").flatMap((v) => {
    try {
      const n = JSON.parse(String(v)) as Partial<Nuevo>;
      const cedula = normalizarCedula(String(n.cedula ?? ""));
      const nombres = String(n.nombres ?? "").trim().slice(0, 80);
      const apellidos = String(n.apellidos ?? "").trim().slice(0, 80);
      if (!cedula || !nombres || !apellidos || vistos.has(cedula)) return [];
      vistos.add(cedula);
      return [{ cedula, nombres, apellidos }];
    } catch {
      return [];
    }
  });
}

export async function cancelarSolicitud(id: string): Promise<Resultado> {
  const supabase = await crearClienteServidor();
  const { error } = await supabase.from("citas").update({ estado: "cancelada" }).eq("id", id).eq("estado", "solicitada");
  if (error) return { ok: false, mensaje: error.message };
  invalidarEmpresas();
  revalidatePath("/portal");
  return { ok: true, mensaje: "" };
}
