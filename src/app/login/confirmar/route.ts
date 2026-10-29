import { NextResponse } from "next/server";
import { crearClienteServidor } from "@/lib/supabase/server";

// Regreso del correo de confirmación de cuenta (?code=…): canjea el código por la sesión y sigue a donde iba
// (la invitación de RR. HH. o el panel). Solo rutas internas: nunca redirige fuera de la app.
// Si el código no sirve (se abrió en otro equipo o ya se usó), el correo igual quedó confirmado: pide ingresar.
const DESTINOS = ["/panel", "/portal", "/invitacion/"];

export async function GET(request: Request) {
  const url = new URL(request.url);
  const codigo = url.searchParams.get("code");
  const pedido = url.searchParams.get("siguiente") ?? "/panel";
  const siguiente = DESTINOS.some((d) => pedido === d || pedido.startsWith(d.endsWith("/") ? d : d + "/")) && !/\/\/|\\|:/.test(pedido) && /^[\w\-/]+$/.test(pedido) ? pedido : "/panel";
  if (codigo) {
    const supabase = await crearClienteServidor();
    // Con sesión ya abierta el código se ignora
    const { data } = await supabase.auth.getClaims();
    if (data?.claims?.sub) return NextResponse.redirect(new URL(siguiente, url.origin));
    const { error } = await supabase.auth.exchangeCodeForSession(codigo);
    if (!error) return NextResponse.redirect(new URL(siguiente, url.origin));
  }
  const destino = siguiente.startsWith("/invitacion/") ? `${siguiente}?confirmado=1` : "/login?confirmado=1";
  return NextResponse.redirect(new URL(destino, url.origin));
}
