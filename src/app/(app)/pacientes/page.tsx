import type { Metadata } from "next";
import { empresaActivaId } from "@/lib/empresa-activa";
import { listarEmpresas } from "@/lib/empresas";
import { cargosPorEmpresa } from "@/lib/puestos";
import { listarTiposPaciente, listarTrabajadores } from "@/lib/pacientes-datos";
import { obtenerSesion } from "@/lib/sesion";
import { empresaSoloLectura } from "@/lib/sesion-roles";
import { ListaPacientes } from "./lista-pacientes";
import { NuevoPaciente } from "./nuevo-paciente";
import { DepurarTrabajadores } from "./depurar-trabajadores";

export const metadata: Metadata = { title: "Pacientes" };

export default async function Pacientes({ searchParams }: { searchParams: Promise<{ q?: string; nuevo?: string; empresa?: string; nombres?: string; apellidos?: string; cargo?: string }> }) {
  const [{ q, nuevo, empresa: empresaPedida, nombres, apellidos, cargo }, sesion, trabajadores, empresas, tipos, activa, cargos] = await Promise.all([
    searchParams,
    obtenerSesion(),
    listarTrabajadores(),
    listarEmpresas(),
    listarTiposPaciente(),
    empresaActivaId(),
    cargosPorEmpresa(),
  ]);
  return (
    <ListaPacientes
      trabajadores={trabajadores}
      busquedaInicial={q ?? ""}
      clinico={sesion.clinico}
      depurar={!sesion.demo && (sesion.clinico || sesion.rol === "administrador") ? <DepurarTrabajadores empresas={empresas.map((e) => ({ id: e.id, nombre: e.razonSocial }))} empresaInicial={empresas.find((e) => e.id === activa)?.id ?? ""} /> : null}
      importar={!empresaSoloLectura(sesion.rol)}
      nuevo={empresaSoloLectura(sesion.rol) ? null : (
        <NuevoPaciente
          habilitado={!sesion.demo && empresas.length > 0}
          empresas={empresas.map((e) => ({ id: e.id, nombre: e.razonSocial }))}
          empresaInicial={empresas.find((e) => e.id === empresaPedida)?.id ?? empresas.find((e) => e.id === activa)?.id ?? empresas[0]?.id ?? ""}
          tipos={tipos}
          cargos={cargos}
          // ?nuevo=1: llega abierto con los datos que mandó RR. HH. (depuración de nómina)
          inicial={nuevo === "1" ? { nombres: nombres?.slice(0, 80), apellidos: apellidos?.slice(0, 80), cargo: cargo?.slice(0, 80) } : null}
        />
      )}
    />
  );
}
