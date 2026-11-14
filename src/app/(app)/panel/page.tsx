import type { Metadata } from "next";
import { barrerConstancias } from "@/lib/constancias-listas";
import Link from "next/link";
import { Suspense } from "react";
import { AlertTriangle, ArrowRight, History, BarChart3, Building2, CalendarClock, CalendarPlus, CheckCircle2, ClipboardPlus, FilePlus2, FileSpreadsheet, HardHat, Plus, Receipt, UserPlus, UsersRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Semaforo } from "@/components/app/semaforo";
import { accidentabilidadInicio, agendaInicio, alertasInicio, aptitudInicio, indicadoresInicio, panelVacio, tareasInicio, vencimientosInicio } from "@/lib/panel";
import { accionesDelRol } from "@/lib/panel-rol";
import { AccidentabilidadAnual, VencimientosPorEmpresa } from "./tableros";
import { AjustarAlerta } from "./ajustar-alerta";
import { FranjaRespaldo } from "./franja-respaldo";
import { cn } from "@/lib/utils";
import { obtenerSesion, primerNombre, type Sesion } from "@/lib/sesion";
import { recordarResultados } from "@/lib/recordatorios";
import { vigilarPlazos } from "@/lib/centinela";
import { estadoRespaldo } from "@/lib/respaldo";
import { ahora } from "@/lib/fecha";
import { esRolEmpresa } from "@/lib/sesion-roles";
import { OfertaAvisosCelular } from "@/components/app/avisos-celular";
import { ultimosAtendidos } from "@/lib/ultimos-atendidos";

export const metadata: Metadata = { title: "Inicio" };
export const dynamic = "force-dynamic";

const ZONA = "America/Caracas";

const ICONOS = { consulta: ClipboardPlus, paciente: UserPlus, accidente: HardHat, constancia: FilePlus2, cita: CalendarPlus, cobro: Receipt, reporte: BarChart3, usuarios: UsersRound };

const ESTILO_CITA: Record<string, string> = {
  Atendido: "bg-ok/15 text-ok-texto",
  "En consulta": "bg-primary/15 text-primary",
  "En espera": "bg-aviso/20 text-aviso-texto",
  Citado: "bg-muted text-muted-foreground",
};

function saludo() {
  const hora = Number(new Intl.DateTimeFormat("es-VE", { hour: "numeric", hourCycle: "h23", timeZone: ZONA }).format(new Date(ahora())));
  return hora < 12 ? "Buenos días" : hora < 19 ? "Buenas tardes" : "Buenas noches";
}

