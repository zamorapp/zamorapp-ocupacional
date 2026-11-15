import { createBrowserClient } from "@supabase/ssr";
import { cabecerasEquipo, tokenEquipoNavegador } from "@/lib/equipo-confianza";

export function crearClienteNavegador() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    // Equipo de confianza: la base da por hecho el segundo paso solo con este token (ver equipo-confianza.ts)
    { global: { headers: cabecerasEquipo(tokenEquipoNavegador()) } },
  );
}
