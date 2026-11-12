import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { copiaDeUrl, datosCompletarRecipe, faltantesRecipe, obtenerDocumento, opcionesDeUrl } from "@/lib/documentos";
import { CompletarRecipe } from "../../completar-recipe";
import { opcionesDe, revisionDeUrl } from "@/lib/documentos-opciones";
import { OpcionesImpresion } from "../../opciones";
import { BarraImpresion } from "../../barra";
import { ConstanciaAtencion } from "../../documentos";
import { TIPOS } from "../../tipos";
import { ControlTension, PlanAlimentacion } from "../../indicaciones";
import { Bienestar } from "../../bienestar";
import { OpcionesIndicaciones } from "../../opciones-indicaciones";
import { clavesPlan, diasTa } from "@/lib/indicaciones-preventivas";
import { esDocTrabajador } from "@/lib/whatsapp-trabajador";
import { obtenerSesion } from "@/lib/sesion";
import { temasBienestar } from "@/lib/bienestar";
import { leerCambios } from "@/lib/cambios-hoja";
import { conVersion } from "@/lib/hojas-version";
import { versionesHojas } from "@/lib/hojas-version-servidor";
import { crearClienteServidor } from "@/lib/supabase/server";


type Props = { params: Promise<{ tipo: string; id: string }>; searchParams: Promise<{ dx?: string; sin?: string; copia?: string; dias?: string; plan?: string; tema?: string; dieta?: string; c?: string; rev?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { tipo } = await params;
  return { title: TIPOS[tipo as keyof typeof TIPOS]?.titulo ?? "Documento" };
}

// Alterna solo «dx» y conserva el resto de las opciones de la URL (sin, copia, rev…)
function conDx(q: Record<string, string | undefined>, activo: boolean) {
  const p = new URLSearchParams(Object.entries(q).filter((e): e is [string, string] => typeof e[1] === "string"));
  if (activo) p.set("dx", "1");
  else p.delete("dx");
  return p;
}

export default async function Imprimir({ params, searchParams }: Props) {
  const { tipo, id } = await params;
  const consulta = await searchParams;
  const { dx, sin, copia, dias, plan, tema, dieta, c, rev } = consulta;
  const t = TIPOS[tipo as keyof typeof TIPOS];
  if (!t) notFound();
  const base = await obtenerDocumento(id);
  if (!base) notFound();
  const d = { ...base, impreso: { ...base.impreso, mostrarRevision: revisionDeUrl(rev) }, sin: opcionesDeUrl(sin), copia: copiaDeUrl(copia, base.org.ajustes) };
  const faltan = tipo === "recipe" ? faltantesRecipe(d) : [];
  const sesion = await obtenerSesion();
  // Dieta y bienestar: la versión propia del servicio, con los cambios de esta consulta encima
  const versiones = tipo === "dieta" || tipo === "bienestar" ? await versionesHojas(await crearClienteServidor()) : null;
  const trabajador = esDocTrabajador(tipo) && sesion.clinico && !sesion.demo ? { consultaId: id, tipo, servicio: d.org.nombre || sesion.organizacion } : null;

  return (
    <div className="min-h-dvh bg-neutral-100 print:bg-white">
      <BarraImpresion volver={`/atencion/${id}`} titulo={`${t.titulo} · ${d.trabajador.nombre}`} bloqueado={faltan.length > 0} trabajador={trabajador} />
      {faltan.length > 0 ? (
        <CompletarRecipe {...await datosCompletarRecipe(d)} />
      ) : (
        <>
          <OpcionesImpresion disponibles={opcionesDe(tipo)} copia={tipo === "constancia" ? d.copia : undefined} revision={base.impreso.revision} />
          {tipo === "atencion" && d.datos.diagnosticos.length > 0 && (
            <div className="mx-auto -mt-3 mb-4 flex max-w-[216mm] justify-end px-1 text-sm print:hidden">
              <Link href={`/imprimir/atencion/${id}?${conDx(consulta, dx !== "1")}`} replace className="rounded-full border bg-white px-3 py-1 hover:border-primary">
                {dx === "1" ? "Quitar diagnóstico (versión para la empresa)" : "Incluir diagnóstico (solo para el trabajador)"}
              </Link>
            </div>
          )}
          {(tipo === "control-ta" || tipo === "dieta" || tipo === "bienestar") && <OpcionesIndicaciones tipo={tipo} />}
          {tipo === "atencion" ? <ConstanciaAtencion d={d} diagnostico={dx === "1"} />
            : tipo === "control-ta" ? <ControlTension d={d} dias={diasTa(dias)} />
            : tipo === "dieta" ? <PlanAlimentacion d={d} dieta={dieta} planes={clavesPlan(plan)} cambios={conVersion(versiones, { dieta }, leerCambios(c))} />
            : tipo === "bienestar" ? <Bienestar d={d} temas={temasBienestar(tema)} cambios={conVersion(versiones, { temas: temasBienestar(tema) }, leerCambios(c))} />
            : <t.Componente d={d} />}
        </>
      )}
    </div>
  );
}
