import type { Metadata } from "next";
import { AppMovil } from "./app-movil";

// Pantalla del celular que trabaja sin internet. El service worker la guarda (public/sw.js) y la abre sin señal;
// los datos viven cifrados en el teléfono y se sincronizan con la nube (y por ella con la PC) al volver la señal.
export const metadata: Metadata = { title: "Sin internet" };

export default function Page() {
  return <AppMovil />;
}
