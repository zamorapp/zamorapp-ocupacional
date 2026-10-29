"use client";

// Escritorio sin internet: lo que solo existe en la nube (enlaces de WhatsApp, invitaciones de RR. HH.) se avisa
// antes de intentarlo, en vez de fallar. En la web siempre hay conexión y no muestra nada.
import { WifiOff } from "lucide-react";
import { useEffect, useState } from "react";
import { ESCRITORIO } from "@/lib/escritorio-actualizar";

const PUERTA = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";

export function useSinInternet(): boolean {
  const [sin, setSin] = useState(false);
  useEffect(() => {
    if (!ESCRITORIO || !PUERTA) return;
    let vivo = true;
    const mirar = async () => {
      try {
        const r = await fetch(`${PUERTA}/zamorapp/estado`, { cache: "no-store" });
        const j = await r.json();
        if (vivo) setSin(j?.enLinea === false);
      } catch { /* si la puerta no responde, no se afirma nada */ }
    };
    mirar();
    const t = setInterval(mirar, 15e3);
    return () => { vivo = false; clearInterval(t); };
  }, []);
  return sin;
}

export function RequiereInternet({ texto }: { texto: string }) {
  return (
    <p role="status" className="flex items-start gap-2 rounded-md bg-aviso/10 px-3 py-2 text-sm text-aviso-texto">
      <WifiOff className="mt-0.5 size-4 shrink-0" aria-hidden /> <span><strong className="font-medium">Requiere internet.</strong> {texto}</span>
    </p>
  );
}
