import type { MetadataRoute } from "next";
import { APP_NOMBRE, APP_NOMBRE_CORTO } from "@/lib/config";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: APP_NOMBRE,
    short_name: APP_NOMBRE_CORTO,
    description: "Salud ocupacional multiempresa",
    start_url: "/panel",
    display: "standalone",
    background_color: "#f6f8f8",
    theme_color: "#0f766e",
    lang: "es-VE",
    id: "/",
    scope: "/",
    icons: [
      { src: "/icono.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/icono-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icono-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icono-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Atención médica", url: "/atencion" },
      { name: "Pacientes", url: "/pacientes" },
      { name: "Sin internet", url: "/movil" },
    ],
  };
}
