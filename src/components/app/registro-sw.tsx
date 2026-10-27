"use client";

import { useEffect } from "react";

/** Registra el service worker para que la app web se pueda instalar en escritorio, celular o tablet. */
export function RegistroSW() {
  useEffect(() => {
    // Solo en producción: en desarrollo los archivos no cambian de nombre y la caché mostraría versiones viejas
    if (!("serviceWorker" in navigator) || process.env.NODE_ENV !== "production") return;
    if (process.env.NEXT_PUBLIC_ESCRITORIO === "1") {
      // Programa de escritorio: la app ya vive en la PC y no necesita service worker. Uno que haya quedado de una
      // versión anterior (con su caché) haría correr archivos viejos tras instalar encima: se quita y se borra.
      navigator.serviceWorker.getRegistrations().then((lista) => lista.forEach((r) => r.unregister())).catch(() => {});
      if ("caches" in window) caches.keys().then((claves) => claves.forEach((k) => caches.delete(k))).catch(() => {});
      return;
    }
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);
  return null;
}
