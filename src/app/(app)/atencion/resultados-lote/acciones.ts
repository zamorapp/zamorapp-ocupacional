"use server";

import type { Paraclinico } from "@/lib/consultas-tipos";
import { hoyCaracas, sumarDias } from "@/lib/fecha";
import { contarResultados } from "@/lib/paraclinicos";
import { obtenerSesion } from "@/lib/sesion";
import { crearClienteServidor } from "@/lib/supabase/server";

export type Candidata = {
  consultaId: string; fecha: string; estado: string; orgId: string; pendientes: number; paraclinicos: Paraclinico[];
  trabajador: { id: string; nombre: string; cedula: string; sexo: string | null };
};

const solo = (s: string) => s.replace(/^\s*[VEJPGvejpg]\s*[-.:]?\s*/, "").replace(/\D/g, "");

// Consultas de los últimos 90 días con exámenes solicitados, por cédula leída en el PDF del laboratorio.
// La RLS decide qué trabajadores y consultas ve quien pregunta; aquí solo se cruza por cédula.
export async function consultasPorCedula(cedulas: string[]): Promise<Record<string, Candidata[]>> {
  const sesion = await obtenerSesion();
  if (sesion.demo || !sesion.clinico) return {};
  const buscadas = [...new Set(cedulas.map(solo).filter((d) => d.length >= 5 && d.length <= 10))].slice(0, 40);
  if (!buscadas.length) return {};
  const supabase = await crearClienteServidor();
  const { data: trabajadores } = await supabase.from("trabajadores").select("id, nombres, apellidos, cedula, sexo")
    .or(buscadas.map((d) => `cedula.ilike.%${d}`).join(",")).limit(200);
  const porId = new Map((trabajadores ?? []).filter((t) => buscadas.includes(solo(t.cedula ?? ""))).map((t) => [t.id, t]));
  if (!porId.size) return {};
  const { data: consultas } = await supabase.from("consultas").select("id, fecha, estado, org_id, trabajador_id, paraclinicos")
    .in("trabajador_id", [...porId.keys()]).is("origen", null).neq("paraclinicos", "[]")
    .gte("fecha", sumarDias(hoyCaracas(), -90)).order("fecha", { ascending: false }).limit(300);
  const r: Record<string, Candidata[]> = {};
  for (const c of consultas ?? []) {
    const t = porId.get(c.trabajador_id)!;
    const lista = (c.paraclinicos ?? []) as Paraclinico[];
    (r[solo(t.cedula)] ??= []).push({
      consultaId: c.id, fecha: c.fecha, estado: c.estado, orgId: c.org_id, pendientes: contarResultados(lista).pendientes, paraclinicos: lista,
      trabajador: { id: t.id, nombre: `${t.nombres} ${t.apellidos}`.trim(), cedula: t.cedula, sexo: t.sexo },
    });
  }
  // Primero la más reciente con resultados pendientes
  for (const k in r) r[k].sort((a, b) => Number(b.pendientes > 0) - Number(a.pendientes > 0) || b.fecha.localeCompare(a.fecha));
  return r;
}
