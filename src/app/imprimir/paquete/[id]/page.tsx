import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { copiaDeUrl, datosCompletarRecipe, faltantesRecipe, obtenerAnexos, obtenerDocumento, opcionesDeUrl } from "@/lib/documentos";
import { CompletarRecipe } from "../../completar-recipe";
import { opcionesDe, revisionDeUrl } from "@/lib/documentos-opciones";
import { OpcionesImpresion } from "../../opciones";
import { Anexos } from "../../anexos";
import { BarraImpresion } from "../../barra";
import { Constancia, Orden, Recipe, Referencia, Reposo, Reubicacion } from "../../documentos";
import { siguienteEnEspera } from "@/lib/citas";
import { SiguientePaciente } from "@/app/(app)/atencion/siguiente-paciente";

export const metadata: Metadata = { title: "Documentos de la consulta" };

// Todos los documentos que aplican a la consulta en una sola impresión (uno por hoja):
// constancia si hay aptitud, reposo si está activo, récipe si hay tratamiento completo, orden si hay paraclínicos y referencia si hay interconsultas.
// Al final, los exámenes escaneados de la consulta.
export default async function Paquete({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ sin?: string; copia?: string; rev?: string }> }) {
  const { id } = await params;
  const { sin, copia, rev } = await searchParams;
  const base = await obtenerDocumento(id);
  if (!base) notFound();
  const d = { ...base, impreso: { ...base.impreso, mostrarRevision: revisionDeUrl(rev) }, sin: opcionesDeUrl(sin), copia: copiaDeUrl(copia, base.org.ajustes) };
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
  const [anexos, siguiente] = await Promise.all([obtenerAnexos(d), siguienteEnEspera()]);
  const total = docs.length + (anexos.length ? 1 : 0);

  return (
    <div className="min-h-dvh bg-neutral-100 print:bg-white">
      <BarraImpresion volver={`/atencion/${id}`} titulo={`${docs.length} documento${docs.length === 1 ? "" : "s"}${anexos.length ? ` + ${anexos.length} escaneado${anexos.length === 1 ? "" : "s"}` : ""} · ${d.trabajador.nombre}`} bloqueado={!total} esperarAnexos={anexos.length > 0} siguiente={siguiente ? <SiguientePaciente siguiente={siguiente} /> : undefined} />
      {docs.length > 0 && <OpcionesImpresion disponibles={opcionesDe("paquete")} copia={d.datos.aptitud.clasificacion ? d.copia : undefined} revision={base.impreso.revision} />}
      {faltan.length > 0 && <CompletarRecipe {...await datosCompletarRecipe(d)} enPaquete />}
      {total === 0 && <p className="mx-auto max-w-2xl rounded-lg bg-white p-6 text-center text-sm">Esta consulta no tiene constancia, reposo, récipe ni orden para imprimir. Usa el informe desde la consulta.</p>}
      {docs.map(({ clave, Componente }) => <Componente key={clave} d={d} />)}
      {anexos.length > 0 && <Anexos anexos={anexos} trabajador={d.trabajador.nombre} cedula={d.trabajador.cedula} />}
    </div>
  );
}
