import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { TOKEN_REGISTRO } from "@/lib/solicitudes-paciente";
import { clienteAnonimo } from "@/lib/supabase/anonimo";
import { hoyCaracas } from "@/lib/fecha";
import { DOCS_REGISTRO, docsElegidos, esDocRegistro, esParteOrden, PARTES_ORDEN, type VistaRegistro } from "@/lib/registro-documentos";
import { HojasRegistro } from "../../../hojas";
import { limpiarVersiones } from "@/lib/hojas-version-servidor";
import { CABECERA_PDF, esChromiumDelServidor, imagenesFirmaRegistro, pdfRegistroDisponible } from "@/lib/registro-pdf";
import { BarraPaciente } from "./barra";

export const metadata: Metadata = { title: "Tu documento", robots: { index: false, follow: false }, referrer: "no-referrer" };
export const dynamic = "force-dynamic";

// Un documento que el servicio le preparó al paciente al crear su enlace de registro, lleno con los datos que escribió.
// Sin sesión: documentos_registro_paciente decide con el token (llenado, vigente 7 días, no anulado ni descartado).
// ?parte=rayos_x: una sola de las órdenes (cada clase de estudio sale aparte).
export default async function DocumentoRegistro({ params, searchParams }: { params: Promise<{ token: string; tipo: string }>; searchParams: Promise<{ parte?: string }> }) {
  const [{ token, tipo }, { parte }] = await Promise.all([params, searchParams]);
  if (!TOKEN_REGISTRO.test(token) || !esDocRegistro(tipo)) notFound();
  const supabase = clienteAnonimo();
  const [{ data }, { data: hojas }] = supabase
    ? await Promise.all([supabase.rpc("documentos_registro_paciente", { p_token: token }), supabase.rpc("hojas_registro_paciente", { p_token: token })])
    : [{ data: null }, { data: null }];
  const v = data as VistaRegistro | null;
  if (!v || !docsElegidos(v.documentos).includes(tipo)) redirect(`/registro/${token}`);
  const unaParte = tipo === "orden" && esParteOrden(parte) ? parte : undefined;
  // Firma y sello: solo cuando esta página la abre el Chromium del servidor para armar el PDF aplanado (registro-pdf.ts)
  const servidor = v.firmado && esChromiumDelServidor((await headers()).get(CABECERA_PDF));
  const imagenes = servidor ? await imagenesFirmaRegistro(token) : null;

  return (
    <div className="min-h-dvh bg-neutral-100 print:bg-white">
      {!servidor && (
        <BarraPaciente token={token} volver={`/registro/${token}`} titulo={unaParte ? `Orden de ${PARTES_ORDEN[unaParte]}` : DOCS_REGISTRO[tipo].nombre}
          pdf={v.firmado && pdfRegistroDisponible() ? { tipo, parte: unaParte } : null} />
      )}
      <HojasRegistro v={v} tipo={tipo} parte={unaParte} hoy={hoyCaracas()} versiones={limpiarVersiones(hojas as Record<string, unknown> | null)} imagenes={imagenes} />
    </div>
  );
}
