import type { Metadata } from "next";
import Link from "next/link";
import { Building2, CalendarClock, CheckCircle2, FileCheck2, ShieldCheck } from "lucide-react";
import { FormularioLogin } from "@/app/login/formulario-login";
import { APP_NOMBRE, supabaseConfigurado } from "@/lib/config";
import { TOKEN_INVITACION } from "@/lib/invitaciones";
import { crearClienteServidor } from "@/lib/supabase/server";
import { Aceptar } from "./aceptar";

export const metadata: Metadata = { title: "Invitación al portal", robots: { index: false } };
export const dynamic = "force-dynamic";

const AVISO: Record<string, string> = {
  usada: "Esta invitación ya se usó. Si eres tú, ingresa normalmente; si no, pide un enlace nuevo al servicio médico.",
  vencida: "Esta invitación venció. Pide un enlace nuevo al servicio médico.",
  anulada: "Esta invitación fue anulada. Pide un enlace nuevo al servicio médico.",
};

// Enlace que el servicio médico manda por WhatsApp a RR. HH.: muestra la empresa, deja crear la cuenta o ingresar
// ahí mismo y, con sesión, la acepta. Funciona sin cuenta; los datos los decide la base con el token.
export default async function Invitacion({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ confirmado?: string }> }) {
  const [{ token }, { confirmado }] = await Promise.all([params, searchParams]);
  const valido = supabaseConfigurado && TOKEN_INVITACION.test(token);
  const supabase = valido ? await crearClienteServidor() : null;
  const [{ data: filas }, { data: claims }] = supabase
    ? await Promise.all([supabase.rpc("ver_invitacion", { p_token: token }), supabase.auth.getClaims()])
    : [{ data: null }, { data: null }];
  const inv = (filas as { empresa: string; organizacion: string; nombre: string | null; estado: string }[] | null)?.[0];
  const conSesion = Boolean(claims?.claims?.sub);

  return (
    <main className="flex min-h-dvh items-center justify-center bg-muted/30 p-4 sm:p-8">
      <div className="w-full max-w-md space-y-6 rounded-2xl border bg-card p-6 shadow-sm sm:p-8">
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icono.svg" alt="" className="size-10 rounded-xl" />
          <span className="text-lg font-semibold">{APP_NOMBRE}</span>
        </div>
        {!inv ? (
          <div className="space-y-2">
            <h1 className="text-xl font-semibold">Enlace no válido</h1>
            <p className="text-sm text-muted-foreground">Revisa que lo copiaste completo o pide uno nuevo al servicio médico.</p>
          </div>
        ) : (
          <>
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">{inv.organizacion} te invita{inv.nombre ? `, ${inv.nombre.split(" ")[0]},` : ""} al portal de</p>
              <h1 className="flex items-start gap-2 text-2xl font-semibold tracking-tight [overflow-wrap:anywhere]"><Building2 className="mt-1 size-6 shrink-0 text-primary" /> {inv.empresa}</h1>
            </div>
            <ul className="space-y-2 text-sm">
              <li className="flex gap-2"><CalendarClock className="size-4 shrink-0 text-primary" /> Pide evaluaciones con fecha y hora, también para trabajadores nuevos.</li>
              <li className="flex gap-2"><FileCheck2 className="size-4 shrink-0 text-primary" /> Recibe las constancias de aptitud apenas el médico las firma.</li>
              <li className="flex gap-2"><ShieldCheck className="size-4 shrink-0 text-primary" /> Solo ves tu empresa. La historia clínica queda con el personal de salud.</li>
            </ul>
            {inv.estado !== "vigente" && !conSesion ? (
              <p className="rounded-md bg-aviso/15 px-3 py-2 text-sm text-aviso-texto">{AVISO[inv.estado]}</p>
            ) : conSesion ? (
              <Aceptar token={token} texto={inv.estado === "vigente" ? "Aceptar y entrar al portal" : "Entrar al portal"} />
            ) : (
              <div className="space-y-3 border-t pt-5">
                {confirmado ? (
                  <p role="status" className="flex gap-2 rounded-md bg-ok/15 px-3 py-2 text-sm text-ok-texto"><CheckCircle2 className="mt-0.5 size-4 shrink-0" /> Si ya confirmaste tu correo (o abriste el enlace en otro equipo o navegador), ingresa con tu correo y contraseña para aceptar la invitación.</p>
                ) : (
                  <p className="text-sm font-medium">Crea tu cuenta para entrar (o ingresa si ya tienes una)</p>
                )}
                <FormularioLogin modoDemo={false} siguiente={`/invitacion/${token}`} modoInicial={confirmado ? "ingresar" : "registro"} />
              </div>
            )}
          </>
        )}
        <p className="text-center text-xs text-muted-foreground"><Link href="/login" className="hover:underline">Ir al ingreso</Link></p>
      </div>
    </main>
  );
}
