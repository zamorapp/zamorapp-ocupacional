import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { listarTrabajadores } from "@/lib/pacientes";
import { Importador } from "./importador";

export const metadata: Metadata = { title: "Importar pacientes" };

export default async function ImportarPacientes() {
  const cedulas = (await listarTrabajadores()).map((t) => t.cedula);
  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <Link href="/pacientes" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Pacientes
      </Link>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Importar desde Excel</h1>
        <p className="text-muted-foreground">Carga la nómina de una empresa. Revisamos cada fila antes de guardar.</p>
      </div>
      <Importador cedulasExistentes={cedulas} />
    </div>
  );
}
