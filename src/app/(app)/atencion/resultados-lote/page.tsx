import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { opciones } from "@/lib/listas";
import { obtenerSesion } from "@/lib/sesion";
import { ResultadosLote } from "./resultados-lote";

export const metadata: Metadata = { title: "Resultados por lote" };

export default async function Pagina() {
  const sesion = await obtenerSesion();
  if (!sesion.clinico) notFound();
  const { paraclinico } = await opciones(sesion.orgId, ["paraclinico"]);
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Link href="/atencion" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Atención médica
      </Link>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Resultados por lote</h1>
        <p className="text-muted-foreground">
          Sube el PDF del laboratorio con los resultados de varios trabajadores. Se separa por cédula y cada paciente recibe solo sus hojas, con su propia revisión.
        </p>
      </div>
      <ResultadosLote catalogo={paraclinico} demo={sesion.demo} />
    </div>
  );
}
