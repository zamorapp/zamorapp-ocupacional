"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, MailCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { crearClienteNavegador } from "@/lib/supabase/client";

type Modo = "ingresar" | "registro" | "recuperar";

export function FormularioLogin({ modoDemo }: { modoDemo: boolean }) {
  const router = useRouter();
  const [modo, setModo] = useState<Modo>("ingresar");
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmar, setConfirmar] = useState<string | null>(null);

  async function enviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (modoDemo) {
      router.push("/panel");
      return;
    }
    setCargando(true);
    const datos = new FormData(e.currentTarget);
    const correo = String(datos.get("correo"));
    const clave = String(datos.get("clave"));
    const supabase = crearClienteNavegador();

    if (modo === "recuperar") {
      const { error } = await supabase.auth.resetPasswordForEmail(correo, { redirectTo: `${window.location.origin}/login/nueva-clave` });
      setCargando(false);
      if (error) {
        setError(error.message.includes("rate") ? "Ya enviamos un correo hace poco. Espera un minuto y vuelve a intentar." : "No se pudo enviar el correo. Revisa la dirección.");
        return;
      }
      setConfirmar(correo);
      return;
    }

    if (modo === "registro") {
      const { data, error } = await supabase.auth.signUp({
        email: correo,
        password: clave,
        options: {
          data: { nombre_completo: String(datos.get("nombre")) },
          emailRedirectTo: `${window.location.origin}/panel`,
        },
      });
      setCargando(false);
      if (error) {
        setError(error.message.includes("already") ? "Ese correo ya tiene cuenta." : "No se pudo crear la cuenta. La contraseña debe tener al menos 6 caracteres.");
        return;
      }
      if (!data.session) {
        setConfirmar(correo);
        return;
      }
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email: correo, password: clave });
      setCargando(false);
      if (error) {
        setError(error.message.includes("not confirmed") ? "Confirma tu correo antes de ingresar." : "Correo o contraseña incorrectos.");
        return;
      }
    }
    router.replace("/panel");
    router.refresh();
  }

  if (confirmar) {
    return (
      <div className="space-y-3 rounded-xl border bg-card p-6 text-center">
        <MailCheck className="mx-auto size-10 text-primary" />
        <p className="font-medium">Revisa tu correo</p>
        <p className="text-sm text-muted-foreground">
          {modo === "recuperar"
            ? <>Si <b className="text-foreground">{confirmar}</b> tiene cuenta, le llegará un enlace para crear una contraseña nueva. Revisa también la carpeta de spam.</>
            : <>Enviamos un enlace de confirmación a <b className="text-foreground">{confirmar}</b>. Ábrelo y luego ingresa con tu contraseña.</>}
        </p>
        <Button variant="outline" onClick={() => { setConfirmar(null); setModo("ingresar"); }}>Volver al ingreso</Button>
      </div>
    );
  }

  const registro = modo === "registro";
  const recuperar = modo === "recuperar";

  return (
    <form onSubmit={enviar} className="space-y-5">
      {registro && (
        <div className="space-y-2">
          <Label htmlFor="nombre">Nombre completo</Label>
          <Input id="nombre" name="nombre" autoComplete="name" required className="h-11" />
        </div>
      )}
      <div className="space-y-2">
        <Label htmlFor="correo">Correo</Label>
        <Input id="correo" name="correo" type="email" autoComplete="email" placeholder="medico@empresa.com" required={!modoDemo} className="h-11" />
      </div>
      {recuperar && <p className="text-sm text-muted-foreground">Escribe tu correo y te enviaremos un enlace para crear una contraseña nueva.</p>}
      {!recuperar && <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="clave">Contraseña</Label>
          {!registro && <button type="button" className="text-sm text-primary hover:underline" onClick={() => { setError(null); setModo("recuperar"); }}>¿La olvidaste?</button>}
        </div>
        <Input
          id="clave"
          name="clave"
          type="password"
          autoComplete={registro ? "new-password" : "current-password"}
          minLength={registro ? 8 : undefined}
          required={!modoDemo}
          className="h-11"
        />
      </div>}
      {error && <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
      <Button type="submit" className="h-11 w-full text-base" disabled={cargando}>
        {cargando && <Loader2 className="animate-spin" />}
        {modoDemo ? "Entrar en modo demo" : registro ? "Crear cuenta" : recuperar ? "Enviar enlace" : "Ingresar"}
      </Button>
      {recuperar ? (
        <p className="text-center text-sm">
          <button type="button" className="font-medium text-primary hover:underline" onClick={() => { setError(null); setModo("ingresar"); }}>Volver al ingreso</button>
        </p>
      ) : modoDemo ? (
        <p className="text-center text-sm text-muted-foreground">Supabase aún no está conectado: verás datos de ejemplo.</p>
      ) : (
        <p className="text-center text-sm text-muted-foreground">
          {registro ? "¿Ya tienes cuenta? " : "¿No tienes cuenta? "}
          <button type="button" className="font-medium text-primary hover:underline" onClick={() => { setError(null); setModo(registro ? "ingresar" : "registro"); }}>
            {registro ? "Ingresar" : "Crear cuenta"}
          </button>
        </p>
      )}
    </form>
  );
}
