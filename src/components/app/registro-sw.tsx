"use client";

import { useEffect } from "react";

/** Registra el service worker para que la app se pueda instalar en escritorio, celular o tablet. */
export function RegistroSW() {
  useEffect(() => {
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);
  return null;
}
