"use server";

import { revalidatePath } from "next/cache";
import type { Paraclinico } from "@/lib/consultas-tipos";
import { hoyCaracas, sumarDias } from "@/lib/fecha";
import { cedulaLote, normalizarCedula } from "@/lib/ocr/interpretar";
import { contarResultados } from "@/lib/paraclinicos";
import { obtenerSesion } from "@/lib/sesion";
import { crearClienteServidor } from "@/lib/supabase/server";

export type Candidata = {
  consultaId: string; fecha: string; estado: string; orgId: string; pendientes: number; paraclinicos: Paraclinico[];
  trabajador: { id: string; nombre: string; cedula: string; sexo: string | null };
};

export async function consultasPorCedula(cedulas: string[]): Promise<Record<string, Candidata[]>> {
  const sesion = await obtenerSesion();
  if (sesion.demo || !sesion.clinico || !sesion.orgId || sesion.rol === "enfermeria") return {};
  if (!Array.isArray(cedulas) || cedulas.length > 40) throw new Error("La búsqueda acepta hasta 40 cédulas.");
  const buscadas = [...new Set(cedulas.filter((c) => typeof c === "string").map(cedulaLote).filter(Boolean))];
  if (!buscadas.length) return {};

  const supabase = await crearClienteServidor();
  const digitos = [...new Set(buscadas.map(normalizarCedula))];
  const filtro = digitos.map((d) => "cedula.ilike.%" + [...d].join("%") + "%").join(",");
  const { data: trabajadores, error: falloTrabajadores } = await supabase.from("trabajadores").select("id, nombres, apellidos, cedula, sexo")
    .eq("org_id", sesion.orgId).or(filtro).limit(250);
  if (falloTrabajadores) throw new Error("No se pudo buscar a los trabajadores.");
  const porId = new Map((trabajadores ?? []).filter((t) => digitos.includes(normalizarCedula(t.cedula ?? ""))).map((t) => [t.id, t]));
  if (!porId.size) return {};

  const { data: consultas, error: falloConsultas } = await supabase.from("consultas").select("id, fecha, estado, org_id, trabajador_id, paraclinicos")
    .eq("org_id", sesion.orgId).in("trabajador_id", [...porId.keys()]).is("origen", null).neq("paraclinicos", "[]")
    .gte("fecha", sumarDias(hoyCaracas(), -90)).order("fecha", { ascending: false }).limit(300);
  if (falloConsultas) throw new Error("No se pudo consultar la lista de exámenes solicitados.");

  const r: Record<string, Candidata[]> = {};
  for (const c of consultas ?? []) {
    const t = porId.get(c.trabajador_id)!;
    const lista = (c.paraclinicos ?? []) as Paraclinico[];
    const cedula = cedulaLote(t.cedula);
    const numero = normalizarCedula(cedula);
    const coincidencias = buscadas.filter((b) => b === cedula || (b === numero) ||
      (cedula === numero && normalizarCedula(b) === numero));
    for (const b of coincidencias) {
      (r[b] ??= []).push({
        consultaId: c.id, fecha: c.fecha, estado: c.estado, orgId: c.org_id, pendientes: contarResultados(lista).pendientes, paraclinicos: lista,
        trabajador: { id: t.id, nombre: [t.nombres, t.apellidos].join(" ").trim(), cedula: t.cedula, sexo: t.sexo },
      });
    }
  }
  for (const k in r) r[k].sort((a, b) => Number(b.pendientes > 0) - Number(a.pendientes > 0) || b.fecha.localeCompare(a.fecha));
  return r;
}

export async function registrarResultadosLote(
  consulta: string,
  adjunto: string,
  anteriores: Paraclinico[],
  resultados: Paraclinico[],
  identidad: { cedula: string; coincide: boolean; ignorada: boolean },
): Promise<void> {
  const sesion = await obtenerSesion();
  if (sesion.demo || !sesion.clinico || sesion.rol === "enfermeria") throw new Error("No tienes acceso para registrar resultados.");
  const supabase = await crearClienteServidor();
  const { error } = await supabase.rpc("guardar_lectura_lote", {
    p_consulta: consulta, p_adjunto: adjunto, p_anteriores: anteriores,
    p_resultados: resultados.map((p) => ({ id: p.id, resultado: p.resultado, estado: p.estado ?? "",
      manual: Boolean(p.manual), unidad: p.unidad ?? "", referencia: p.referencia ?? "" })),
    p_cedula: identidad.cedula || null, p_coincide: identidad.coincide, p_ignorada: identidad.ignorada,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/atencion");
  revalidatePath("/panel");
}
