import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Direcciones con las que la ventana de zamorApp Escritorio abre la app local
const HOSTS_ESCRITORIO = ["127.0.0.1:54332", "localhost:54332"];
const COOKIE_DOS_PASOS = "zamorapp-dos-pasos";

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
  // Enlaces seguros de documentos enviados por WhatsApp: los abre la empresa sin cuenta (valida el token)
  if (request.nextUrl.pathname.startsWith("/e/")) return respuesta;

  // En el programa de escritorio las redirecciones conservan el host con el que llegó la petición (solo
  // 127.0.0.1:54332 o localhost:54332): Next armaba request.url con "localhost", la ventana pasaba de
  // 127.0.0.1:54332 a localhost:54332, cambiaba de origen y la puerta local rechazaba todo lo que pedía la
  // pantalla de ingreso. En la web el destino sale de request.url, nunca de una cabecera del cliente.
  const irA = (ruta: string) => {
    const destino = new URL(ruta, request.url);
    const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
    if (process.env.NEXT_PUBLIC_ESCRITORIO === "1" && host && HOSTS_ESCRITORIO.includes(host)) destino.host = host;
    const redireccion = NextResponse.redirect(destino);
    // La sesión refrescada en esta misma petición viaja con la redirección
    respuesta.cookies.getAll().forEach((c) => redireccion.cookies.set(c));
    return redireccion;
  };
  if (!conSesion && !enLogin) {
    return irA("/login");
  }

  // Verificación en dos pasos (administrador y gerente médico): sin el código de 6 dígitos no se abre nada.
  // Las sesiones de la puerta local del escritorio no traen "aal": ahí lo controla la puerta.
  const ruta = request.nextUrl.pathname;
  const enDosPasos = ruta.startsWith("/login/dos-pasos");
  const aal = data?.claims?.aal;
  if (conSesion && aal === "aal2" && enDosPasos) return irA("/panel");
  if (conSesion && aal === "aal1" && !enDosPasos && !ruta.startsWith("/login/nueva-clave") && !ruta.startsWith("/api/")) {
    const sub = String(data?.claims?.sub);
    // Quien no la necesita queda anotado 10 minutos para no preguntar en cada pantalla (la base igual la exige)
    if (request.cookies.get(COOKIE_DOS_PASOS)?.value !== `${sub}:no`) {
      const { data: requiere, error } = await supabase.rpc("requiere_dos_pasos");
      if (requiere === true) return irA("/login/dos-pasos");
      if (!error) respuesta.cookies.set(COOKIE_DOS_PASOS, `${sub}:no`, { maxAge: 600, httpOnly: true, sameSite: "lax", path: "/" });
    }
  }

  if (conSesion && enLogin && !ruta.startsWith("/login/nueva-clave") && !enDosPasos) {
    return irA("/panel");
  }
  return respuesta;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icono.svg|manifest.webmanifest|sw.js|sin-conexion.html|.*\\.(?:png|jpg|svg|webp)$).*)"],
};
