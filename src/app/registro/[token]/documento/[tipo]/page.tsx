import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { TOKEN_REGISTRO } from "@/lib/solicitudes-paciente";
import { clienteAnonimo } from "@/lib/supabase/anonimo";
import { hoyCaracas } from "@/lib/fecha";
import { DOCS_REGISTRO, docsElegidos, documentoDeRegistro, esDocRegistro, type VistaRegistro } from "@/lib/registro-documentos";
import { Orden } from "@/app/imprimir/documentos";
import { ControlTension, PlanAlimentacion } from "@/app/imprimir/indicaciones";
import { Bienestar } from "@/app/imprimir/bienestar";
import { BarraPaciente } from "./barra";

export const metadata: Metadata = { title: "Tu documento", robots: { index: false, follow: false }, referrer: "no-referrer" };
export const dynamic = "force-dynamic";

// Un documento que el servicio le preparó al paciente al crear su enlace de registro, lleno con los datos que escribió.
// Sin sesión: documentos_registro_paciente decide con el token (llenado, vigente 7 días, no anulado ni descartado).
export default async function DocumentoRegistro({ params }: { params: Promise<{ token: string; tipo: string }> }) {
  const { token, tipo } = await params;
  if (!TOKEN_REGISTRO.test(token) || !esDocRegistro(tipo)) notFound();
  const supabase = clienteAnonimo();
  const { data } = supabase ? await supabase.rpc("documentos_registro_paciente", { p_token: token }) : { data: null };
  const v = data as VistaRegistro | null;
  if (!v || !docsElegidos(v.documentos).includes(tipo)) redirect(`/registro/${token}`);
  const d = documentoDeRegistro(v, hoyCaracas());
  const docs = v.documentos;

  return (
    <div className="min-h-dvh bg-neutral-100 print:bg-white">
      <BarraPaciente volver={`/registro/${token}`} titulo={DOCS_REGISTRO[tipo].nombre} />
      {tipo === "orden" ? <Orden d={d} />
        : tipo === "control-ta" ? <ControlTension d={d} dias={docs.control_ta?.dias ?? 7} />
        : tipo === "dieta" ? <PlanAlimentacion d={d} dieta={docs.dieta?.dieta} planes={docs.dieta?.plan ?? []} />
        : <Bienestar d={d} temas={docs.bienestar?.tema?.length ? docs.bienestar.tema : undefined} />}
    </div>
  );
}