export default async function Panel() {
  const sesion = await obtenerSesion();
  // El recordatorio y el centinela no esperan a la base: corren con after(), cuando la página ya salió
  await Promise.all([recordarResultados(sesion), vigilarPlazos(sesion), barrerConstancias()]);
  const hoy = new Intl.DateTimeFormat("es-VE", { weekday: "long", day: "numeric", month: "long", timeZone: ZONA }).format(new Date(ahora()));
  const acciones = accionesDelRol(sesion);

  // El encabezado y los accesos rápidos salen al instante; cada sección con cifras llega cuando la base responde
  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground first-letter:uppercase">{hoy}</p>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{saludo()}, {primerNombre(sesion.nombre)}</h1>
        </div>
        <Button size="lg" asChild>
          <Link href="/atencion"><Plus /> Registrar</Link>
        </Button>
      </div>

      {!sesion.demo && !esRolEmpresa(sesion.rol) && process.env.NEXT_PUBLIC_ESCRITORIO !== "1" && <OfertaAvisosCelular />}

      {/* El respaldo solo lo ven administrador y gerente médico: su espacio queda reservado para que no empuje el Inicio */}
      <Suspense fallback={!sesion.demo && (sesion.rol === "administrador" || sesion.rol === "gerente_medico") ? <div role="status" aria-label="Revisando el respaldo" className="h-14 animate-pulse rounded-xl border bg-muted/40" /> : null}>
        <Respaldo sesion={sesion} />
      </Suspense>

      <Suspense fallback={<Esqueleto filas={1} alto="h-[4.5rem]" columnas="sm:grid-cols-3" titulo />}><Tareas sesion={sesion} /></Suspense>

      {/* Últimos atendidos de todas las empresas: a un toque, sin buscar (solo personal de salud) */}
      {sesion.clinico && !sesion.demo && <Suspense fallback={<div role="status" aria-label="Cargando los últimos atendidos" className="h-48 animate-pulse rounded-xl border bg-muted/40" />}><UltimosAtendidos /></Suspense>}

      <Suspense fallback={null}><PrimerosPasos /></Suspense>

      <Suspense fallback={<Esqueleto filas={4} alto="h-32" columnas="grid-cols-2 lg:grid-cols-4" />}><Indicadores /></Suspense>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <CalendarClock className="size-5 text-primary" /> Agenda de hoy
              <Button variant="ghost" size="sm" className="-my-2 ml-auto" asChild><Link href="/atencion">Ver cola</Link></Button>
            </CardTitle>
          </CardHeader>
          <CardContent className="px-0">
            <Suspense fallback={<Lineas />}><Agenda /></Suspense>
          </CardContent>
        </Card>

        <Suspense fallback={<div role="status" aria-label="Cargando las alertas" className="h-64 animate-pulse rounded-xl border bg-muted/40" />}><Alertas /></Suspense>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <Card>
          <CardHeader><CardTitle className="text-base">Accesos rápidos</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-2 gap-3">
            {acciones.map(({ titulo, icono, href }) => { const Icono = ICONOS[icono]; return (
              <Link key={titulo} href={href} className="group flex flex-col items-start gap-3 rounded-xl border p-4 transition hover:border-primary/40 hover:bg-primary/5">
                <span className="grid size-10 place-items-center rounded-lg bg-primary/10 text-primary transition group-hover:bg-primary group-hover:text-primary-foreground">
                  <Icono className="size-5" />
                </span>
                <span className="text-sm font-medium">{titulo}</span>
              </Link>
            ); })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Aptitud vigente</CardTitle></CardHeader>
          <CardContent className="space-y-5">
            <Suspense fallback={<Lineas />}><Aptitud /></Suspense>
          </CardContent>
        </Card>
      </div>

      {/* Tableros: los vencimientos llegan con los conteos; la accidentabilidad (12 meses) va aparte porque es la más lenta */}
      <div className="grid grid-cols-1 gap-4 empty:hidden lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <Suspense fallback={null}><Vencimientos /></Suspense>
        {sesion.rol !== "recepcion" && <Suspense fallback={null}><Accidentes /></Suspense>}
      </div>
    </div>
  );
}

function Esqueleto({ filas, alto, columnas, titulo }: { filas: number; alto: string; columnas: string; titulo?: boolean }) {
  return (
    <div className="space-y-2" role="status" aria-busy="true" aria-label="Cargando">
      {titulo && <div className="h-4 w-32 animate-pulse rounded bg-muted" />}
      <div className={cn("grid gap-3", columnas)}>
        {Array.from({ length: filas === 1 ? 3 : filas }, (_, i) => <div key={i} className={cn("animate-pulse rounded-xl border bg-muted/40", alto)} />)}
      </div>
    </div>
  );
}

function Lineas() {
  return (
    <div className="space-y-3 px-6 py-2" role="status" aria-busy="true" aria-label="Cargando">
      {Array.from({ length: 3 }, (_, i) => <div key={i} className="h-8 animate-pulse rounded bg-muted/60" />)}
    </div>
  );
}

async function Respaldo({ sesion }: { sesion: Sesion }) {
  const respaldo = await estadoRespaldo(sesion);
  if (!respaldo) return null;
  // Respaldo diario (administrador y gerente médico): discreto si está al día, destacado si no; «Ignorar» por 3 días
  return <FranjaRespaldo respaldo={respaldo} />;
}

async function Tareas({ sesion }: { sesion: Sesion }) {
  const enfoque = await tareasInicio(sesion);
  // Lo primero según el rol: pendientes que se resuelven hoy
  return (
      <section aria-label={enfoque.titulo} className="space-y-2">
        <h2 className="text-sm font-medium text-muted-foreground">{enfoque.titulo}</h2>
        <div className={cn("grid grid-cols-1 gap-3", enfoque.tareas.length === 3 ? "sm:grid-cols-3" : enfoque.tareas.length === 4 ? "sm:grid-cols-2 xl:grid-cols-4" : enfoque.tareas.length === 5 ? "sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5" : "sm:grid-cols-2")}>
          {enfoque.tareas.map((t) => (
            <Link
              key={t.titulo}
              href={t.href}
              className={cn(
                "group flex items-center gap-4 rounded-xl border bg-card p-4 transition hover:border-primary/50",
                t.urgente && t.valor > 0 && "border-aviso/60 bg-aviso/10",
              )}
            >
              <span className={cn("text-3xl font-semibold tabular-nums", t.urgente && t.valor > 0 ? "text-aviso-texto" : "text-foreground")}>{t.valor}</span>
              <span className="min-w-0 flex-1">
                <span className="block font-medium">{t.titulo}</span>
                <span className="block truncate text-xs text-muted-foreground">{t.detalle}</span>
              </span>
              <ArrowRight className="size-4 text-muted-foreground transition group-hover:translate-x-0.5" />
            </Link>
          ))}
        </div>
      </section>
  );
}

