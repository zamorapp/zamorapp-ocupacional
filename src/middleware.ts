import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { COOKIE_EQUIPO, cabecerasEquipo } from "@/lib/equipo-confianza";

// Direcciones con las que la ventana de zamorApp Escritorio abre la app local
const HOSTS_ESCRITORIO = ["127.0.0.1:54332", "localhost:54332"];

// Sesiones que ya cumplieron el segundo paso (equipo de confianza), en la memoria del servidor por 5 minutos: así
// el menú y sus prefetch no consultan la base en cada clic. Es memoria del servidor, no una cookie: el navegador no
// la puede falsificar. Y si un equipo se olvida, la base frena los datos al instante; solo la redirección espera.
const YA_CUMPLE = new Map<string, number>();
function recordarCumple(clave: string) {
  if (YA_CUMPLE.size > 500) YA_CUMPLE.clear();
  YA_CUMPLE.set(clave, Date.now() + 5 * 60 * 1000);
}

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
    global: { headers: cabecerasEquipo(request.cookies.get(COOKIE_EQUIPO)?.value) },
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
  // Invitación de RR. HH.: se abre sin cuenta (ahí mismo la crea o ingresa) y también con sesión (para aceptarla)
  if (request.nextUrl.pathname.startsWith("/invitacion/")) return respuesta;
  // Cola de envíos del escritorio: la llama la puerta local con la sesión de nube (Bearer), sin cookies; valida ella misma
  if (request.nextUrl.pathname === "/api/envios/correo") return respuesta;

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
  // La puerta local del escritorio pone "aal" solo a quien la necesita (la verificación pasa por ella a la nube).
  const ruta = request.nextUrl.pathname;
  const enDosPasos = ruta.startsWith("/login/dos-pasos");
  const aal = data?.claims?.aal;
  if (conSesion && aal === "aal2" && enDosPasos) return irA("/panel");
  // La marca «dos_pasos» la pone la nube al firmar el token: si es falsa (médicos, enfermería, RR. HH.) no se consulta
  // nada. Si es verdadera o no está (hook sin activar), decide la base: equipo de confianza vigente o código.
  if (conSesion && aal === "aal1" && data?.claims?.dos_pasos !== false && !enDosPasos && !ruta.startsWith("/login/nueva-clave") && !ruta.startsWith("/api/")) {
    const clave = `${data?.claims?.session_id ?? data?.claims?.sub}:${request.cookies.get(COOKIE_EQUIPO)?.value ?? ""}`;
    if ((YA_CUMPLE.get(clave) ?? 0) < Date.now()) {
      const { data: falta } = await supabase.rpc("falta_segundo_paso");
      if (falta === true) return irA("/login/dos-pasos");
      if (falta === false) recordarCumple(clave);
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
