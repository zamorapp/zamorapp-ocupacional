import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { copiaDeUrl, faltantesRecipe, obtenerAnexos, obtenerDocumento, opcionesDeUrl } from "@/lib/documentos";
import { opcionesDe } from "@/lib/documentos-opciones";
import { OpcionesImpresion } from "../../opciones";
import { Anexos } from "../../anexos";
import { BarraImpresion } from "../../barra";
import { Constancia, Orden, Recipe, Referencia, Reposo, Reubicacion } from "../../documentos";

export const metadata: Metadata = { title: "Documentos de la consulta" };

// Todos los documentos que aplican a la consulta en una sola impresión (uno por hoja):
// constancia si hay aptitud, reposo si está activo, récipe si hay tratamiento completo, orden si hay paraclínicos y referencia si hay interconsultas.
// Al final, los exámenes escaneados de la consulta.
export default async function Paquete({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ sin?: string; copia?: string }> }) {
  const { id } = await params;
  const { sin, copia } = await searchParams;
  const base = await obtenerDocumento(id);
  if (!base) notFound();
  const d = { ...base, sin: opcionesDeUrl(sin), copia: copiaDeUrl(copia, base.org.ajustes) };
  const tratamiento = d.datos.tratamiento.some((m) => m.medicina);
  const faltan = tratamiento ? faltantesRecipe(d) : [];
  const docs = [
    d.datos.aptitud.clasificacion && { clave: "constancia", Componente: Constancia },
    d.datos.reposo.activo && { clave: "reposo", Componente: Reposo },
    tratamiento && !faltan.length && { clave: "recipe", Componente: Recipe },
    d.datos.paraclinicos.length > 0 && { clave: "orden", Componente: Orden },
    d.datos.interconsultas.some((x) => x.especialidad.trim()) && { clave: "referencia", Componente: Referencia },
    d.datos.reubicacion.activa && { clave: "reubicacion", Componente: Reubicacion },
  ].filter(Boolean) as { clave: string; Componente: typeof Constancia }[];
  const anexos = await obtenerAnexos(d);
  const total = docs.length + (anexos.length ? 1 : 0);

  return (
    <div className="min-h-dvh bg-neutral-100 print:bg-white">
      <BarraImpresion volver={`/atencion/${id}`} titulo={`${docs.length} documento${docs.length === 1 ? "" : "s"}${anexos.length ? ` + ${anexos.length} escaneado${anexos.length === 1 ? "" : "s"}` : ""} · ${d.trabajador.nombre}`} bloqueado={!total} esperarAnexos={anexos.length > 0} />
      {docs.length > 0 && <OpcionesImpresion disponibles={opcionesDe("paquete")} copia={d.datos.aptitud.clasificacion ? d.copia : undefined} />}
      {faltan.length > 0 && (
        <div className="mx-auto mb-6 max-w-2xl rounded-lg border border-aviso/40 bg-white p-4 text-sm print:hidden">
          <p className="mb-1 flex items-center gap-2 font-medium text-aviso-texto"><AlertTriangle className="size-4" /> El récipe quedó fuera: faltan {faltan.join(", ")}.</p>
          <p className="text-neutral-600">El resto se imprime igual. Complétalo y vuelve a imprimir desde la consulta.</p>
        </div>
      )}
      {total === 0 && <p className="mx-auto max-w-2xl rounded-lg bg-white p-6 text-center text-sm">Esta consulta no tiene constancia, reposo, récipe ni orden para imprimir. Usa el informe desde la consulta.</p>}
      {docs.map(({ clave, Componente }) => <Componente key={clave} d={d} />)}
      {anexos.length > 0 && <Anexos anexos={anexos} trabajador={d.trabajador.nombre} cedula={d.trabajador.cedula} />}
    </div>
  );
}
