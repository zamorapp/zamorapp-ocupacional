"use client";

import { useEffect } from "react";

/** Registra el service worker para que la app se pueda instalar en escritorio, celular o tablet. */
export function RegistroSW() {
  useEffect(() => {
    // Solo en producción: en desarrollo los archivos no cambian de nombre y la caché mostraría versiones viejas
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);
  return null;
}
