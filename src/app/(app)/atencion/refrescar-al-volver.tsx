"use client";

import { useEffect, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

// La cola se pide de nuevo al volver con Atrás/Adelante o al regresar a la pestaña: así nunca queda vieja,
// aunque guardar una consulta ya no recargue toda la app. No bloquea: solo un aviso pequeño mientras llega.
// Nunca compara la hora del servidor con la de la PC (Cesar cambia la fecha de Windows para abrir el SAME):
// «generada» solo identifica cada versión de la cola. Si ya se mostró antes, esta vista viene de la caché
// (Atrás/Adelante dentro de la app) y se actualiza; la versión nueva que llega aún no está vista, así que no
// hay bucle. Los tiempos fuera de la pestaña se miden con performance.now(), que no depende del reloj.
const vistas = new Set<number>();

export function RefrescarAlVolver({ generada }: { generada: number }) {
  const router = useRouter();
  const [actualizando, iniciar] = useTransition();
  const ocultaDesde = useRef<number | null>(null);

  useEffect(() => {
    // Un solo refresh por montaje, pase lo que pase
    let usado = false;
    const refrescar = () => {
      if (usado) return;
      usado = true;
      iniciar(() => router.refresh());
    };
    if (vistas.has(generada)) refrescar();
    else vistas.add(generada);
    const alMostrar = (e: PageTransitionEvent) => { if (e.persisted) refrescar(); };
    const alCambiar = () => {
      if (document.visibilityState === "hidden") ocultaDesde.current = performance.now();
      else if (ocultaDesde.current !== null) {
        // Volver a la pestaña tras unos segundos fuera (otra persona pudo atender o cerrar consultas)
        if (performance.now() - ocultaDesde.current > 3000) refrescar();
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
