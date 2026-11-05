import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { copiaDeUrl, datosCompletarRecipe, faltantesRecipe, obtenerDocumento, opcionesDeUrl } from "@/lib/documentos";
import { CompletarRecipe } from "../../completar-recipe";
import { opcionesDe } from "@/lib/documentos-opciones";
import { OpcionesImpresion } from "../../opciones";
import { BarraImpresion } from "../../barra";
import { ConstanciaAtencion } from "../../documentos";
import { TIPOS } from "../../tipos";
import { ControlTension, PlanAlimentacion } from "../../indicaciones";
import { Bienestar } from "../../bienestar";
import { OpcionesIndicaciones } from "../../opciones-indicaciones";
import { clavesPlan, diasTa } from "@/lib/indicaciones-preventivas";
import { temasBienestar } from "@/lib/bienestar";
import { leerCambios } from "@/lib/cambios-hoja";


type Props = { params: Promise<{ tipo: string; id: string }>; searchParams: Promise<{ dx?: string; sin?: string; copia?: string; dias?: string; plan?: string; tema?: string; dieta?: string; c?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { tipo } = await params;
  return { title: TIPOS[tipo as keyof typeof TIPOS]?.titulo ?? "Documento" };
}

export default async function Imprimir({ params, searchParams }: Props) {
  const { tipo, id } = await params;
  const { dx, sin, copia, dias, plan, tema, dieta, c } = await searchParams;
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
        <CompletarRecipe {...await datosCompletarRecipe(d)} />
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
          {(tipo === "control-ta" || tipo === "dieta" || tipo === "bienestar") && <OpcionesIndicaciones tipo={tipo} />}
          {tipo === "atencion" ? <ConstanciaAtencion d={d} diagnostico={dx === "1"} />
            : tipo === "control-ta" ? <ControlTension d={d} dias={diasTa(dias)} />
            : tipo === "dieta" ? <PlanAlimentacion d={d} dieta={dieta} planes={clavesPlan(plan)} cambios={leerCambios(c)} />
            : tipo === "bienestar" ? <Bienestar d={d} temas={temasBienestar(tema)} cambios={leerCambios(c)} />
            : <t.Componente d={d} />}
        </>
      )}
    </div>
  );
}
