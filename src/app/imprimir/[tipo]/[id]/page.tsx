import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { copiaDeUrl, faltantesRecipe, obtenerDocumento, opcionesDeUrl } from "@/lib/documentos";
import { opcionesDe } from "@/lib/documentos-opciones";
import { OpcionesImpresion } from "../../opciones";
import { BarraImpresion } from "../../barra";
import { ConstanciaAtencion } from "../../documentos";
import { TIPOS } from "../../tipos";


type Props = { params: Promise<{ tipo: string; id: string }>; searchParams: Promise<{ dx?: string; sin?: string; copia?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { tipo } = await params;
  return { title: TIPOS[tipo as keyof typeof TIPOS]?.titulo ?? "Documento" };
}

export default async function Imprimir({ params, searchParams }: Props) {
  const { tipo, id } = await params;
  const { dx, sin, copia } = await searchParams;
  const t = TIPOS[tipo as keyof typeof TIPOS];
  if (!t) notFound();
  const base = await obtenerDocumento(id);
  if (!base) notFound();
  const d = { ...base, sin: opcionesDeUrl(sin), copia: copiaDeUrl(copia, base.org.ajustes) };
  const faltan = tipo === "recipe" ? faltantesRecipe(d) : [];

  return (
    <div className="min-h-dvh bg-neutral-100 print:bg-white">
      <BarraImpresion volver={`/atencion/${id}`} titulo={`${t.titulo} · ${d.trabajador.nombre}`} bloqueado={faltan.length > 0} />
      {faltan.length > 0 ? (
        <div className="mx-auto max-w-2xl rounded-lg border border-alerta/30 bg-white p-6">
          <p className="mb-2 flex items-center gap-2 font-medium text-alerta-texto">
            <AlertTriangle className="size-5" /> El récipe no se puede imprimir: faltan datos que exige la Res. MPPS 028 (reformada por la Res. 031 de 2013)
          </p>
          <ul className="list-disc space-y-1 pl-6 text-sm">{faltan.map((f) => <li key={f}>{f}</li>)}</ul>
        </div>
      ) : (
        <>
          <OpcionesImpresion disponibles={opcionesDe(tipo)} copia={tipo === "constancia" ? d.copia : undefined} />
          {tipo === "atencion" && d.datos.diagnosticos.length > 0 && (
            <div className="mx-auto -mt-3 mb-4 flex max-w-[216mm] justify-end px-1 text-sm print:hidden">
              <Link href={`/imprimir/atencion/${id}?${new URLSearchParams({ ...(dx === "1" ? {} : { dx: "1" }), ...(sin ? { sin } : {}) })}`} replace className="rounded-full border bg-white px-3 py-1 hover:border-primary">
                {dx === "1" ? "Quitar diagnóstico (versión para la empresa)" : "Incluir diagnóstico (solo para el trabajador)"}
              </Link>
            </div>
          )}
          {tipo === "atencion" ? <ConstanciaAtencion d={d} diagnostico={dx === "1"} /> : <t.Componente d={d} />}
        </>
      )}
    </div>
  );
}
