"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

const VERSION = process.env.NEXT_PUBLIC_VERSION_WEB ?? "";
// Caché de la pantalla sin internet (/movil, public/sw.js): no se borra al actualizar
const CACHE_MOVIL = "zamorapp-movil-v1";

async function versionPublicada() {
  const r = await fetch("/api/hora", { cache: "no-store" }).catch(() => null);
  const j = r?.ok ? ((await r.json().catch(() => null)) as { version?: string } | null) : null;
  return j?.version || null;
}

/** Trae la versión nueva: renueva el service worker, borra los archivos guardados (menos /movil) y recarga. */
export async function actualizarApp() {
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    await reg?.update();
    if ("caches" in window) for (const k of await caches.keys()) if (k !== CACHE_MOVIL) await caches.delete(k);
  } catch {
    // Igual se recarga: la página se pide siempre a la red
  }
  location.reload();
}

function useVersionNueva() {
  const [nueva, setNueva] = useState(false);
  const revisar = useCallback(async () => {
    if (!VERSION || !navigator.onLine) return;
    const publicada = await versionPublicada();
    setNueva(Boolean(publicada && publicada !== VERSION));
  }, []);
  useEffect(() => {
    if (process.env.NEXT_PUBLIC_ESCRITORIO === "1") return;
    revisar();
    // Una app abierta en el celular puede quedar días en segundo plano: se revisa cada vez que vuelve al frente
    const alVolver = () => document.visibilityState === "visible" && revisar();
    document.addEventListener("visibilitychange", alVolver);
    return () => document.removeEventListener("visibilitychange", alVolver);
  }, [revisar]);
  return nueva;
}

/** Franja abajo cuando hay una versión nueva publicada: un toque y queda al día. */
export function AvisoVersionNueva() {
  const nueva = useVersionNueva();
  const [trabajando, setTrabajando] = useState(false);
  if (!nueva) return null;
  return (
    <div role="status" className="fixed inset-x-3 bottom-20 z-50 mx-auto flex max-w-md items-center justify-between gap-3 rounded-xl border bg-card p-3 shadow-lg sm:bottom-4">
      <span className="text-sm font-medium">Hay una versión nueva de zamorApp</span>
      <Button size="sm" disabled={trabajando} onClick={() => { setTrabajando(true); actualizarApp(); }}>
        <RefreshCw className={trabajando ? "animate-spin" : undefined} /> Actualizar
      </Button>
    </div>
  );
}

/** Línea de Mi perfil: qué versión se está usando y un botón para buscar la nueva. */
export function VersionApp() {
  const nueva = useVersionNueva();
  const [trabajando, setTrabajando] = useState(false);
  if (process.env.NEXT_PUBLIC_ESCRITORIO === "1") return null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border p-4 text-sm">
      <span className="text-muted-foreground">
        Versión de la app: <span className="font-mono">{VERSION || "local"}</span>
        {nueva ? " · hay una más nueva" : " · al día"}
      </span>
      <Button variant="outline" size="sm" disabled={trabajando} onClick={() => { setTrabajando(true); actualizarApp(); }}>
        <RefreshCw className={trabajando ? "animate-spin" : undefined} /> Actualizar la app
      </Button>
    </div>
  );
}
