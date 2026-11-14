"use server";

import { supabaseConfigurado } from "@/lib/config";
import { crearClienteServidor } from "@/lib/supabase/server";

// Recordatorios de citas (20261030955000): 3 días, 1 día y 1 hora antes (se cambian en Configuración › Organización ›
// Plazos y avisos). La campana lo llama cada minuto mientras zamorApp está abierto; en el escritorio sin internet lo
// calcula la copia de la PC (constancia de la campana, escritorio/puerta) y sale como aviso de Windows. Con la app
// cerrada lo corre el latido de la nube (celular y correo). Solo es un aviso: si falla, no pasa nada.
export async function recordarCitas(): Promise<void> {
  if (!supabaseConfigurado) return;
  try {
    const supabase = await crearClienteServidor();
    await supabase.rpc("recordar_citas");
  } catch {
    // Sin aviso esta vez; el siguiente minuto lo intenta de nuevo
  }
}
