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
    icons: [{ src: "/icono.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
  };
}
