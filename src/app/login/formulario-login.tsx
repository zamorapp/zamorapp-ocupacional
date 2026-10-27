"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, MailCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { crearClienteNavegador } from "@/lib/supabase/client";
import { BotonEntrarHuella, OfrecerHuella } from "@/components/app/huella";
import { huellaActivaAqui, huellaDisponible, ofrecerHuella } from "@/lib/huella";

type Modo = "ingresar" | "registro" | "recuperar";

export function FormularioLogin({ modoDemo }: { modoDemo: boolean }) {
  const router = useRouter();
  const [modo, setModo] = useState<Modo>("ingresar");
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detalle, setDetalle] = useState<string | null>(null); // qué respondió exactamente el servicio, para soporte
  const [confirmar, setConfirmar] = useState<string | null>(null);
  const [ofrecer, setOfrecer] = useState(false);

  const alPanel = () => {
    router.replace("/panel");
    router.refresh();
  };

  // Mensaje claro para cada caso: clave equivocada, demasiados intentos, sin internet o sin conexión con el servicio.
  function mensajeIngreso(error: { message: string; code?: string; status?: number; name?: string }) {
    if (error.message.includes("not confirmed")) return "Confirma tu correo antes de ingresar.";
    if (error.name === "AuthRetryableFetchError" || !error.status) return "No se pudo conectar con el servicio de zamorApp. Revisa la conexión y vuelve a intentar.";
    // Avisos propios del programa de escritorio (ya vienen en español) y límites de intentos
    if (["over_request_rate_limit", "session_expired", "user_banned", "offline", "offline_first_login"].includes(error.code ?? "")) return error.message;
    if (error.status === 429) return "Demasiados intentos. Espera unos minutos y vuelve a probar.";
    if (error.status >= 500) return "El servicio no respondió. Vuelve a intentar en un momento.";
    return "Correo o contraseña incorrectos.";
  }

  // Lo que respondió el servicio, tal cual: aparece en letra pequeña bajo el aviso para que soporte sepa qué pasó
  function detalleTecnico(error: { message: string; code?: string; status?: number; name?: string }) {
    return `${[error.name, error.status, error.code].filter(Boolean).join(" · ")}: ${error.message}`;
  }

  async function enviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setDetalle(null);
    if (modoDemo) {
      router.push("/panel");
      return;
    }
    setCargando(true);
    const datos = new FormData(e.currentTarget);
    const correo = String(datos.get("correo"));
    const clave = String(datos.get("clave"));
    try {
      const supabase = crearClienteNavegador();

      if (modo === "recuperar") {
        const { error } = await supabase.auth.resetPasswordForEmail(correo, { redirectTo: `${window.location.origin}/login/nueva-clave` });
        if (error) {
          setError(error.message.includes("rate") ? "Ya enviamos un correo hace poco. Espera un minuto y vuelve a intentar." : "No se pudo enviar el correo. Revisa la dirección.");
          setDetalle(detalleTecnico(error));
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
        if (error) {
          setError(error.message.includes("already") ? "Ese correo ya tiene cuenta." : "No se pudo crear la cuenta. La contraseña debe tener al menos 6 caracteres.");
          setDetalle(detalleTecnico(error));
          return;
        }
        if (!data.session) {
          setConfirmar(correo);
          return;
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email: correo, password: clave });
        if (error) {
          setError(mensajeIngreso(error));
          setDetalle(detalleTecnico(error));
          return;
        }
        // Recién entró con la contraseña: se le ofrece (una vez) entrar con huella la próxima vez
        if (ofrecerHuella() && (await huellaDisponible()) && !(await huellaActivaAqui())) {
          setOfrecer(true);
          return;
        }
      }
    } catch (e) {
      // Un fallo antes de llegar al servicio (p. ej. una API que el navegador no ofrece) no puede quedar mudo
      setError("No se pudo iniciar el ingreso en este equipo.");
      setDetalle(e instanceof Error ? `${e.name}: ${e.message}` : String(e));
      return;
    } finally {
      setCargando(false);
    }
    alPanel();
  }

  if (ofrecer) return <OfrecerHuella alTerminar={alPanel} />;

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
      {modo === "ingresar" && !modoDemo && <BotonEntrarHuella alEntrar={alPanel} />}
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
      {error && (
        <div role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <p>{error}</p>
          {detalle && <p className="mt-1 break-words text-xs opacity-75">Detalle técnico: {detalle}</p>}
        </div>
      )}
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
