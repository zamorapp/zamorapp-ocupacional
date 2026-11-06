import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2, ChevronRight, Clock, FileText, ShieldCheck, Stethoscope } from "lucide-react";
import { APP_NOMBRE } from "@/lib/config";
import { TOKEN_REGISTRO } from "@/lib/solicitudes-paciente";
import { clienteAnonimo } from "@/lib/supabase/anonimo";
import { hoyCaracas, sumarDias } from "@/lib/fecha";
import { DOCS_REGISTRO, docsElegidos, remitente, type VistaRegistro } from "@/lib/registro-documentos";
import { FormularioRegistro } from "./formulario";

export const metadata: Metadata = { title: "Pide tu consulta", robots: { index: false, follow: false }, referrer: "no-referrer" };
export const dynamic = "force-dynamic";

type Vista = { estado: "vigente" | "usado" | "vencido" | "anulado"; servicio: string; telefono_servicio: string | null; nombre: string | null; empresa: string | null; motivos: { id: string; nombre: string }[] | null };

const AVISO: Record<Exclude<Vista["estado"], "vigente">, { titulo: string; texto: string }> = {
  usado: { titulo: "Tus datos ya se enviaron", texto: "El servicio médico los está revisando y te confirmará la cita por WhatsApp." },
  vencido: { titulo: "Este enlace venció", texto: "Dura 7 días. Pide uno nuevo al servicio médico." },
  anulado: { titulo: "Este enlace fue anulado", texto: "Pide uno nuevo al servicio médico." },
};

// Enlace que el servicio manda por WhatsApp: el paciente escribe sus datos y lo que necesita. No crea nada en la
// historia: queda «por revisar» hasta que el servicio lo acepta. Sin cuenta y sin sesión.
export default async function Registro({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const supabase = TOKEN_REGISTRO.test(token) ? clienteAnonimo() : null;
  const { data } = supabase ? await supabase.rpc("ver_solicitud_paciente", { p_token: token }) : { data: null };
  const v = (data as Vista[] | null)?.[0];
  const hoy = hoyCaracas();
  // Ya llenó sus datos: si el servicio le dejó documentos, se los muestra para descargar (7 días)
  const docs = supabase && v?.estado === "usado" ? ((await supabase.rpc("documentos_registro_paciente", { p_token: token })).data as VistaRegistro | null) : null;

  return (
    <main className="min-h-dvh bg-muted/30 px-4 py-6 sm:py-10">
      <div className="mx-auto w-full max-w-lg space-y-5">
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icono.svg" alt="" className="size-10 rounded-xl" />
          <div className="min-w-0">
            <p className="truncate font-semibold">{v?.servicio ?? APP_NOMBRE}</p>
            <p className="text-xs text-muted-foreground">Salud ocupacional</p>
          </div>
        </div>
        {!v ? (
          <section className="rounded-2xl border bg-card p-6 shadow-sm">
            <h1 className="text-xl font-semibold">Enlace no válido</h1>
            <p className="mt-1 text-sm text-muted-foreground">Revisa que lo abriste completo o pide uno nuevo al servicio médico.</p>
          </section>
        ) : docs ? (
          <section role="status" className="space-y-4 rounded-2xl border bg-card p-6 shadow-sm">
            <div className="space-y-1 text-center">
              <CheckCircle2 className="mx-auto size-12 text-ok" />
              <h1 className="text-xl font-semibold">¡Listo, {docs.persona.nombres.split(" ")[0]}!</h1>
              <p className="text-sm text-muted-foreground">Puedes descargar lo que te envía <b className="text-foreground">{remitente(docs)}</b>.</p>
            </div>
            <ul className="space-y-2">
              {docsElegidos(docs.documentos).map((t) => (
                <li key={t}>
                  <Link href={`/registro/${token}/documento/${t}`} className="flex min-h-14 items-center gap-3 rounded-xl border bg-background px-4 py-3 font-medium transition hover:border-primary">
                    <FileText className="size-5 shrink-0 text-primary" />
                    <span className="flex-1">{DOCS_REGISTRO[t].nombre}{t === "orden" && docs.documentos.orden?.perfil && <span className="block text-xs font-normal text-muted-foreground">{docs.documentos.orden.perfil}</span>}</span>
                    <ChevronRight className="size-4 text-muted-foreground" />
                  </Link>
                </li>
              ))}
            </ul>
            <p className="text-center text-xs text-muted-foreground">Ábrelos y toca «Descargar PDF». Este enlace los guarda por 7 días. Te confirmaremos tu cita por WhatsApp.</p>
          </section>
        ) : v.estado !== "vigente" ? (
          <section className="rounded-2xl border bg-card p-6 shadow-sm">
            <h1 className="text-xl font-semibold">{AVISO[v.estado].titulo}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{AVISO[v.estado].texto}</p>
            {v.telefono_servicio && <p className="mt-3 text-sm">Teléfono del servicio: <a className="font-medium text-primary" href={`tel:${v.telefono_servicio}`}>{v.telefono_servicio}</a></p>}
          </section>
        ) : (
          <>
            <section className="rounded-2xl bg-primary p-5 text-primary-foreground shadow-sm">
              <h1 className="text-2xl font-semibold tracking-tight">{v.nombre ? `Hola ${v.nombre.split(" ")[0]},` : "Hola,"} pide tu consulta</h1>
              <p className="mt-1 text-sm opacity-90">Llena tus datos y te confirmamos el día y la hora por WhatsApp.</p>
              <ul className="mt-4 grid grid-cols-1 gap-2 text-sm sm:grid-cols-3">
                <li className="flex items-center gap-2"><Clock className="size-4 shrink-0" /> Toma 2 minutos</li>
                <li className="flex items-center gap-2"><Stethoscope className="size-4 shrink-0" /> Lo revisa el servicio</li>
                <li className="flex items-center gap-2"><ShieldCheck className="size-4 shrink-0" /> Datos protegidos</li>
              </ul>
            </section>
            <FormularioRegistro token={token} servicio={v.servicio} empresa={v.empresa} motivos={v.motivos ?? []} hoy={hoy} maximo={sumarDias(hoy, 90)} />
          </>
        )}
      </div>
    </main>
  );
}