// Lo que importa al médico de un vistazo: «Por firmar» resalta; en curso es neutro; firmada, lista
const ESTADO_ATENDIDO: Record<string, [string, string]> = {
  borrador: ["En curso", "bg-muted text-muted-foreground"],
  cerrada: ["Por firmar", "bg-aviso/15 text-aviso-texto"],
  firmada: ["Firmada", "bg-ok/15 text-ok-texto"],
};

async function UltimosAtendidos() {
  let atendidos;
  try {
    atendidos = await ultimosAtendidos(8);
  } catch (e) {
    // Visible, con la causa: el resto del Inicio sigue funcionando
    return <p className="rounded-xl border border-aviso/40 bg-aviso/10 px-4 py-3 text-sm">No se pudieron cargar los últimos atendidos: {e instanceof Error ? e.message : String(e)}</p>;
  }
  if (atendidos.length === 0) return null;
  return (
    // En el celular salen 4 y «Ver los 8» despliega el resto (casilla oculta, sin JavaScript); en PC, 2 columnas de 4
    <Card className="group/atendidos gap-0 py-0">
      <CardHeader className="flex flex-row items-center gap-2 border-b px-5 py-3">
        <History className="size-5 text-primary" />
        <CardTitle className="text-base">Últimos atendidos</CardTitle>
        <span className="hidden text-xs text-muted-foreground sm:inline">· todas las empresas</span>
        <Button variant="ghost" size="sm" className="-my-1 ml-auto" asChild><Link href="/atencion?empresas=todas#consultas">Ver 30 días</Link></Button>
      </CardHeader>
      <ul className="grid grid-cols-1 lg:grid-cols-2 lg:divide-x">
        {[atendidos.slice(0, 4), atendidos.slice(4)].map((columna, n) => (
          <li key={n} className={cn("divide-y", n === 1 && "hidden border-t group-has-[:checked]/atendidos:block lg:block lg:border-t-0")}>
            {columna.map((a) => (
              <Link key={a.id} href={`/atencion/${a.id}`} className="group flex items-center gap-3 px-5 py-2.5 transition-colors hover:bg-muted/50">
                <span className="hidden w-[6.5rem] shrink-0 whitespace-nowrap text-xs tabular-nums text-muted-foreground sm:block">{a.cuando}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium group-hover:text-primary">{a.paciente}</span>
                  <span className="block truncate text-xs text-muted-foreground"><span className="sm:hidden">{a.cuando} · </span>{[a.empresa, a.motivo].filter(Boolean).join(" · ")}</span>
                </span>
                <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium", ESTADO_ATENDIDO[a.estado][1])}>{ESTADO_ATENDIDO[a.estado][0]}</span>
              </Link>
            ))}
          </li>
        ))}
      </ul>
      {atendidos.length > 4 && (
        <label className="block cursor-pointer border-t px-5 py-2.5 text-center text-sm font-medium text-primary group-has-[:checked]/atendidos:hidden lg:hidden">
          <input type="checkbox" className="sr-only" /> Ver los {atendidos.length}
        </label>
      )}
    </Card>
  );
}

async function PrimerosPasos() {
  if (!(await panelVacio())) return null;
  return (
        <Card className="border-primary/30 bg-primary/5 py-5">
          <CardContent className="space-y-4 px-5">
            <div>
              <h2 className="font-semibold">Empecemos: carga tus datos en dos pasos</h2>
              <p className="text-sm text-muted-foreground">Todo lo demás (consultas, aptitud, reportes) cuelga de la empresa y sus trabajadores.</p>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Link href="/empresas" className="group flex items-center gap-3 rounded-xl border bg-card p-4 transition hover:border-primary/50">
                <span className="grid size-10 place-items-center rounded-lg bg-primary text-primary-foreground"><Building2 className="size-5" /></span>
                <div className="flex-1"><div className="font-medium">1. Registra una empresa cliente</div><div className="text-sm text-muted-foreground">RIF, NIL y datos legales</div></div>
                <ArrowRight className="size-4 text-muted-foreground transition group-hover:translate-x-0.5" />
              </Link>
              <Link href="/pacientes/importar" className="group flex items-center gap-3 rounded-xl border bg-card p-4 transition hover:border-primary/50">
                <span className="grid size-10 place-items-center rounded-lg bg-primary/10 text-primary"><FileSpreadsheet className="size-5" /></span>
                <div className="flex-1"><div className="font-medium">2. Importa su nómina</div><div className="text-sm text-muted-foreground">Desde Excel o CSV</div></div>
                <ArrowRight className="size-4 text-muted-foreground transition group-hover:translate-x-0.5" />
              </Link>
            </div>
          </CardContent>
        </Card>
  );
}

