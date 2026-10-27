import type { NextConfig } from "next";

// Cabeceras de seguridad para todas las páginas: no se puede incrustar la app en otro sitio,
// el navegador no adivina tipos de archivo y no se filtra la ruta completa a otros sitios.
const SEGURIDAD = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" },
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
];

const nextConfig: NextConfig = {
  // Permite compilar en otra carpeta sin tocar la del servidor de desarrollo en uso
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // Programa de escritorio: servidor autónomo que se empaca en el instalador de Windows
  output: process.env.ZAMORAPP_ESCRITORIO ? "standalone" : undefined,
  // La app sabe en el navegador si corre dentro del programa de escritorio (sin service worker, p. ej.)
  env: { NEXT_PUBLIC_ESCRITORIO: process.env.ZAMORAPP_ESCRITORIO ? "1" : "" },
  // Next reescribe "127.0.0.1" como "localhost" en las redirecciones del middleware (NextURL). En el programa de
  // escritorio eso cambiaba el origen de la ventana y la puerta local rechazaba el ingreso; con esto el
  // middleware recibe y devuelve la dirección tal cual llegó.
  skipMiddlewareUrlNormalize: true,
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: SEGURIDAD }];
  },
};

export default nextConfig;
