import type { Metadata } from "next";
import Link from "next/link";
import { Building2, CalendarClock, Check, FileCheck2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormularioLogin } from "@/app/login/formulario-login";
import { APP_NOMBRE, supabaseConfigurado } from "@/lib/config";
import { TOKEN_INVITACION } from "@/lib/invitaciones";
import { crearClienteServidor } from "@/lib/supabase/server";
import { Aceptar, SalirParaRegistrarse } from "./aceptar";
import { FichaBoton, MarcoEnlace, TarjetaEnlace } from "@/components/enlace/marco-enlace";

export const metadata: Metadata = { title: "Invitación al portal", robots: { index: false } };
export const dynamic = "force-dynamic";

const PASOS = ["Cree su cuenta", "Confirme su correo", "Entre al portal"];

// Guía de 3 pasos: RR. HH. siempre sabe en cuál va. Sin sesión va en el 1 (el 2 lo indica el formulario al registrarse);
// al volver del correo ya tiene sesión y va en el 3.
function Pasos({ actual }: { actual: number }) {
  return (
    <ol className="grid grid-cols-3 gap-2 text-center text-xs">
      {PASOS.map((t, i) => {
        const n = i + 1;
        return (
          <li key={t} className="space-y-1">
            <span className={`mx-auto grid size-8 place-items-center rounded-full text-sm font-semibold ${n < actual ? "bg-ok/15 text-ok-texto" : n === actual ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
              {n < actual ? <Check className="size-4" /> : n}
            </span>
            <span className={n === actual ? "block font-medium" : "block text-muted-foreground"}>{t}</span>
          </li>
        );
      })}
    </ol>
  );
}

// Lo que RR. HH. puede hacer en el portal (nada clínico)
const BENEFICIOS: [typeof CalendarClock, string, string][] = [
  [CalendarClock, "Pida evaluaciones", "Con fecha y hora, también para trabajadores nuevos."],
  [FileCheck2, "Reciba las constancias", "Las de aptitud, apenas el médico las firma."],
  [ShieldCheck, "Solo ve su empresa", "La historia clínica queda con el personal de salud."],
];

const AVISO: Record<string, string> = {
  usada: "Esta invitación ya se usó. Si es usted, ingrese normalmente; si no, pida un enlace nuevo al servicio médico.",
  vencida: "Esta invitación venció. Pida un enlace nuevo al servicio médico.",
  anulada: "Esta invitación fue anulada. Pida un enlace nuevo al servicio médico.",
};

// Enlace que el servicio médico manda por WhatsApp a RR. HH.: muestra la empresa, deja crear la cuenta o ingresar
// ahí mismo y, con sesión, la acepta. Funciona sin cuenta; los datos los decide la base con el token.
export default async function Invitacion({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const valido = supabaseConfigurado && TOKEN_INVITACION.test(token);
  const supabase = valido ? await crearClienteServidor() : null;
  const [{ data: filas }, { data: claims }] = supabase
    ? await Promise.all([supabase.rpc("ver_invitacion", { p_token: token }), supabase.auth.getClaims()])
    : [{ data: null }, { data: null }];
  const inv = (filas as { empresa: string; organizacion: string; nombre: string | null; estado: string; invita: string | null; otro_rol: boolean }[] | null)?.[0];
  const correo = typeof claims?.claims?.email === "string" ? claims.claims.email : null;
  const conSesion = Boolean(claims?.claims?.sub);

  return (
    <MarcoEnlace servicio={inv?.organizacion ?? APP_NOMBRE} subtitulo="Portal de empresas" ancho="max-w-md">
      <TarjetaEnlace className="space-y-6 sm:p-8">
        {!inv ? (
          <div className="space-y-2">
            <h1 className="text-xl font-semibold">Enlace no válido</h1>
            <p className="text-sm text-muted-foreground">Revise que lo copió completo o pida uno nuevo al servicio médico.</p>
          </div>
        ) : (
          <>
            <div className="space-y-2">
              {/* «Le invita el Dr. …» sale de Configuración › Organización; sin eso, el nombre del servicio */}
              <p className="text-xs font-semibold uppercase tracking-[.08em] text-primary">Portal de su empresa</p>
              <h1 className="flex items-start gap-2 text-2xl font-semibold tracking-tight [overflow-wrap:anywhere]"><Building2 className="mt-1 size-6 shrink-0 text-primary" /> {inv.empresa}</h1>
              <p className="text-sm text-muted-foreground">
                {`${inv.nombre ? `${inv.nombre.split(" ")[0]}, l` : "L"}e invita ${inv.invita ?? inv.organizacion}.`}
              </p>
            </div>
            <ul className="space-y-2 text-sm">
              {BENEFICIOS.map(([Icono, titulo, detalle], i) => (
                <li key={titulo} className="rounded-xl border bg-background px-3 py-2.5">
                  <FichaBoton icono={Icono} titulo={titulo} detalle={detalle} indice={i} />
                </li>
              ))}
            </ul>
            {inv.estado !== "vigente" && !conSesion ? (
              <p className="rounded-md bg-aviso/15 px-3 py-2 text-sm text-aviso-texto">{AVISO[inv.estado]}</p>
            ) : conSesion && inv.otro_rol ? (
              // Sesión abierta con una cuenta del servicio (p. ej. el médico probando en su teléfono): nunca se convierte
              // en RR. HH.; se ofrece salir y crear la cuenta nueva aquí mismo
              <div className="space-y-3 border-t pt-5">
                <p className="rounded-md bg-aviso/15 px-3 py-2 text-sm text-aviso-texto">
                  Este teléfono tiene abierta la cuenta {correo ? <strong className="[overflow-wrap:anywhere]">{correo}</strong> : "de otra persona"}, que ya trabaja en el servicio médico. La cuenta de RR. HH. debe ser otra, con su propio correo.
                </p>
                <SalirParaRegistrarse token={token} />
                <Button variant="ghost" className="w-full" asChild><Link href="/panel">Volver a zamorApp</Link></Button>
              </div>
            ) : conSesion ? (
              <div className="space-y-4 border-t pt-5">
                <Pasos actual={3} />
                <p className="text-sm">Su cuenta está lista. Toque el botón para terminar.</p>
                <Aceptar token={token} texto={inv.estado === "vigente" ? "Aceptar y entrar al portal" : "Entrar al portal"} />
              </div>
            ) : (
              <div className="space-y-4 border-t pt-5">
                <Pasos actual={1} />
                <div className="rounded-md bg-primary/5 p-3 text-sm">
                  <p className="font-medium">Paso 1: llene sus datos y toque «Crear cuenta».</p>
                  <p className="text-muted-foreground">Use un correo que abra a diario. Después le llegará un correo para confirmar (paso 2). Si ya tiene cuenta, toque «Ingresar».</p>
                </div>
                <FormularioLogin modoDemo={false} siguiente={`/invitacion/${token}`} modoInicial="registro" nombreInicial={inv.nombre ?? undefined} trato="usted" />
              </div>
            )}
          </>
        )}
        {/* Con el formulario a la vista sobra: ya trae «¿Ya tiene cuenta? Ingresar» */}
        {!(inv && !conSesion && inv.estado === "vigente") && <p className="text-center text-xs text-muted-foreground"><Link href="/login" className="hover:underline">Ir al ingreso</Link></p>}
      </TarjetaEnlace>
    </MarcoEnlace>
  );
}
