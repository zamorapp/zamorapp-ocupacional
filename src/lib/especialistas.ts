import "server-only";

import { crearClienteServidor } from "@/lib/supabase/server";
import type { Especialista } from "@/lib/especialistas-tipos";

// Registro de médicos especialistas para las referencias (Cesar, 19-nov-2026; migración 20261030971000).
// El tipo Especialista y nombreCompleto viven en especialistas-tipos.ts (también los usa el editor, que es cliente)
export type { Especialista };
export { nombreCompleto } from "@/lib/especialistas-tipos";

type Fila = {
  id: string; nombres: string; apellidos: string; especialidad: string;
  direccion: string | null; telefono: string | null; correo: string | null; notas: string | null; activo: boolean;
};
const mapear = (f: Fila): Especialista => ({
  id: f.id, nombres: f.nombres, apellidos: f.apellidos, especialidad: f.especialidad,
  direccion: f.direccion, telefono: f.telefono, correo: f.correo, notas: f.notas, activo: f.activo,
});

// Activos, para el selector de la consulta (y la carta de referencia).
// Sin la tabla (escritorio sin la migración) o sin respuesta: lista vacía, la consulta sigue cargando igual
export async function listarEspecialistas(): Promise<Especialista[]> {
  try {
    const supabase = await crearClienteServidor();
    const { data } = await supabase
      .from("especialistas")
      .select("id, nombres, apellidos, especialidad, direccion, telefono, correo, notas, activo")
      .eq("activo", true)
      .order("especialidad")
      .order("apellidos");
    return ((data ?? []) as Fila[]).map(mapear);
  } catch {
    return [];
  }
}

// Todos (activos e inactivos), para la pantalla de registro
export async function listarTodosEspecialistas(): Promise<Especialista[]> {
  try {
    const supabase = await crearClienteServidor();
    const { data } = await supabase
      .from("especialistas")
      .select("id, nombres, apellidos, especialidad, direccion, telefono, correo, notas, activo")
      .order("especialidad")
      .order("apellidos");
    return ((data ?? []) as Fila[]).map(mapear);
  } catch {
    return [];
  }
}
