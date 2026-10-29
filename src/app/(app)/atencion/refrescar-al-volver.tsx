"use client";

import { useEffect, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

// La cola se pide de nuevo al volver con Atrás/Adelante o al regresar a la pestaña: así nunca queda vieja,
// aunque guardar una consulta ya no recargue toda la app. No bloquea: solo un aviso pequeño mientras llega.
// «generada» es la hora en que el servidor armó la cola: si al mostrarse ya tiene más de unos segundos,
// viene de la caché del navegador (Atrás dentro de la app) y se actualiza; si es recién pedida, no se repite.
export function RefrescarAlVolver({ generada }: { generada: number }) {
  const router = useRouter();
  const [actualizando, iniciar] = useTransition();
  const ocultaDesde = useRef<number | null>(null);

  useEffect(() => {
    const refrescar = () => iniciar(() => router.refresh());
    if (Date.now() - generada > 3000) refrescar();
    const alMostrar = (e: PageTransitionEvent) => { if (e.persisted) refrescar(); };
    const alCambiar = () => {
      if (document.visibilityState === "hidden") ocultaDesde.current = Date.now();
      else if (ocultaDesde.current !== null) {
        // Volver a la pestaña tras unos segundos fuera (otra persona pudo atender o cerrar consultas)
        if (Date.now() - ocultaDesde.current > 3000) refrescar();
        ocultaDesde.current = null;
      }
    };
    window.addEventListener("pageshow", alMostrar);
    document.addEventListener("visibilitychange", alCambiar);
    return () => {
      window.removeEventListener("pageshow", alMostrar);
      document.removeEventListener("visibilitychange", alCambiar);
    };
  }, [router, generada]);

  if (!actualizando) return null;
  return (
    <span role="status" className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      <Loader2 className="size-3.5 animate-spin" /> Actualizando…
    </span>
  );
}
