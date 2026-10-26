"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { crearClienteNavegador } from "@/lib/supabase/client";

// Refresca la pantalla cuando cambian filas de la tabla en la organización (Supabase Realtime, respeta RLS).
// Un canal por pantalla, filtrado por org_id; se cierra al salir. Solo para personal interno.
export function EnVivo({ tabla, orgId }: { tabla: string; orgId: string }) {
  const router = useRouter();
  const espera = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const supabase = crearClienteNavegador();
    const canal = supabase
      .channel(`${tabla}-${orgId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: tabla, filter: `org_id=eq.${orgId}` }, () => {
        // Varias filas que cambian juntas producen un solo refresco
        if (espera.current) clearTimeout(espera.current);
        espera.current = setTimeout(() => router.refresh(), 400);
      })
      .subscribe();
    return () => {
      if (espera.current) clearTimeout(espera.current);
      supabase.removeChannel(canal);
    };
  }, [tabla, orgId, router]);
  return null;
}
