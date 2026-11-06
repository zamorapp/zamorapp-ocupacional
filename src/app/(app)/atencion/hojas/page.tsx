import type { Metadata } from "next";
import Link from "next/link";
import { Activity, ArrowLeft, ExternalLink, Eye, FlaskConical, Gauge, Salad } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DIETAS } from "@/lib/dietas";
import { BOTONES_BIENESTAR } from "@/lib/bienestar";
import { opciones } from "@/lib/listas";
import { obtenerSesion } from "@/lib/sesion";
import { resumenPerfiles } from "@/lib/registro-documentos-servidor";

export const metadata: Metadata = { title: "Hojas para el paciente" };
export const dynamic = "force-dynamic";

const ver = (q: Record<string, string>) => `/imprimir/registro-previa?${new URLSearchParams({ nombre: "Nombre del paciente", ...q })}`;

function Ver({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className="flex min-h-12 items-center gap-3 rounded-lg border bg-background px-3 py-2 text-sm transition hover:border-primary">
      <span className="min-w-0 flex-1">{children}</span>
      <span className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-primary"><Eye className="size-3.5" /> Ver <ExternalLink className="size-3" aria-hidden /></span>
    </a>
  );
}

// Todo lo que se le puede entregar al paciente (en la consulta o con «Enlace al paciente»), para verlo sin abrir una
// consulta: dietas, bienestar, control de tensión y las órdenes que salen de cada perfil de exámenes.
export default async function HojasPaciente() {
  const sesion = await obtenerSesion();
  const listas = await opciones(sesion.orgId, ["grupo_paraclinicos", "paraclinico"]);
  const perfiles = resumenPerfiles(listas.grupo_paraclinicos, listas.paraclinico);
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2"><Link href="/atencion"><ArrowLeft /> Atención médica</Link></Button>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Hojas para el paciente</h1>
        <p className="text-muted-foreground">Lo que le puedes entregar en la consulta o enviar con «Enlace al paciente». «Ver» abre la hoja con un paciente de ejemplo. En la consulta, cada renglón se puede cambiar antes de imprimir.</p>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-base"><Salad className="size-5 text-primary" /> Recomendaciones nutricionales</CardTitle></CardHeader>
          <CardContent className="grid gap-2">
            {DIETAS.map((d) => <Ver key={d.clave} href={ver({ dieta: d.clave })}><b className="font-medium">{d.boton}</b><span className="block text-xs text-muted-foreground">{d.titulo}</span></Ver>)}
          </CardContent>
        </Card>
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-base"><Activity className="size-5 text-primary" /> Bienestar</CardTitle></CardHeader>
            <CardContent className="grid gap-2">
              {BOTONES_BIENESTAR.map((t) => <Ver key={t.clave} href={ver({ bienestar: "1", tema: t.clave })}><b className="font-medium">{t.boton}</b></Ver>)}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-base"><Gauge className="size-5 text-primary" /> Control de tensión arterial</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <Ver href={ver({ ta: "7" })}><b className="font-medium">7 días</b></Ver>
              <Ver href={ver({ ta: "14" })}><b className="font-medium">14 días</b></Ver>
            </CardContent>
          </Card>
        </div>
      </div>
      <Card>
        <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-base"><FlaskConical className="size-5 text-primary" /> Órdenes de exámenes por perfil</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 gap-2 md:grid-cols-2">
          {perfiles.length ? perfiles.map((p) => (
            <Ver key={p.id} href={ver({ perfil: p.id })}>
              <b className="font-medium">{p.nombre}</b>
              <span className="block text-xs text-muted-foreground">{p.ordenes.map((o) => `${o.nombre} (${o.examenes.length})`).join(" · ")}</span>
            </Ver>
          )) : <p className="text-sm text-muted-foreground">Aún no hay perfiles. Ármalos en <Link href="/configuracion/listas?l=grupo_paraclinicos" className="font-medium text-primary underline">Perfiles de paraclínicos</Link>.</p>}
          {perfiles.length > 0 && <p className="text-xs text-muted-foreground md:col-span-2">Cada clase de estudio sale en su propia orden: laboratorio, rayos X, ecografía, tomografía, resonancia y estudios funcionales. Los perfiles se cambian en <Link href="/configuracion/listas?l=grupo_paraclinicos" className="font-medium text-primary underline">Perfiles de paraclínicos</Link>.</p>}
        </CardContent>
      </Card>
    </div>
  );
}
