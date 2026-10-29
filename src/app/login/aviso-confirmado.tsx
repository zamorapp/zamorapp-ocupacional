"use client";

import { useSearchParams } from "next/navigation";
import { Info } from "lucide-react";

// /login?confirmado=1: regreso del correo de confirmación cuando el código no se pudo canjear (otro equipo o navegador).
// Se lee en el cliente para que /login siga siendo estática.
export function AvisoConfirmado() {
  const confirmado = useSearchParams().get("confirmado");
  if (!confirmado) return null;
  return (
    <p role="status" className="flex gap-2 rounded-md bg-info/10 px-3 py-2 text-sm text-info-texto">
      <Info className="mt-0.5 size-4 shrink-0" /> Si ya confirmaste tu correo (o abriste el enlace en otro equipo o navegador), ingresa con tu correo y contraseña.
    </p>
  );
}
