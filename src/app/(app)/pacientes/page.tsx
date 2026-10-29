import type { Metadata } from "next";
import { empresaActivaId } from "@/lib/empresa-activa";
import { listarEmpresas } from "@/lib/empresas";
import { type EstadoTrabajador, ETIQUETA_ESTADO } from "@/lib/pacientes";
import { buscarTrabajadores, listarTiposPaciente } from "@/lib/pacientes-datos";
import { obtenerSesion } from "@/lib/sesion";
import { empresaSoloLectura, esRolEmpresa } from "@/lib/sesion-roles";
import { ListaPacientes } from "./lista-pacientes";
import { NuevoPaciente } from "./nuevo-paciente";
import { DepurarNomina } from "./depurar-nomina";

export const metadata: Metadata = { title: "Pacientes" };

export default async function Pacientes({ searchParams }: { searchParams: Promise<{ q?: string; empresa?: string; estado?: string }> }) {
  const [{ q, empresa: empresaParam, estado: estadoParam }, sesion, empresas, tipos, activa] = await Promise.all([
    searchParams,
    obtenerSesion(),
    listarEmpresas(),
    listarTiposPaciente(),
    empresaActivaId(),
  ]);
  // Filtro inicial: el de la dirección, si no la empresa activa del encabezado
  const empresaInicial = empresaParam && empresas.some((e) => e.id === empresaParam) ? empresaParam : activa && empresas.some((e) => e.id === activa) ? activa : "";
  const estadoInicial = estadoParam && estadoParam in ETIQUETA_ESTADO ? (estadoParam as EstadoTrabajador) : "";
  // Primera página (50) desde el servidor; el resto se pide al escribir o al pulsar «Mostrar más»
  const pagina = await buscarTrabajadores({ q: q ?? "", empresa: empresaInicial || null, estado: estadoInicial || null, desde: 0 });
  return (
    <ListaPacientes
      pagina={pagina}
      empresas={empresas.map((e) => ({ id: e.id, nombre: e.razonSocial }))}
      empresaInicial={empresaInicial}
      estadoInicial={estadoInicial}
      busquedaInicial={q ?? ""}
      clinico={sesion.clinico}
      depurar={!sesion.demo && !esRolEmpresa(sesion.rol) ? <DepurarNomina empresas={empresas.map((e) => ({ id: e.id, nombre: e.razonSocial }))} empresaInicial={activa ?? ""} /> : null}
      importar={!empresaSoloLectura(sesion.rol)}
      nuevo={empresaSoloLectura(sesion.rol) ? null : (
        <NuevoPaciente
          habilitado={!sesion.demo && empresas.length > 0}
          empresas={empresas.map((e) => ({ id: e.id, nombre: e.razonSocial }))}
          empresaInicial={activa ?? empresas[0]?.id ?? ""}
          tipos={tipos}
        />
      )}
    />
  );
}
