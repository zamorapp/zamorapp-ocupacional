import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { fetchMedido } from "@/lib/tiempos";
import { COOKIE_EQUIPO, cabecerasEquipo } from "@/lib/equipo-confianza";

export async function crearClienteServidor() {
  const almacen = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: { headers: cabecerasEquipo(almacen.get(COOKIE_EQUIPO)?.value), fetch: fetchMedido },
      cookies: {
        getAll: () => almacen.getAll(),
        setAll: (lista) => {
          try {
            lista.forEach(({ name, value, options }) => almacen.set(name, value, options));
          } catch {
            // Llamado desde un Server Component: el middleware refresca la sesión.
          }
        },
      },
    },
  );
}
