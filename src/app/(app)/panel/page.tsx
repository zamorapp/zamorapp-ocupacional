import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, CalendarClock, ClipboardPlus, FilePlus2, HardHat, Plus, UserPlus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Semaforo } from "@/components/app/semaforo";
import { AGENDA_DEMO, ALERTAS_DEMO, APTITUD_DEMO, INDICADORES_DEMO } from "@/lib/demo";

export const metadata: Metadata = { title: "Inicio" };
export const dynamic = "force-dynamic";

const ACCIONES = [
  { titulo: "Nueva consulta", icono: ClipboardPlus, href: "/atencion" },
  { titulo: "Nuevo paciente", icono: UserPlus, href: "/pacientes" },
  { titulo: "Reportar accidente", icono: HardHat, href: "/atencion" },
  { titulo: "Emitir constancia", icono: FilePlus2, href: "/documentos" },
];

const ESTILO_CITA: Record<string, string> = {
  Atendido: "bg-ok/15 text-ok",
  "En consulta": "bg-primary/15 text-primary",
  "En espera": "bg-aviso/20 text-amber-700 dark:text-aviso",
  Citado: "bg-muted text-muted-foreground",
};

export default function Panel() {
  const totalAptitud = APTITUD_DEMO.reduce((s, a) => s + a.cantidad, 0);
  const hoy = new Intl.DateTimeFormat("es-VE", { weekday: "long", day: "numeric", month: "long" }).format(new Date());

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground first-letter:uppercase">{hoy}</p>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Buenos días, Cesar</h1>
        </div>
        <Button size="lg" asChild>
          <Link href="/atencion"><Plus /> Registrar</Link>
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
        {INDICADORES_DEMO.map((i) => (
          <Card key={i.titulo} className="gap-2 py-5">
            <CardContent className="space-y-1 px-5">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Semaforo estado={i.estado} />
                {i.titulo}
              </div>
              <div className="text-3xl font-semibold tracking-tight">{i.valor}</div>
              <div className="text-xs text-muted-foreground">{i.detalle}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <CalendarClock className="size-5 text-primary" /> Agenda de hoy
              <Button variant="ghost" size="sm" className="-my-2 ml-auto" asChild><Link href="/atencion">Ver cola</Link></Button>
            </CardTitle>
          </CardHeader>
          <CardContent className="px-0">
            <ul className="divide-y">
              {AGENDA_DEMO.map((c) => (
                <li key={c.hora} className="flex items-center gap-4 px-6 py-3 transition-colors hover:bg-muted/50">
                  <span className="w-12 font-mono text-sm text-muted-foreground">{c.hora}</span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{c.paciente}</div>
                    <div className="truncate text-sm text-muted-foreground">{c.motivo} · {c.empresa}</div>
                  </div>
                  <span className={`hidden rounded-full px-2.5 py-0.5 text-xs font-medium sm:inline ${ESTILO_CITA[c.estado]}`}>{c.estado}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="size-5 text-alerta" /> Alertas legales
              <Badge variant="secondary" className="ml-auto">{ALERTAS_DEMO.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {ALERTAS_DEMO.map((a) => (
              <div key={a.texto} className="flex gap-3 rounded-lg border p-3">
                <Semaforo estado={a.estado} className="mt-1.5" />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium">{a.texto}</div>
                  <div className="truncate text-xs text-muted-foreground">{a.sujeto}</div>
                  <div className={`mt-1 text-xs font-medium ${a.estado === "alerta" ? "text-alerta" : "text-muted-foreground"}`}>{a.plazo}</div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <Card>
          <CardHeader><CardTitle className="text-base">Accesos rápidos</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-2 gap-3">
            {ACCIONES.map(({ titulo, icono: Icono, href }) => (
              <Link key={titulo} href={href} className="group flex flex-col items-start gap-3 rounded-xl border p-4 transition hover:border-primary/40 hover:bg-primary/5">
                <span className="grid size-10 place-items-center rounded-lg bg-primary/10 text-primary transition group-hover:bg-primary group-hover:text-primary-foreground">
                  <Icono className="size-5" />
                </span>
                <span className="text-sm font-medium">{titulo}</span>
              </Link>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Aptitud emitida este trimestre</CardTitle></CardHeader>
          <CardContent className="space-y-5">
            <div className="flex h-3 overflow-hidden rounded-full bg-muted">
              {APTITUD_DEMO.map((a) => (
                <div key={a.clase} className={a.color} style={{ width: `${(a.cantidad / totalAptitud) * 100}%` }} />
              ))}
            </div>
            <ul className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3">
              {APTITUD_DEMO.map((a) => (
                <li key={a.clase} className="flex items-center gap-2 text-sm">
                  <span className={`size-2.5 rounded-full ${a.color}`} />
                  <span className="text-muted-foreground">{a.clase}</span>
                  <span className="ml-auto font-medium tabular-nums">{a.cantidad}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
