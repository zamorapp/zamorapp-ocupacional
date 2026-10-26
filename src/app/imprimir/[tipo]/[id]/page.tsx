import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { faltantesRecipe, obtenerDocumento } from "@/lib/documentos";
import { BarraImpresion } from "../../barra";
import { Certificado, Constancia, Informe, Orden, Recipe, Reposo } from "../../documentos";

const TIPOS = {
  constancia: { titulo: "Constancia de aptitud", Componente: Constancia },
  reposo: { titulo: "Reposo médico", Componente: Reposo },
  informe: { titulo: "Informe médico", Componente: Informe },
  recipe: { titulo: "Récipe e indicaciones", Componente: Recipe },
  orden: { titulo: "Orden de exámenes", Componente: Orden },
  certificado: { titulo: "Certificado de salud", Componente: Certificado },
} as const;

type Props = { params: Promise<{ tipo: string; id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { tipo } = await params;
  return { title: TIPOS[tipo as keyof typeof TIPOS]?.titulo ?? "Documento" };
}

export default async function Imprimir({ params }: Props) {
  const { tipo, id } = await params;
  const t = TIPOS[tipo as keyof typeof TIPOS];
  if (!t) notFound();
  const d = await obtenerDocumento(id);
  if (!d) notFound();
  const faltan = tipo === "recipe" ? faltantesRecipe(d) : [];

  return (
    <div className="min-h-dvh bg-neutral-100 print:bg-white">
      <BarraImpresion volver={`/atencion/${id}`} titulo={`${t.titulo} · ${d.trabajador.nombre}`} bloqueado={faltan.length > 0} />
      {faltan.length > 0 ? (
        <div className="mx-auto max-w-2xl rounded-lg border border-alerta/30 bg-white p-6">
          <p className="mb-2 flex items-center gap-2 font-medium text-alerta">
            <AlertTriangle className="size-5" /> El récipe no se puede imprimir: faltan datos que exige la Res. MPPS 028
          </p>
          <ul className="list-disc space-y-1 pl-6 text-sm">{faltan.map((f) => <li key={f}>{f}</li>)}</ul>
        </div>
      ) : (
        <t.Componente d={d} />
      )}
    </div>
  );
}
