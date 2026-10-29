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
  // PDF en el servidor (envíos a empresas): Chromium sin ventana. En Vercel su binario se incluye en las rutas que lo usan.
  serverExternalPackages: ["@sparticuz/chromium", "puppeteer-core"],
  outputFileTracingIncludes: {
    "/envios": ["./node_modules/@sparticuz/chromium/bin/**"],
    "/envios/bitacora": ["./node_modules/@sparticuz/chromium/bin/**"],
    "/envios/por-enviar": ["./node_modules/@sparticuz/chromium/bin/**"],
    // Reportes › Aptitud emitida también envía el lote (PanelEnvio): su acción corre en esta ruta
    "/reportes/[tipo]": ["./node_modules/@sparticuz/chromium/bin/**"],
    "/solicitudes": ["./node_modules/@sparticuz/chromium/bin/**"],
    // «Enviar a la empresa» de los informes: su acción corre en la ruta del informe
    "/imprimir/puesto/[id]": ["./node_modules/@sparticuz/chromium/bin/**"],
    "/imprimir/vigilancia": ["./node_modules/@sparticuz/chromium/bin/**"],
    "/imprimir/atendidos": ["./node_modules/@sparticuz/chromium/bin/**"],
  },
  async headers() {
    const reglas = [{ source: "/:path*", headers: SEGURIDAD }];
    // Programa de escritorio: las páginas nunca se guardan en la caché del navegador interno. Tras instalar una
    // versión nueva, una página guardada seguiría pidiendo el JavaScript de la versión anterior.
    // Los archivos de /_next/static llevan su huella en el nombre y sí se pueden guardar.
    if (process.env.ZAMORAPP_ESCRITORIO) reglas.push({ source: "/((?!_next/static).*)", headers: [{ key: "Cache-Control", value: "no-store, must-revalidate" }] });
    return reglas;
  },
};

export default nextConfig;
