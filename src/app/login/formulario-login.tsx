"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { crearClienteNavegador } from "@/lib/supabase/client";

export function FormularioLogin({ modoDemo }: { modoDemo: boolean }) {
  const router = useRouter();
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function ingresar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (modoDemo) {
      router.push("/panel");
      return;
    }
    setCargando(true);
    const datos = new FormData(e.currentTarget);
    const { error } = await crearClienteNavegador().auth.signInWithPassword({
      email: String(datos.get("correo")),
      password: String(datos.get("clave")),
    });
    setCargando(false);
    if (error) {
      setError("Correo o contraseña incorrectos.");
      return;
    }
    router.replace("/panel");
    router.refresh();
  }

  return (
    <form onSubmit={ingresar} className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="correo">Correo</Label>
        <Input id="correo" name="correo" type="email" autoComplete="email" placeholder="medico@empresa.com" required={!modoDemo} className="h-11" />
      </div>
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="clave">Contraseña</Label>
          <button type="button" className="text-sm text-primary hover:underline">¿La olvidaste?</button>
        </div>
        <Input id="clave" name="clave" type="password" autoComplete="current-password" required={!modoDemo} className="h-11" />
      </div>
      {error && <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
      <Button type="submit" className="h-11 w-full text-base" disabled={cargando}>
        {cargando && <Loader2 className="animate-spin" />}
        {modoDemo ? "Entrar en modo demo" : "Ingresar"}
      </Button>
      {modoDemo && (
        <p className="text-center text-sm text-muted-foreground">
          Supabase aún no está conectado: verás datos de ejemplo.
        </p>
      )}
    </form>
  );
}
