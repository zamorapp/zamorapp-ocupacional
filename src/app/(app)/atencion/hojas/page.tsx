import type { Metadata } from "next";
import Link from "next/link";
import { Activity, ArrowLeft, ExternalLink, Eye, FlaskConical, Gauge, PencilLine, Salad } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DIETAS } from "@/lib/dietas";
import { BOTONES_BIENESTAR } from "@/lib/bienestar";
import { areasBienestar } from "@/lib/hojas-version";
import { versionesHojas } from "@/lib/hojas-version-servidor";
import { crearClienteServidor } from "@/lib/supabase/server";
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

// Dieta o tema de bienestar: «Leer y editar» abre la hoja para cambiarla y guardarla como versión del servicio
function Hoja({ codigo, nombre, detalle, propia }: { codigo: string; nombre: string; detalle?: string; propia: boolean }) {
  return (
    <Link href={`/imprimir/hoja-editar/${codigo}`} className="flex min-h-12 items-center gap-3 rounded-lg border bg-background px-3 py-2 text-sm transition hover:border-primary">
      <span className="min-w-0 flex-1">
        <b className="font-medium">{nombre}</b>{propia && <span className="ml-1.5 rounded-full bg-primary/10 px-1.5 py-0.5 text-[11px] font-medium text-primary">Tu versión</span>}
        {detalle && <span className="block text-xs text-muted-foreground">{detalle}</span>}
      </span>
      <span className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-primary"><PencilLine className="size-3.5" /> Leer y editar</span>
    </Link>
  );
}

// Todo lo que se le puede entregar al paciente (en la consulta o con «Enlace al paciente»), para verlo sin abrir una
// consulta: dietas, bienestar, control de tensión y las órdenes que salen de cada perfil de exámenes.
export default async function HojasPaciente() {
  const sesion = await obtenerSesion();
  const listas = await opciones(sesion.orgId, ["grupo_paraclinicos", "paraclinico"]);
  const perfiles = resumenPerfiles(listas.grupo_paraclinicos, listas.paraclinico);
  const versiones = sesion.demo ? {} : await versionesHojas(await crearClienteServidor());
  const nombreTema = new Map(BOTONES_BIENESTAR.map((t) => [t.clave, t.boton]));
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2"><Link href="/atencion"><ArrowLeft /> Atención médica</Link></Button>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Hojas para el paciente</h1>
        <p className="text-muted-foreground">Lo que le puedes entregar en la consulta o enviar con «Enlace al paciente». Ábrela para leerla, agregarle o quitarle renglones y guardarla como tu versión: sale así en todas las consultas y enlaces. En cada consulta aún puedes ajustarla para ese paciente.</p>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-base"><Salad className="size-5 text-primary" /> Recomendaciones nutricionales</CardTitle></CardHeader>
          <CardContent className="grid gap-2">
            {DIETAS.map((d) => <Hoja key={d.clave} codigo={`dieta-${d.clave}`} nombre={d.boton} detalle={d.titulo} propia={`dieta-${d.clave}` in versiones} />)}
          </CardContent>
        </Card>
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-base"><Activity className="size-5 text-primary" /> Bienestar</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {areasBienestar().map((a) => (
                <div key={a.titulo} className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{a.titulo}</p>
                  <div className="grid gap-2">
                    {a.claves.filter((k) => nombreTema.has(k)).map((k) => <Hoja key={k} codigo={`bienestar-${k}`} nombre={nombreTema.get(k)!} propia={`bienestar-${k}` in versiones} />)}
                  </div>
                </div>
              ))}
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
