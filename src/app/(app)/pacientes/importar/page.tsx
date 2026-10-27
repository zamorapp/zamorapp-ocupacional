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

export const metadata: Metadata = { title: "Importar pacientes" };

export default async function ImportarPacientes() {
  // Supervisor, delegado, auditor y trabajador no cargan nómina (la base tampoco los deja)
  if (empresaSoloLectura((await obtenerSesion()).rol)) notFound();
  const [cedulas, empresas, activa] = await Promise.all([cedulasRegistradas(), listarEmpresas(), empresaActivaId()]);
  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <Link href="/pacientes" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Pacientes
      </Link>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Importar desde Excel</h1>
        <p className="text-muted-foreground">Carga la nómina de una empresa. Revisamos cada fila antes de guardar.</p>
      </div>
      {empresas.length === 0 ? (
        <div className="rounded-xl border border-dashed bg-card p-10 text-center">
          <p className="font-medium">Primero registra la empresa</p>
          <p className="text-sm text-muted-foreground">
            Los pacientes se importan dentro de una empresa cliente. <Link href="/empresas" className="text-primary hover:underline">Ir a Empresas</Link>
          </p>
        </div>
      ) : (
        <Importador
          cedulasExistentes={cedulas}
          empresas={empresas.map((e) => ({ id: e.id, nombre: e.razonSocial }))}
          empresaInicial={activa ?? empresas[0].id}
        />
      )}
    </div>
  );
}
