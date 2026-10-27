import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Refresca la sesión de Supabase y protege las rutas internas.
// Sin Supabase configurado la app corre en modo demo y no bloquea nada.
export async function middleware(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // La ruta viaja a las páginas para decidir qué puede ver cada rol (portal de empresas)
  const encabezados = new Headers(request.headers);
  encabezados.set("x-ruta", request.nextUrl.pathname);
  const seguir = () => NextResponse.next({ request: { headers: encabezados } });

  if (!url || !key) return seguir();

  let respuesta = seguir();
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (lista) => {
        lista.forEach(({ name, value }) => request.cookies.set(name, value));
        respuesta = seguir();
        lista.forEach(({ name, value, options }) => respuesta.cookies.set(name, value, options));
      },
    },
  });

  // getClaims valida el token localmente (clave pública ES256 en caché) y refresca la sesión si vence;
  // evita una ida y vuelta al servidor de Supabase en cada pantalla.
  const { data } = await supabase.auth.getClaims();
  const conSesion = Boolean(data?.claims?.sub);
  const enLogin = request.nextUrl.pathname.startsWith("/login");

  // Las redirecciones conservan el host con el que llegó la petición. En el programa de escritorio Next arma
  // request.url con "localhost": sin esto la ventana pasaba de 127.0.0.1:54332 a localhost:54332, cambiaba de
  // origen y la puerta local (que solo atiende a la ventana) rechazaba todo lo que pedía la pantalla de ingreso.
  const irA = (ruta: string) => {
    const destino = new URL(ruta, request.url);
    const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
    if (host) destino.host = host;
    return NextResponse.redirect(destino);
  };
  if (!conSesion && !enLogin) {
    return irA("/login");
  }
  if (conSesion && enLogin && !request.nextUrl.pathname.startsWith("/login/nueva-clave")) {
    return irA("/panel");
  }
  return respuesta;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icono.svg|manifest.webmanifest|sw.js|sin-conexion.html|.*\\.(?:png|jpg|svg|webp)$).*)"],
};
