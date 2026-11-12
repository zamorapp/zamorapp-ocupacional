import type { Metadata } from "next";
import { Clock, FileCheck2, ShieldCheck, Stethoscope, Upload } from "lucide-react";
import { MarcoEnlace, TarjetaEnlace } from "@/components/enlace/marco-enlace";
import { APP_NOMBRE } from "@/lib/config";
import { aQuien, TOKEN_REGISTRO } from "@/lib/solicitudes-paciente";
import { clienteAnonimo } from "@/lib/supabase/anonimo";
import { hoyCaracas, sumarDias } from "@/lib/fecha";
import { type VistaRegistro } from "@/lib/registro-documentos";
import { FormularioRegistro, type CatalogoRegistro } from "./formulario";
import { EnviarResultados, type EstadoResultados } from "./resultados";
import { MarcarAbierto } from "./abierto";
import { DocumentosListos } from "./documentos-listos";

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
    <MarcoEnlace servicio={v?.servicio ?? APP_NOMBRE} subtitulo="Salud ocupacional">
        {v && supabase && <MarcarAbierto token={token} />}
        {!v ? (
          <TarjetaEnlace>
            <h1 className="text-xl font-semibold">Enlace no válido</h1>
            <p className="mt-1 text-sm text-muted-foreground">Revisa que lo abriste completo o pide uno nuevo al servicio médico.</p>
          </TarjetaEnlace>
        ) : docs ? (
          <>
          <DocumentosListos token={token} docs={docs} />
          {resultados && <EnviarResultados token={token} servicio={v.servicio} telefono={v.telefono_servicio} estado={resultados} />}
          </>
        ) : descargados ? (
          <>
          {/* Ya descargó: no se vuelven a bajar; para otra copia, el servicio manda un enlace nuevo */}
          <TarjetaEnlace role="status" className="space-y-3 text-center">
            <FileCheck2 className="mx-auto size-12 text-ok" />
            <h1 className="text-xl font-semibold">El tiempo para descargar tus documentos terminó</h1>
            <p className="text-sm text-muted-foreground">Tus documentos ya fueron descargados. Si necesitas descargarlos de nuevo, pídele un enlace nuevo {aQuien(quien)}{v.telefono_servicio && <> al <a className="font-medium text-primary" href={`tel:${v.telefono_servicio}`}>{v.telefono_servicio}</a></>}.</p>
            {resultados && <a href="#resultados" className="inline-flex h-12 min-h-12 w-full items-center justify-center gap-2 rounded-md bg-primary px-6 text-base font-medium text-primary-foreground sm:w-auto"><Upload className="size-5" /> Subir mis resultados</a>}
          </TarjetaEnlace>
          {resultados && <EnviarResultados token={token} servicio={v.servicio} telefono={v.telefono_servicio} estado={resultados} />}
          </>
        ) : v.estado !== "vigente" ? (
          <>
          <TarjetaEnlace>
            <h1 className="text-xl font-semibold">{AVISO[v.estado].titulo}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{AVISO[v.estado].texto}</p>
            {v.telefono_servicio && <p className="mt-3 text-sm">Teléfono del servicio: <a className="font-medium text-primary" href={`tel:${v.telefono_servicio}`}>{v.telefono_servicio}</a></p>}
          </TarjetaEnlace>
          {resultados && <EnviarResultados token={token} servicio={v.servicio} telefono={v.telefono_servicio} estado={resultados} />}
          </>
        ) : (
          <>
            <TarjetaEnlace className="relative overflow-hidden border-0 bg-gradient-to-br from-primary to-[color-mix(in_oklch,var(--primary)_70%,black)] p-5 text-primary-foreground">
              <span aria-hidden className="pointer-events-none absolute -right-10 -top-10 size-36 rounded-full bg-white/10" />
              <h1 className="text-2xl font-semibold tracking-tight">{v.nombre ? `Hola ${v.nombre.split(" ")[0]},` : "Hola,"} {catalogo?.registrado ? "tus documentos están listos" : catalogo?.solo_registro ? "regístrate en 1 minuto" : "pide tu consulta"}</h1>
              <p className="mt-1 text-sm opacity-90">{catalogo?.registrado
                ? "Ábrelos y descárgalos. Cuando tengas tus resultados, vuelve a este mismo enlace para enviarlos."
                : catalogo?.solo_registro ? "Llena tus datos y, si te prepararon documentos, te aparecen para descargar."
                : "Llena tus datos para tu consulta y te confirmamos el día y la hora por WhatsApp."}</p>
              <ul className="mt-4 grid grid-cols-1 gap-2 text-sm sm:grid-cols-3">
                <li className="flex items-center gap-2"><Clock className="size-4 shrink-0" /> {catalogo?.registrado ? (catalogo.faltan?.length ? "Toma 1 minuto" : "Toma 10 segundos") : catalogo?.solo_registro ? "Toma 1 minuto" : "Toma 5 minutos"}</li>
                <li className="flex items-center gap-2"><Stethoscope className="size-4 shrink-0" /> Lo revisa el servicio</li>
                <li className="flex items-center gap-2"><ShieldCheck className="size-4 shrink-0" /> Datos protegidos</li>
              </ul>
            </TarjetaEnlace>
            <FormularioRegistro token={token} servicio={v.servicio} telefono={v.telefono_servicio} empresa={v.empresa} motivos={v.motivos ?? []} hoy={hoy} maximo={sumarDias(hoy, 90)} catalogo={catalogo} />
          </>
        )}
    </MarcoEnlace>
  );
}
