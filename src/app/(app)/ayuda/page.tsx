import type { Metadata } from "next";
import { BookOpen } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { MANUAL, MANUAL_ACTUALIZADO } from "@/lib/manual";
import { obtenerSesion } from "@/lib/sesion";
import { BotonImprimir } from "./imprimir";

export const metadata: Metadata = { title: "Manual de uso" };

export default async function Ayuda() {
  const sesion = await obtenerSesion();
  const empresa = sesion.rol === "gerente_empresa";
  const temas = MANUAL.filter((t) => t.para === "todos" || t.para === (empresa ? "empresa" : "servicio"));

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight sm:text-3xl"><BookOpen className="text-primary" /> Manual de uso</h1>
          <p className="text-muted-foreground">Cómo usar cada parte de zamorApp. Actualizado el {MANUAL_ACTUALIZADO.split("-").reverse().join("/")}.</p>
        </div>
        <BotonImprimir />
      </div>

      <Card className="print:hidden">
        <CardContent className="flex flex-wrap gap-2">
          {temas.map((t) => (
            <a key={t.id} href={`#${t.id}`} className="rounded-full border px-3 py-1 text-sm transition hover:border-primary/50 hover:text-primary">{t.titulo}</a>
          ))}
        </CardContent>
      </Card>

      {temas.map((t, i) => (
        <section key={t.id} id={t.id} className="scroll-mt-20 break-inside-avoid rounded-xl border bg-card p-5 sm:p-6">
          <h2 className="text-lg font-semibold">{i + 1}. {t.titulo}</h2>
          <p className="mt-1 text-muted-foreground">{t.resumen}</p>
          <ol className="mt-4 list-decimal space-y-2 pl-5">
            {t.pasos.map((p) => <li key={p}>{p}</li>)}
          </ol>
          {t.consejos && (
            <div className="mt-4 rounded-lg bg-primary/5 px-4 py-3 text-sm">
              {t.consejos.map((c) => <p key={c}>💡 {c}</p>)}
            </div>
          )}
        </section>
      ))}
    </div>
  );
}
