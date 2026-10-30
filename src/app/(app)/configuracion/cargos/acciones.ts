"use server";

import { revalidatePath } from "next/cache";
import { invalidarEmpresas } from "@/lib/empresas";
import { olvidar } from "@/lib/memo";
import { obtenerSesion } from "@/lib/sesion";
import { crearClienteServidor } from "@/lib/supabase/server";

export type ResultadoUnir = { ok: boolean; mensaje: string };

// En cada empresa queda un solo cargo con ese nombre; la base revisa el rol y deja alias (nada se borra).
// En el escritorio va a la nube: sin internet la puerta responde «sin conexión».
export async function unirCargos(nombre: string, puestos: string[]): Promise<ResultadoUnir> {
  const sesion = await obtenerSesion();
  if (sesion.demo) return { ok: false, mensaje: "En modo demo no se guardan datos." };
  if (sesion.rol !== "administrador") return { ok: false, mensaje: "Solo el administrador une cargos." };
  if (!nombre.trim() || puestos.length < 2) return { ok: false, mensaje: "Elige al menos dos variantes y el nombre que queda." };
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.rpc("unir_cargos", { p_nombre: nombre.trim(), p_puestos: puestos });
  if (error) {
    const sinRed = error.code === "OFFLINE" || error.code === "0A000" || /sin conexi|internet/i.test(error.message);
    return { ok: false, mensaje: sinRed ? "Unir cargos necesita internet. Vuelve a intentarlo con conexión." : error.message };
  }
  const r = data as { empresas: number; trabajadores: number; consultas: number };
  revalidatePath("/", "layout");
  invalidarEmpresas();
  olvidar("");
  return {
    ok: true,
    mensaje: `Listo: «${nombre.trim()}» en ${r.empresas} ${r.empresas === 1 ? "empresa" : "empresas"}; ${r.trabajadores} ${r.trabajadores === 1 ? "trabajador cambió" : "trabajadores cambiaron"} de variante.`,
  };
}
