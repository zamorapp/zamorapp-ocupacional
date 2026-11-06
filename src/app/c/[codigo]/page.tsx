import type { Metadata } from "next";
import Link from "next/link";
import { APP_NOMBRE, supabaseConfigurado } from "@/lib/config";
import { CODIGO_DEMO, CODIGO_PSICOSOCIAL, normalizarCodigo } from "@/lib/psicosocial";
import { clienteAnonimo } from "@/lib/supabase/anonimo";
import { Cuestionario } from "./cuestionario";

export const metadata: Metadata = { title: "Cuestionario de condiciones de trabajo", robots: { index: false, follow: false }, referrer: "no-referrer" };
export const dynamic = "force-dynamic";

type Vista = { estado: "vigente" | "usado" | "cerrado"; servicio: string; empresa: string | null; grupos: { id: string; nombre: string }[] | null };

const AVISO: Record<Exclude<Vista["estado"], "vigente">, { titulo: string; texto: string }> = {
  usado: { titulo: "Este código ya se usó", texto: "Cada código sirve una sola vez. Si no fuiste tú, pide otro al servicio médico o al Comité de Seguridad y Salud Laboral." },
  cerrado: { titulo: "Esta evaluación ya cerró", texto: "Gracias por tu interés. Pregunta al Comité de Seguridad y Salud Laboral por los resultados y las medidas acordadas." },
};

// Cuestionario psicosocial anónimo: el trabajador entra con el código de su papelito (o del WhatsApp). Sin cuenta,
// sin nombre, sin cédula. La base guarda la respuesta sin unirla al código.
export default async function CuestionarioPsicosocial({ params }: { params: Promise<{ codigo: string }> }) {
  const { codigo: crudo } = await params;
  const codigo = normalizarCodigo(decodeURIComponent(crudo));
  const supabase = CODIGO_PSICOSOCIAL.test(codigo) ? clienteAnonimo() : null;
  const { data } = supabase ? await supabase.rpc("ver_cuestionario_psicosocial", { p_codigo: codigo }) : { data: null };
  // Modo demo (sin base): el código de ejemplo abre el cuestionario para conocerlo; no guarda nada
  const v = !supabaseConfigurado && codigo === CODIGO_DEMO
    ? { estado: "vigente" as const, servicio: "Servicio de salud ocupacional (demo)", empresa: "Comercial Ejemplo, C.A.", grupos: [{ id: "g1", nombre: "Cajeras y taquilla" }, { id: "g2", nombre: "Almacén y despacho" }, { id: "g3", nombre: "Administración" }] }
    : (data as Vista[] | null)?.[0];

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
            <h1 className="text-xl font-semibold">Código no válido</h1>
            <p className="mt-1 text-sm text-muted-foreground">Revisa las 8 letras y números de tu papelito (sin O ni I) o abre de nuevo el enlace completo.</p>
            <Link href="/c" className="mt-4 inline-flex min-h-10 items-center rounded-full border px-4 text-sm font-medium hover:border-primary">Escribir mi código</Link>
          </section>
        ) : v.estado !== "vigente" ? (
          <section className="rounded-2xl border bg-card p-6 shadow-sm">
            <h1 className="text-xl font-semibold">{AVISO[v.estado].titulo}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{AVISO[v.estado].texto}</p>
          </section>
        ) : (
          <Cuestionario codigo={codigo} grupos={v.grupos ?? []} />
        )}
      </div>
    </main>
  );
}
