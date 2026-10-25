import type { Metadata } from "next";
import { listarTrabajadores } from "@/lib/pacientes";
import { ListaPacientes } from "./lista-pacientes";

export const metadata: Metadata = { title: "Pacientes" };

export default async function Pacientes() {
  const trabajadores = await listarTrabajadores();
  return <ListaPacientes trabajadores={trabajadores} />;
}
