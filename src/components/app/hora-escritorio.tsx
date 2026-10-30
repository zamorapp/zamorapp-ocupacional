"use client";

import { useEffect } from "react";
import { fijarDesfase } from "@/lib/fecha";

// Escritorio: la ventana usa la fecha de Windows (Cesar la cambia para abrir el SAME). El desfase con la hora anclada
// llega del servidor antes de pintar (script en <head>) y se vuelve a pedir a la puerta al volver a la ventana, por si
// la fecha de Windows cambió con zamorApp abierto.
export function HoraEscritorio() {
  useEffect(() => {
    const revisar = async () => {
      try {
        // eslint-disable-next-line no-restricted-syntax -- la fecha de Windows es justo lo que se compara
        const antes = Date.now();
        const r = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""}/zamorapp/estado`, { cache: "no-store" });
        const hora = Date.parse((await r.json())?.hora ?? "");
        // eslint-disable-next-line no-restricted-syntax -- ídem
        if (Number.isFinite(hora)) fijarDesfase(hora - (antes + Date.now()) / 2);
      } catch {
        // sin puerta: queda el último desfase
      }
    };
    void revisar(); // las páginas que se armaron al compilar traen desfase 0
    const alVolver = () => { if (document.visibilityState === "visible") void revisar(); };
    document.addEventListener("visibilitychange", alVolver);
    window.addEventListener("focus", alVolver);
    return () => { document.removeEventListener("visibilitychange", alVolver); window.removeEventListener("focus", alVolver); };
  }, []);
  return null;
}
