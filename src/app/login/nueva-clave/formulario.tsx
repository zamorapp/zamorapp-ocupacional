"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { crearClienteNavegador } from "@/lib/supabase/client";

// Llega desde el enlace del correo de recuperación (?code=…); el cliente canjea el código por una sesión
export function FormularioNuevaClave() {
  const router = useRouter();
  const [listo, setListo] = useState<"esperando" | "si" | "no">("esperando");
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = crearClienteNavegador();
    const codigo = new URLSearchParams(window.location.search).get("code");
    (async () => {
      if (codigo) await supabase.auth.exchangeCodeForSession(codigo);
      const { data } = await supabase.auth.getSession();
      setListo(data.session ? "si" : "no");
    })();
  }, []);

  async function guardar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const datos = new FormData(e.currentTarget);
    const clave = String(datos.get("clave"));
    if (clave !== String(datos.get("repetir"))) { setError("Las dos contraseñas no coinciden."); return; }
    setCargando(true);
    setError(null);
    const { error } = await crearClienteNavegador().auth.updateUser({ password: clave });
    setCargando(false);
    if (error) {
      setError(error.message.includes("different") ? "Debe ser distinta a la anterior." : "No se pudo guardar. Usa al menos 8 caracteres.");
      return;
    }
    router.replace("/panel");
    router.refresh();
  }

  if (listo === "esperando") return <Loader2 className="mx-auto animate-spin text-muted-foreground" />;
  if (listo === "no") {
    return (
      <div className="space-y-4 text-sm">
        <p>El enlace venció o ya se usó. Pide uno nuevo desde «¿La olvidaste?» en la pantalla de ingreso, y ábrelo en este mismo navegador.</p>
        <Button className="w-full" onClick={() => router.replace("/login")}>Ir al ingreso</Button>
      </div>
    );
  }
  return (
    <form onSubmit={guardar} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="clave">Contraseña nueva</Label>
        <Input id="clave" name="clave" type="password" autoComplete="new-password" minLength={8} required className="h-11" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="repetir">Repítela</Label>
        <Input id="repetir" name="repetir" type="password" autoComplete="new-password" minLength={8} required className="h-11" />
      </div>
      <p className="text-xs text-muted-foreground">Usa al menos 8 caracteres; mejor una frase fácil de recordar para ti y difícil de adivinar.</p>
      {error && <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
      <Button type="submit" className="h-11 w-full" disabled={cargando}>{cargando && <Loader2 className="animate-spin" />} Guardar y entrar</Button>
    </form>
  );
}
