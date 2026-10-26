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
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: SEGURIDAD }];
  },
};

export default nextConfig;
