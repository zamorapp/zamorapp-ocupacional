import type { Metadata } from "next";
import { empresaActivaId } from "@/lib/empresa-activa";
import { listarEmpresas } from "@/lib/empresas";
import { listarTiposPaciente, listarTrabajadores } from "@/lib/pacientes-datos";
import { obtenerSesion } from "@/lib/sesion";
import { ListaPacientes } from "./lista-pacientes";
import { NuevoPaciente } from "./nuevo-paciente";

export const metadata: Metadata = { title: "Pacientes" };

export default async function Pacientes({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const [{ q }, sesion, trabajadores, empresas, tipos, activa] = await Promise.all([
    searchParams,
    obtenerSesion(),
    listarTrabajadores(),
    listarEmpresas(),
    listarTiposPaciente(),
    empresaActivaId(),
  ]);
  return (
    <ListaPacientes
      trabajadores={trabajadores}
      busquedaInicial={q ?? ""}
      nuevo={
        <NuevoPaciente
          habilitado={!sesion.demo && empresas.length > 0}
          empresas={empresas.map((e) => ({ id: e.id, nombre: e.razonSocial }))}
          empresaInicial={activa ?? empresas[0]?.id ?? ""}
          tipos={tipos}
        />
      }
    />
  );
}
