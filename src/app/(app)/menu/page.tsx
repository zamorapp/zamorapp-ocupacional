import type { Metadata } from "next";
import { obtenerSesion, primerNombre } from "@/lib/sesion";
import { esRolEmpresa } from "@/lib/sesion-roles";
import { MenuBotones } from "./menu-botones";

export const metadata: Metadata = { title: "Menú" };

// Vista de botones: todas las opciones del menú lateral en tarjetas grandes, por categoría (Cesar, 06-nov)
export default async function PaginaMenu() {
  const sesion = await obtenerSesion();
  const portal = esRolEmpresa(sesion.rol);
  return <MenuBotones nombre={primerNombre(sesion.nombre)} portal={portal} clinico={!portal && sesion.clinico} rol={sesion.rol} />;
}
