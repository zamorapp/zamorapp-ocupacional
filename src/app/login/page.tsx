import type { Metadata } from "next";
import { ShieldCheck, Stethoscope, Timer } from "lucide-react";
import { APP_NOMBRE, supabaseConfigurado } from "@/lib/config";
import { FormularioLogin } from "./formulario-login";

export const metadata: Metadata = { title: "Ingresar" };

const PUNTOS = [
  { icono: Stethoscope, texto: "Consulta, aptitud y reposo en un solo flujo" },
  { icono: Timer, texto: "Alertas de plazos legales antes de que venzan" },
  { icono: ShieldCheck, texto: "La historia clínica solo la ve el personal de salud" },
];

export default function PaginaLogin() {
  return (
    <main className="grid min-h-dvh lg:grid-cols-[1.1fr_1fr]">
      <section className="relative hidden overflow-hidden bg-gradient-to-br from-teal-700 via-teal-800 to-cyan-950 p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="pointer-events-none absolute -right-24 -top-24 size-96 rounded-full bg-white/5" />
        <div className="pointer-events-none absolute -bottom-32 -left-16 size-[28rem] rounded-full bg-white/5" />
        <Marca claro />
        <div className="relative max-w-md space-y-8">
          <h1 className="text-4xl font-semibold leading-tight tracking-tight">
            Salud ocupacional con datos, no con papeles.
          </h1>
          <ul className="space-y-4">
            {PUNTOS.map(({ icono: Icono, texto }) => (
              <li key={texto} className="flex items-center gap-3 text-teal-50/90">
                <span className="grid size-9 place-items-center rounded-lg bg-white/10">
                  <Icono className="size-5" />
                </span>
                {texto}
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-sm text-teal-100/70">LOPCYMAT · NT-04-2023 · NT-02-2008 · COVENIN 474</p>
      </section>

      <section className="flex items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-sm space-y-8">
          <div className="lg:hidden">
            <Marca />
          </div>
          <div className="space-y-2">
            <h2 className="text-2xl font-semibold tracking-tight">Bienvenido</h2>
            <p className="text-muted-foreground">Ingresa con tu usuario o tu correo.</p>
          </div>
          <FormularioLogin modoDemo={!supabaseConfigurado} />
        </div>
      </section>
    </main>
  );
}

function Marca({ claro = false }: { claro?: boolean }) {
  return (
    <div className="relative flex items-center gap-3">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/icono.svg" alt="" className="size-10 rounded-xl ring-1 ring-white/20" />
      <span className={claro ? "text-lg font-semibold" : "text-lg font-semibold text-foreground"}>{APP_NOMBRE}</span>
    </div>
  );
}
