"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { FormularioLogin } from "@/app/login/formulario-login";
import { crearClienteNavegador } from "@/lib/supabase/client";

// Vuelve del correo de confirmación con ?code=…: lo canjea por una sesión y queda en la invitación lista para aceptar.
// Si se abrió en otro equipo (el código solo sirve en el navegador donde se creó la cuenta), el correo ya quedó
// confirmado: basta ingresar con correo y contraseña.
export function ConfirmarCuenta({ token, codigo }: { token: string; codigo: string }) {
  const router = useRouter();
  const [fallo, setFallo] = useState(false);

  useEffect(() => {
    (async () => {
      const { error } = await crearClienteNavegador().auth.exchangeCodeForSession(codigo);
      if (error) setFallo(true);
      else {
        router.replace(`/invitacion/${token}`);
        router.refresh();
      }
    })();
  }, [codigo, token, router]);

  if (!fallo) return <p className="flex items-center gap-2 border-t pt-5 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Confirmando tu correo…</p>;
  return (
    <div className="space-y-3 border-t pt-5">
      <p className="text-sm font-medium">Tu correo quedó confirmado. Ingresa con tu correo y contraseña para aceptar.</p>
      <FormularioLogin modoDemo={false} siguiente={`/invitacion/${token}`} modoInicial="ingresar" />
    </div>
  );
}
