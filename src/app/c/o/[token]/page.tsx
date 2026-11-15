import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Clock, EyeOff, ShieldCheck, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { APP_NOMBRE, supabaseConfigurado } from "@/lib/config";
import { CODIGO_DEMO, CODIGO_PSICOSOCIAL, ENLACE_OFICINA, TOKEN_DEMO } from "@/lib/psicosocial";
import { clienteAnonimo } from "@/lib/supabase/anonimo";

export const metadata: Metadata = { title: "Cuestionario de condiciones de trabajo", robots: { index: false, follow: false }, referrer: "no-referrer" };
export const dynamic = "force-dynamic";

type Vista = { estado: "vigente" | "agotado" | "cerrado"; servicio: string; empresa: string | null };
// La cookie recuerda qué código recibió ESTE teléfono: si vuelve a abrir el enlace, sigue con el mismo (o ve que ya
// respondió) en vez de gastar otro cupo. Solo guarda el código, nunca respuestas.
const galleta = (token: string) => `psico_${token.slice(0, 12)}`;

const AVISO: Record<Exclude<Vista["estado"], "vigente">, { titulo: string; texto: string }> = {
  agotado: { titulo: "Ya respondieron todos", texto: "Este enlace llegó al número de trabajadores previsto. Si te falta responder, pide un código al servicio médico o al Comité de Seguridad y Salud Laboral." },
  cerrado: { titulo: "Esta evaluación ya cerró", texto: "Gracias por tu interés. Pregunta al Comité de Seguridad y Salud Laboral por los resultados y las medidas acordadas." },
};

async function empezar(form: FormData) {
  "use server";
  const token = String(form.get("token") ?? "");
  if (!ENLACE_OFICINA.test(token)) redirect("/c");
  const almacen = await cookies();
  const previo = almacen.get(galleta(token))?.value ?? "";
  if (CODIGO_PSICOSOCIAL.test(previo)) redirect(`/c/${previo}`);
  if (!supabaseConfigurado && token === TOKEN_DEMO) redirect(`/c/${CODIGO_DEMO}`);
  const supabase = clienteAnonimo();
  const { data } = supabase ? await supabase.rpc("tomar_codigo_psicosocial", { p_token: token }) : { data: null };
  const codigo = typeof data === "string" && CODIGO_PSICOSOCIAL.test(data) ? data : null;
  if (!codigo) redirect(`/c/o/${token}?sin=1`);
  almacen.set(galleta(token), codigo, { path: "/c", maxAge: 60 * 60 * 24 * 60, sameSite: "lax", httpOnly: true, secure: process.env.NODE_ENV === "production" });
  redirect(`/c/${codigo}`);
}

// Enlace ÚNICO de la oficina: se manda al grupo de WhatsApp. No gasta cupo al abrirlo (las vistas previas de WhatsApp
// lo abren solas): el código se entrega solo al pulsar «Empezar».
export default async function EnlaceOficina({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ sin?: string }> }) {
  const { token } = await params;
  const { sin } = await searchParams;
  const valido = ENLACE_OFICINA.test(token);
  const supabase = valido ? clienteAnonimo() : null;
  const { data } = supabase ? await supabase.rpc("ver_enlace_psicosocial", { p_token: token }) : { data: null };
  const v: Vista | undefined = !supabaseConfigurado && token === TOKEN_DEMO
    ? { estado: "vigente", servicio: "Servicio de salud ocupacional (demo)", empresa: "Comercial Ejemplo, C.A." }
    : (data as Vista[] | null)?.[0];
  const estado = v && sin && v.estado === "vigente" ? "agotado" : v?.estado;

  return (
    <main className="min-h-dvh bg-muted/30 px-4 py-6 sm:py-10">
      <div className="mx-auto w-full max-w-xl space-y-5">
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icono.svg" alt="" className="size-10 rounded-xl" />
          <div className="min-w-0">
            <p className="truncate font-semibold">{v?.servicio ?? APP_NOMBRE}</p>
            <p className="truncate text-xs text-muted-foreground">{v?.empresa ? `Evaluación de riesgos psicosociales · ${v.empresa}` : "Salud ocupacional"}</p>
          </div>
        </div>
        {!v ? (
          <section className="rounded-2xl border bg-card p-6 shadow-sm">
            <h1 className="text-xl font-semibold">Enlace no válido</h1>
            <p className="mt-1 text-sm text-muted-foreground">Abre de nuevo el enlace completo que te mandaron, o pide uno nuevo al servicio médico.</p>
          </section>
        ) : estado !== "vigente" ? (
          <section className="rounded-2xl border bg-card p-6 shadow-sm">
            <h1 className="text-xl font-semibold">{AVISO[estado as "agotado" | "cerrado"].titulo}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{AVISO[estado as "agotado" | "cerrado"].texto}</p>
          </section>
        ) : (
          <form action={empezar} className="space-y-5">
            <input type="hidden" name="token" value={token} />
            <section className="rounded-2xl bg-primary p-6 text-primary-foreground shadow-sm">
              <Users className="size-8 opacity-90" />
              <h1 className="mt-3 text-2xl font-semibold tracking-tight">¿Cómo es tu trabajo?</h1>
              <p className="mt-1 text-sm opacity-90">Encuesta para todo tu equipo. 38 preguntas cortas, una por pantalla: tocas tu respuesta y pasa sola.</p>
              <ul className="mt-4 grid grid-cols-1 gap-2 text-sm sm:grid-cols-3">
                <li className="flex items-center gap-2"><EyeOff className="size-4 shrink-0" /> Anónima</li>
                <li className="flex items-center gap-2"><Clock className="size-4 shrink-0" /> Unos 8 minutos</li>
                <li className="flex items-center gap-2"><ShieldCheck className="size-4 shrink-0" /> Voluntaria</li>
              </ul>
            </section>
            <p className="px-1 text-sm text-muted-foreground">Cada persona responde una vez desde su propio teléfono. No te pedimos nombre ni cédula, y nadie verá tus respuestas una por una.</p>
            <Button type="submit" className="h-12 w-full text-base">Empezar</Button>
          </form>
        )}
      </div>
    </main>
  );
}
