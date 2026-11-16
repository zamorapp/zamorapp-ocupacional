import type { Metadata } from "next";
import { supabaseConfigurado } from "@/lib/config";
import { TOKEN_INVITACION } from "@/lib/invitaciones";
import { crearClienteServidor } from "@/lib/supabase/server";
import { VistaInvitacion, type DatosInvitacion } from "./vista";

export const metadata: Metadata = { title: "Invitación al portal", robots: { index: false } };
export const dynamic = "force-dynamic";

// Enlace que el servicio médico manda por WhatsApp a RR. HH.: muestra la empresa, deja crear la cuenta o ingresar
// ahí mismo y, con sesión, la acepta. Funciona sin cuenta; los datos los decide la base con el token.
export default async function Invitacion({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const valido = supabaseConfigurado && TOKEN_INVITACION.test(token);
  const supabase = valido ? await crearClienteServidor() : null;
  const [{ data: filas }, { data: claims }] = supabase
    ? await Promise.all([supabase.rpc("ver_invitacion", { p_token: token }), supabase.auth.getClaims()])
    : [{ data: null }, { data: null }];
  const inv = (filas as DatosInvitacion[] | null)?.[0];
  const correo = typeof claims?.claims?.email === "string" ? claims.claims.email : null;
  const conSesion = Boolean(claims?.claims?.sub);
  return <VistaInvitacion token={token} inv={inv} correo={correo} conSesion={conSesion} />;
}