async function Indicadores() {
  const indicadores = await indicadoresInicio();
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
        {indicadores.map((i) => (
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
  );
}

async function Agenda() {
  const agenda = await agendaInicio();
  return agenda.length === 0 ? (
              <p className="px-6 py-8 text-center text-sm text-muted-foreground">No hay citas para hoy. Agéndalas en Atención médica.</p>
            ) : (
              <ul className="divide-y">
                {agenda.map((c) => (
                  <li key={c.hora + c.paciente} className="flex items-center gap-4 px-6 py-3 transition-colors hover:bg-muted/50">
                    <span className="w-12 font-mono text-sm text-muted-foreground">{c.hora}</span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">{c.paciente}</div>
                      <div className="truncate text-sm text-muted-foreground">{c.motivo} · {c.empresa}</div>
                    </div>
                    <span className={`hidden rounded-full px-2.5 py-0.5 text-xs font-medium sm:inline ${ESTILO_CITA[c.estado]}`}>{c.estado}</span>
                  </li>
                ))}
              </ul>
            );
}

async function Alertas() {
  const [alertas, sesion] = await Promise.all([alertasInicio(), obtenerSesion()]);
  // El engranaje de cada empresa solo para el administrador (quien puede cambiar la empresa); las líneas informativas
  // (estado «ok», p. ej. «Vencimientos silenciados») no cuentan como alerta
  const ajusta = sesion.rol === "administrador" && !sesion.demo;
  const pendientes = alertas.filter((a) => a.estado !== "ok").length;
  return (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="size-5 text-alerta-texto" /> Alertas
              <Badge variant="secondary" className="ml-auto">{pendientes}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {pendientes === 0 && (
              <p className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
                <CheckCircle2 className="size-4 text-ok-texto" /> Todo al día.
              </p>
            )}
            {alertas.map((a) => {
              const contenido = (
                <>
                  <Semaforo estado={a.estado} className="mt-1.5" />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium">{a.texto}</div>
                    <div className="truncate text-xs text-muted-foreground">{a.sujeto}</div>
                    <div className={`mt-1 text-xs font-medium ${a.estado === "alerta" ? "text-alerta-texto" : "text-muted-foreground"}`}>{a.plazo}</div>
                  </div>
                </>
              );
              if (a.href && a.empresa && ajusta) {
                return (
                  <div key={a.texto + a.sujeto} className="flex items-start rounded-lg border transition hover:bg-muted/50">
                    <Link href={a.href} className="flex min-w-0 flex-1 gap-3 p-3">{contenido}</Link>
                    <div className="p-2"><AjustarAlerta empresa={a.empresa} /></div>
                  </div>
                );
              }
              return a.href ? (
                <Link key={a.texto + a.sujeto} href={a.href} className="flex gap-3 rounded-lg border p-3 transition hover:bg-muted/50">{contenido}</Link>
              ) : (
                <div key={a.texto + a.sujeto} className="flex gap-3 rounded-lg border p-3">{contenido}</div>
              );
            })}
          </CardContent>
        </Card>
  );
}

async function Aptitud() {
  const aptitud = await aptitudInicio();
  const totalAptitud = aptitud.reduce((s, a) => s + a.cantidad, 0);
  return (
    <>
            <div className="flex h-3 overflow-hidden rounded-full bg-muted">
              {totalAptitud > 0 && aptitud.map((a) => (
                <div key={a.clase} className={a.color} style={{ width: `${(a.cantidad / totalAptitud) * 100}%` }} />
              ))}
            </div>
            <ul className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3">
              {aptitud.map((a) => (
                <li key={a.clase} className="flex items-center gap-2 text-sm">
                  <span className={`size-2.5 rounded-full ${a.color}`} />
                  <span className="text-muted-foreground">{a.clase}</span>
                  <span className="ml-auto font-medium tabular-nums">{a.cantidad}</span>
                </li>
              ))}
            </ul>
    </>
  );
}

async function Vencimientos() {
  const filas = await vencimientosInicio();
  return filas.length > 0 ? <VencimientosPorEmpresa filas={filas} /> : null;
}

async function Accidentes() {
  const datos = await accidentabilidadInicio();
  return datos ? <AccidentabilidadAnual datos={datos} /> : null;
}
