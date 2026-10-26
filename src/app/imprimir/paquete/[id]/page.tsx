import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { faltantesRecipe, obtenerDocumento } from "@/lib/documentos";
import { BarraImpresion } from "../../barra";
import { Constancia, Orden, Recipe, Reposo } from "../../documentos";

export const metadata: Metadata = { title: "Documentos de la consulta" };

// Todos los documentos que aplican a la consulta en una sola impresión (uno por hoja):
// constancia si hay aptitud, reposo si está activo, récipe si hay tratamiento completo y orden si hay paraclínicos.
export default async function Paquete({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const d = await obtenerDocumento(id);
  if (!d) notFound();
  const tratamiento = d.datos.tratamiento.some((m) => m.medicina);
  const faltan = tratamiento ? faltantesRecipe(d) : [];
  const docs = [
    d.datos.aptitud.clasificacion && { clave: "constancia", Componente: Constancia },
    d.datos.reposo.activo && { clave: "reposo", Componente: Reposo },
    tratamiento && !faltan.length && { clave: "recipe", Componente: Recipe },
    d.datos.paraclinicos.length > 0 && { clave: "orden", Componente: Orden },
  ].filter(Boolean) as { clave: string; Componente: typeof Constancia }[];

  return (
    <div className="min-h-dvh bg-neutral-100 print:bg-white">
      <BarraImpresion volver={`/atencion/${id}`} titulo={`${docs.length} documento${docs.length === 1 ? "" : "s"} · ${d.trabajador.nombre}`} bloqueado={!docs.length} />
      {faltan.length > 0 && (
        <div className="mx-auto mb-6 max-w-2xl rounded-lg border border-aviso/40 bg-white p-4 text-sm print:hidden">
          <p className="mb-1 flex items-center gap-2 font-medium text-aviso-texto"><AlertTriangle className="size-4" /> El récipe quedó fuera: faltan {faltan.join(", ")}.</p>
          <p className="text-neutral-600">El resto se imprime igual. Complétalo y vuelve a imprimir desde la consulta.</p>
        </div>
      )}
      {docs.length === 0 && <p className="mx-auto max-w-2xl rounded-lg bg-white p-6 text-center text-sm">Esta consulta no tiene constancia, reposo, récipe ni orden para imprimir. Usa el informe desde la consulta.</p>}
      {docs.map(({ clave, Componente }) => <Componente key={clave} d={d} />)}
    </div>
  );
}
