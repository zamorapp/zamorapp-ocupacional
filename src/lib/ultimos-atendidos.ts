import "server-only";
import { listarConsultas } from "@/lib/consultas";
import { obtenerSesion } from "@/lib/sesion";
import type { EstadoConsulta } from "@/lib/consultas-tipos";
import { hoyCaracas, sumarDias } from "@/lib/fecha";
import { fecha as fechaCorta } from "@/lib/pacientes";

// Últimas consultas de TODAS las empresas (sin el filtro de la empresa activa): Inicio y el buscador (Ctrl+K).
// Solo el personal de salud: la consulta es clínica. No lleva diagnósticos ni aptitud, solo quién, cuándo y el motivo.
export type Atendido = { id: string; trabajadorId: string; paciente: string; cedula: string; empresa: string; fecha: string; hora: string; motivo: string | null; estado: EstadoConsulta; cuando: string };

export async function ultimosAtendidos(limite = 8): Promise<Atendido[]> {
  const sesion = await obtenerSesion();
  if (sesion.demo || !sesion.clinico) return [];
  const filas = await listarConsultas({ limite, todas: true });
  const hoy = hoyCaracas();
  const ayer = sumarDias(hoy, -1);
  // «Hoy 10:32», «Ayer 09:15» o «03/11/2026»: se lee de un vistazo
  const cuando = (f: string, h: string) => (f === hoy ? `Hoy ${h}` : f === ayer ? `Ayer ${h}` : fechaCorta(f));
  return filas.map(({ id, trabajadorId, paciente, cedula, empresa, fecha, hora, motivo, estado }) => ({ id, trabajadorId, paciente, cedula, empresa, fecha, hora, motivo, estado, cuando: cuando(fecha, hora) }));
}
