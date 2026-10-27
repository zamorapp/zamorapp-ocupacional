import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { faltantesRecipe, obtenerDocumento, opcionesDeUrl } from "@/lib/documentos";
import { opcionesDe } from "@/lib/documentos-opciones";
import { OpcionesImpresion } from "../../opciones";
import { BarraImpresion } from "../../barra";
import { Certificado, Constancia, ConstanciaAtencion, OrdenAtencion, Informe, InformeLibre, InformeTrabajador, Orden, Preoperatoria, Recipe, Referencia, Reposo, Reubicacion } from "../../documentos";

const TIPOS = {
  constancia: { titulo: "Constancia de aptitud", Componente: Constancia },
  reposo: { titulo: "Reposo médico", Componente: Reposo },
  informe: { titulo: "Informe médico", Componente: Informe },
  "informe-trabajador": { titulo: "Informe para el trabajador", Componente: InformeTrabajador },
  preoperatoria: { titulo: "Evaluación preoperatoria", Componente: Preoperatoria },
  recipe: { titulo: "Récipe e indicaciones", Componente: Recipe },
  orden: { titulo: "Orden de exámenes", Componente: Orden },
  certificado: { titulo: "Certificado de salud", Componente: Certificado },
  referencia: { titulo: "Referencia médica", Componente: Referencia },
  reubicacion: { titulo: "Reubicación laboral", Componente: Reubicacion },
  libre: { titulo: "Informe libre", Componente: InformeLibre },
  atencion: { titulo: "Constancia de atención médica", Componente: ConstanciaAtencion },
  oam: { titulo: "Orden de atención médica ocupacional", Componente: OrdenAtencion },
} as const;

type Props = { params: Promise<{ tipo: string; id: string }>; searchParams: Promise<{ dx?: string; sin?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { tipo } = await params;
  return { title: TIPOS[tipo as keyof typeof TIPOS]?.titulo ?? "Documento" };
}

export default async function Imprimir({ params, searchParams }: Props) {
  const { tipo, id } = await params;
  const { dx, sin } = await searchParams;
  const t = TIPOS[tipo as keyof typeof TIPOS];
  if (!t) notFound();
  const base = await obtenerDocumento(id);
  if (!base) notFound();
  const d = { ...base, sin: opcionesDeUrl(sin) };
  const faltan = tipo === "recipe" ? faltantesRecipe(d) : [];

  return (
    <div className="min-h-dvh bg-neutral-100 print:bg-white">
      <BarraImpresion volver={`/atencion/${id}`} titulo={`${t.titulo} · ${d.trabajador.nombre}`} bloqueado={faltan.length > 0} />
      {faltan.length > 0 ? (
        <div className="mx-auto max-w-2xl rounded-lg border border-alerta/30 bg-white p-6">
          <p className="mb-2 flex items-center gap-2 font-medium text-alerta-texto">
            <AlertTriangle className="size-5" /> El récipe no se puede imprimir: faltan datos que exige la Res. MPPS 028
          </p>
          <ul className="list-disc space-y-1 pl-6 text-sm">{faltan.map((f) => <li key={f}>{f}</li>)}</ul>
        </div>
      ) : (
        <>
          <OpcionesImpresion disponibles={opcionesDe(tipo)} />
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
