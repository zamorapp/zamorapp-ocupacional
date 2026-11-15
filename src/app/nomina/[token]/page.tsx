import type { Metadata } from "next";
import { cookies } from "next/headers";
import { APP_NOMBRE, supabaseConfigurado } from "@/lib/config";
import { sumarDias, hoyCaracas } from "@/lib/fecha";
import { DISPOSITIVO, TOKEN_DEMO_NOMINA, TOKEN_DEPURACION, galletaNomina, venceTexto, vistaDemoNomina, type VistaDepuracion } from "@/lib/depurar-nomina";
import { clienteAnonimo } from "@/lib/supabase/anonimo";
import { LlaveTelefono } from "./llave";
import { ListaNomina } from "./lista";

export const metadata: Metadata = { title: "Revisión de nómina", robots: { index: false, follow: false }, referrer: "no-referrer" };
export const dynamic = "force-dynamic";

const AVISO: Record<Exclude<VistaDepuracion["estado"], "vigente">, { titulo: string; texto: string }> = {
  vencido: { titulo: "Este enlace venció", texto: "Pida uno nuevo al servicio médico. Lo que ya marcó no se pierde." },
  anulado: { titulo: "Este enlace ya no está activo", texto: "El servicio médico le enviará otro, o ya cambió el enlace. Lo que ya marcó no se pierde." },
  aplicado: { titulo: "¡Gracias! Ya recibimos su revisión", texto: "El servicio médico ya puso al día la nómina con lo que usted indicó." },
};

// Enlace para que RR. HH. ponga al día la nómina sin crear cuenta. Las vistas previas de WhatsApp lo abren solas:
// leerlo no cambia nada; solo los botones escriben.
export default async function RevisionNomina({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const supabase = TOKEN_DEPURACION.test(token) ? clienteAnonimo() : null;
  const disp = (await cookies()).get(galletaNomina(token))?.value ?? "";
  const { data } = supabase ? await supabase.rpc("ver_depuracion_nomina", { p_token: token, p_dispositivo: DISPOSITIVO.test(disp) ? disp : null }) : { data: null };
  const v = !supabaseConfigurado && token === TOKEN_DEMO_NOMINA ? { ...vistaDemoNomina(`${sumarDias(hoyCaracas(), 7)}T12:00:00-04:00`), acceso: DISPOSITIVO.test(disp) ? ("ok" as const) : ("telefono" as const) } : (data as VistaDepuracion | null);

  return (
    <main className="min-h-dvh bg-muted/30">
      <div className="mx-auto w-full max-w-6xl space-y-4 px-4 pt-5 pb-28 sm:pt-8">
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icono.svg" alt="" className="size-10 rounded-xl" />
          <div className="min-w-0">
            <p className="truncate font-semibold">{v?.servicio ?? APP_NOMBRE}</p>
            <p className="truncate text-xs text-muted-foreground">{v?.empresa ? `Revisión de nómina · ${v.empresa}` : "Salud ocupacional"}</p>
          </div>
        </div>
        {!v ? (
          <section className="rounded-2xl border bg-card p-6 shadow-sm">
            <h1 className="text-xl font-semibold">Enlace no válido</h1>
            <p className="mt-1 text-sm text-muted-foreground">Abra de nuevo el enlace completo que le enviaron, o pida uno nuevo al servicio médico.</p>
          </section>
        ) : v.estado !== "vigente" ? (
          <section className="rounded-2xl border bg-card p-6 shadow-sm">
            <h1 className="text-xl font-semibold">{AVISO[v.estado].titulo}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{AVISO[v.estado].texto}</p>
          </section>
        ) : v.acceso === "bloqueado" ? (
          <section className="rounded-2xl border bg-card p-6 shadow-sm">
            <h1 className="text-xl font-semibold">Enlace bloqueado</h1>
            <p className="mt-1 text-sm text-muted-foreground">Se bloqueó por varios intentos con un teléfono equivocado. Pida al servicio médico que lo desbloquee.</p>
          </section>
        ) : v.acceso === "telefono_otro" ? (
          <section className="rounded-2xl border bg-card p-6 shadow-sm">
            <h1 className="text-xl font-semibold">Este enlace ya se abrió en otro teléfono</h1>
            <p className="mt-1 text-sm text-muted-foreground">Por seguridad, solo funciona en el teléfono donde se abrió primero. Si cambió de teléfono, pida al servicio médico que le permita usar este.</p>
          </section>
        ) : v.acceso !== "ok" ? (
          <LlaveTelefono token={token} nombre={v.rrhh} />
        ) : (
          <>
            <section className="rounded-2xl bg-primary p-5 text-primary-foreground shadow-sm sm:p-6">
              <h1 className="text-2xl font-semibold tracking-tight">Ayúdenos a poner al día su nómina</h1>
              <p className="mt-1 text-sm opacity-90">
                Tenemos <b>{v.trabajadores.length}</b> trabajadores registrados de su empresa. Díganos quién sigue, quién ya no está y quién falta, para programar sus evaluaciones.
              </p>
              <ol className="mt-4 grid grid-cols-1 gap-2 text-sm sm:grid-cols-3">
                {["Toque «Sigue» o «Ya no está» en cada persona", "Agregue a quien falte en la lista", "Pulse «Enviar a " + (v.servicio.split(" ")[0] || "nosotros") + "»"].map((t, i) => (
                  <li key={t} className="flex items-center gap-2.5">
                    <span className="grid size-6 shrink-0 place-items-center rounded-full bg-white/20 text-xs font-bold">{i + 1}</span>{t}
                  </li>
                ))}
              </ol>
              <p className="mt-3 inline-block rounded-lg bg-white/15 px-3 py-2 text-xs sm:text-sm">
                Este enlace vence el {venceTexto(v.vence)}. Se guarda solo: puede cerrar y volver.
              </p>
            </section>
            <ListaNomina token={token} vista={v} />
          </>
        )}
      </div>
    </main>
  );
}
