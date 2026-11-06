import type { Metadata } from "next";
import Link from "next/link";
import { AlarmClock, CheckCircle2, ChevronRight, Clock, FileCheck2, FileText, ShieldCheck, Stethoscope, Upload } from "lucide-react";
import { APP_NOMBRE } from "@/lib/config";
import { aQuien, TOKEN_REGISTRO } from "@/lib/solicitudes-paciente";
import { clienteAnonimo } from "@/lib/supabase/anonimo";
import { hoyCaracas, sumarDias } from "@/lib/fecha";
import { filasRegistro, fraseIndicaciones, remitente, type VistaRegistro } from "@/lib/registro-documentos";
import { FormularioRegistro, type CatalogoRegistro } from "./formulario";
import { EnviarResultados, type EstadoResultados } from "./resultados";
import { MarcarAbierto } from "./abierto";

export const metadata: Metadata = { title: "Pide tu consulta", robots: { index: false, follow: false }, referrer: "no-referrer" };
export const dynamic = "force-dynamic";

type Vista = { estado: "vigente" | "usado" | "vencido" | "anulado"; servicio: string; telefono_servicio: string | null; nombre: string | null; empresa: string | null; motivos: { id: string; nombre: string }[] | null };

const horaCaracas = (iso: string) => new Intl.DateTimeFormat("es-VE", { timeZone: "America/Caracas", hour: "numeric", minute: "2-digit", hour12: true }).format(new Date(iso));

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
  // y, por 30 días desde que llenó, la opción de subir sus resultados
  const [docs, resultados, catalogo, descargados] = supabase && v ? await Promise.all([
    v.estado === "usado" ? supabase.rpc("documentos_registro_paciente", { p_token: token }).then((r) => r.data as VistaRegistro | null) : null,
    v.estado === "usado" ? supabase.rpc("resultados_registro_paciente", { p_token: token }).then((r) => r.data as EstadoResultados | null) : null,
    v.estado === "vigente" ? supabase.rpc("catalogo_registro_paciente", { p_token: token }).then((r) => r.data as CatalogoRegistro | null) : null,
    // Ya bajó sus hojas y pasó la ventana: el enlace queda solo para subir resultados (20261030915000)
    v.estado === "usado" ? supabase.rpc("descarga_cerrada_registro", { p_token: token }).then((r) => r.data === true) : false,
  ]) : [null, null, null, false];
  const quien = resultados?.remitente ?? v?.servicio ?? "";

  return (
    <main className="min-h-dvh bg-muted/30 px-4 py-6 sm:py-10">
      <div className="mx-auto w-full max-w-lg space-y-5">
        {v && supabase && <MarcarAbierto token={token} />}
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
          <>
          <section role="status" className="space-y-4 rounded-2xl border bg-card p-6 shadow-sm">
            <div className="space-y-1 text-center">
              <CheckCircle2 className="mx-auto size-12 text-ok" />
              <h1 className="text-xl font-semibold">¡Listo, {docs.persona.nombres.split(" ")[0]}!</h1>
              <p className="text-sm text-muted-foreground">{fraseIndicaciones(remitente(docs), docs.documentos.conversadas)} Descárgalas y tenlas a mano.</p>
            </div>
            <ul className="space-y-2">
              {filasRegistro(docs.documentos).map((f) => (
                <li key={f.parte ?? f.tipo}>
                  <Link href={`/registro/${token}/documento/${f.tipo}${f.parte ? `?parte=${f.parte}` : ""}`} className="flex min-h-14 items-center gap-3 rounded-xl border bg-background px-4 py-3 font-medium transition hover:border-primary">
                    <FileText className="size-5 shrink-0 text-primary" />
                    <span className="min-w-0 flex-1">{f.nombre}{f.detalle && <span className="block truncate text-xs font-normal text-muted-foreground">{f.detalle}</span>}</span>
                    <ChevronRight className="size-4 text-muted-foreground" />
                  </Link>
                </li>
              ))}
            </ul>
            <p className="text-center text-xs text-muted-foreground">Ábrelos y toca «Descargar PDF».</p>
            <p className="flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100">
              <AlarmClock className="mt-0.5 size-5 shrink-0" />
              <span>
                {docs.descarga_hasta
                  ? <>Puedes descargarlos hasta las <b>{horaCaracas(docs.descarga_hasta)}</b>. Después, este enlace queda solo para enviar tus resultados.</>
                  : <>Tienes 30 minutos desde la primera descarga para bajarlos todos. Después, este enlace queda solo para enviar tus resultados.</>}
              </span>
            </p>
            <p className="rounded-xl bg-primary/10 px-4 py-3 text-center text-sm">Cuando tengas tus resultados, vuelve a este mismo enlace y súbelos abajo, en «Enviar mis resultados».</p>
          </section>
          {resultados && <EnviarResultados token={token} servicio={v.servicio} telefono={v.telefono_servicio} estado={resultados} />}
          </>
        ) : descargados ? (
          <>
          {/* Ya descargó: no se vuelven a bajar; para otra copia, el servicio manda un enlace nuevo */}
          <section role="status" className="space-y-3 rounded-2xl border bg-card p-6 text-center shadow-sm">
            <FileCheck2 className="mx-auto size-12 text-ok" />
            <h1 className="text-xl font-semibold">El tiempo para descargar tus documentos terminó</h1>
            <p className="text-sm text-muted-foreground">Tus documentos ya fueron descargados. Si necesitas descargarlos de nuevo, pídele un enlace nuevo {aQuien(quien)}{v.telefono_servicio && <> al <a className="font-medium text-primary" href={`tel:${v.telefono_servicio}`}>{v.telefono_servicio}</a></>}.</p>
            {resultados && <a href="#resultados" className="inline-flex h-12 min-h-12 w-full items-center justify-center gap-2 rounded-md bg-primary px-6 text-base font-medium text-primary-foreground sm:w-auto"><Upload className="size-5" /> Subir mis resultados</a>}
          </section>
          {resultados && <EnviarResultados token={token} servicio={v.servicio} telefono={v.telefono_servicio} estado={resultados} />}
          </>
        ) : v.estado !== "vigente" ? (
          <>
          <section className="rounded-2xl border bg-card p-6 shadow-sm">
            <h1 className="text-xl font-semibold">{AVISO[v.estado].titulo}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{AVISO[v.estado].texto}</p>
            {v.telefono_servicio && <p className="mt-3 text-sm">Teléfono del servicio: <a className="font-medium text-primary" href={`tel:${v.telefono_servicio}`}>{v.telefono_servicio}</a></p>}
          </section>
          {resultados && <EnviarResultados token={token} servicio={v.servicio} telefono={v.telefono_servicio} estado={resultados} />}
          </>
        ) : (
          <>
            <section className="rounded-2xl bg-primary p-5 text-primary-foreground shadow-sm">
              <h1 className="text-2xl font-semibold tracking-tight">{v.nombre ? `Hola ${v.nombre.split(" ")[0]},` : "Hola,"} {catalogo?.registrado ? "tus documentos están listos" : "pide tu consulta"}</h1>
              <p className="mt-1 text-sm opacity-90">{catalogo?.registrado
                ? "Ábrelos y descárgalos. Cuando tengas tus resultados, vuelve a este mismo enlace para enviarlos."
                : "Llena tus datos para tu consulta y te confirmamos el día y la hora por WhatsApp."}</p>
              <ul className="mt-4 grid grid-cols-1 gap-2 text-sm sm:grid-cols-3">
                <li className="flex items-center gap-2"><Clock className="size-4 shrink-0" /> {catalogo?.registrado ? (catalogo.faltan?.length ? "Toma 1 minuto" : "Un toque") : "Toma 5 minutos"}</li>
                <li className="flex items-center gap-2"><Stethoscope className="size-4 shrink-0" /> Lo revisa el servicio</li>
                <li className="flex items-center gap-2"><ShieldCheck className="size-4 shrink-0" /> Datos protegidos</li>
              </ul>
            </section>
            <FormularioRegistro token={token} servicio={v.servicio} empresa={v.empresa} motivos={v.motivos ?? []} hoy={hoy} maximo={sumarDias(hoy, 90)} catalogo={catalogo} />
          </>
        )}
      </div>
    </main>
  );
}
