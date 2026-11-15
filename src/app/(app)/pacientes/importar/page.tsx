import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { empresaActivaId } from "@/lib/empresa-activa";
import { listarEmpresas } from "@/lib/empresas";
import { cedulasRegistradas } from "@/lib/pacientes-datos";
import { obtenerSesion } from "@/lib/sesion";
import { empresaSoloLectura } from "@/lib/sesion-roles";
import { notFound } from "next/navigation";
import { Importador } from "./importador";
import { ActualizarNomina } from "./actualizar-nomina";

export const metadata: Metadata = { title: "Actualizar nómina" };

export default async function ImportarPacientes() {
  // Supervisor, delegado, auditor y trabajador no cargan nómina (la base tampoco los deja)
  const sesion = await obtenerSesion();
  if (empresaSoloLectura(sesion.rol)) notFound();
  // Administrador y personal de salud: actualizar la nómina completa con la plantilla de RR. HH. (Cesar, 04-nov-2026).
  // Recepción, SST y el gerente de la empresa siguen con la carga de pacientes nuevos.
  const nomina = !sesion.demo && (sesion.clinico || sesion.rol === "administrador");
  const [cedulas, empresas, activa] = await Promise.all([cedulasRegistradas(), listarEmpresas(), empresaActivaId()]);
  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <Link href="/pacientes" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Pacientes
      </Link>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{nomina ? "Actualizar nómina" : "Importar desde Excel"}</h1>
        <p className="text-muted-foreground">
          {nomina
            ? "Con la planilla de RR. HH.: completa los datos que faltan, registra a los nuevos y saca a quien ya no está. Ves todo antes de aplicar."
            : "Carga la nómina de una empresa. Revisamos cada fila antes de guardar."}
        </p>
      </div>
      {empresas.length === 0 ? (
        <div className="rounded-xl border border-dashed bg-card p-10 text-center">
          <p className="font-medium">Primero registra la empresa</p>
          <p className="text-sm text-muted-foreground">
            Los pacientes se importan dentro de una empresa cliente. <Link href="/empresas" className="text-primary hover:underline">Ir a Empresas</Link>
          </p>
        </div>
      ) : nomina ? (
        <ActualizarNomina
          empresas={empresas.map((e) => ({ id: e.id, nombre: e.razonSocial }))}
          empresaInicial={empresas.find((e) => e.id === activa)?.id ?? empresas[0].id}
        />
      ) : (
        <Importador
          cedulasExistentes={cedulas}
          empresas={empresas.map((e) => ({ id: e.id, nombre: e.razonSocial }))}
          empresaInicial={empresas.find((e) => e.id === activa)?.id ?? empresas[0].id}
        />
      )}
    </div>
  );
}
