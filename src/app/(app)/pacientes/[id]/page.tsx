import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CalendarClock, FileText, ShieldAlert } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  CONSULTAS_DEMO,
  ESTILO_APTITUD,
  ETIQUETA_APTITUD,
  ETIQUETA_ESTADO,
  GRUPOS_RIESGO,
  edad,
  fecha,
  iniciales,
} from "@/lib/pacientes";
import { obtenerTrabajador } from "@/lib/pacientes-datos";
import { listarConsultas } from "@/lib/consultas";
import { ETIQUETA_ESTADO_CONSULTA } from "@/lib/consultas-tipos";
import { obtenerSesion } from "@/lib/sesion";
import { listarAdjuntos } from "@/lib/adjuntos";
import { Adjuntos } from "@/components/app/adjuntos";
import { crearClienteServidor } from "@/lib/supabase/server";
import type { EmpleoAnterior } from "@/lib/historia-laboral";
import { HistoriaLaboral } from "./historia-laboral";
import { BotonConsulta } from "./boton-consulta";
import { cn } from "@/lib/utils";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const t = await obtenerTrabajador((await params).id);
  return { title: t ? `${t.nombres} ${t.apellidos}` : "Paciente" };
}

export default async function FichaPaciente({ params }: Props) {
  const t = await obtenerTrabajador((await params).id);
  if (!t) notFound();
  const sesion = await obtenerSesion();
  const consultas = sesion.demo
    ? (CONSULTAS_DEMO[t.id] ?? []).map((c, i) => ({ id: String(i), demo: true, fecha: c.fecha, motivo: c.motivo, tipo: c.tipo, detalle: c.medico, aptitud: c.aptitud }))
    : (await listarConsultas({ trabajadorId: t.id, limite: 100 })).map((c) => ({ id: c.id, demo: false, fecha: c.fecha, motivo: c.motivo ?? "Sin motivo", tipo: c.tipo, detalle: ETIQUETA_ESTADO_CONSULTA[c.estado], aptitud: c.aptitud }));
  const verAdjuntos = !sesion.demo && Boolean(sesion.orgId) && sesion.rol !== "gerente_empresa";
  const [adjuntos, empleos] = verAdjuntos
    ? await Promise.all([
        listarAdjuntos(t.id),
        crearClienteServidor().then((s) => s.from("historia_laboral").select("*").eq("trabajador_id", t.id).order("creado_en")).then((r) => (r.data ?? []) as EmpleoAnterior[]),
      ])
    : [[], [] as EmpleoAnterior[]];
  const examenVencido = t.proximoExamen !== null && t.proximoExamen < new Date().toISOString().slice(0, 10);

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <Link href="/pacientes" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Pacientes
      </Link>

      {/* Encabezado fijo de la ficha: identidad y aptitud vigente */}
      <Card className="py-5">
        <CardContent className="flex flex-wrap items-center gap-5 px-5">
          <Avatar className="size-16">
            <AvatarFallback className="bg-primary text-xl font-semibold text-primary-foreground">{iniciales(t)}</AvatarFallback>
          </Avatar>
          <div className="min-w-56 flex-1">
            <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{t.nombres} {t.apellidos}</h1>
            <p className="text-sm text-muted-foreground">
              <span className="font-mono">{t.cedula}</span> · Historia {t.historia}{edad(t.fechaNacimiento) !== null && ` · ${edad(t.fechaNacimiento)} años`}{t.sexo && ` · ${t.sexo === "F" ? "Femenino" : "Masculino"}`}
            </p>
            <p className="mt-1 truncate text-sm">{[t.cargo, t.empresa].filter(Boolean).join(" · ")}</p>
          </div>
          <div className="flex flex-col items-start gap-1 sm:items-end">
            <span className="text-xs text-muted-foreground">Aptitud vigente</span>
            {t.aptitud ? (
              <span className={cn("rounded-full px-3 py-1 text-sm font-medium", ESTILO_APTITUD[t.aptitud])}>{ETIQUETA_APTITUD[t.aptitud]}</span>
            ) : (
              <span className="text-sm text-muted-foreground">Sin evaluar</span>
            )}
            <span className="text-xs text-muted-foreground">desde {fecha(t.aptitudFecha)}</span>
          </div>
          <div className="flex w-full gap-2 xl:w-auto">
            {sesion.rol !== "gerente_empresa" && (
              <>
                <BotonConsulta trabajadorId={t.id} habilitado={!sesion.demo} />
                <Button variant="outline" asChild className="flex-1 xl:flex-none"><Link href="/documentos"><FileText /> Documentos</Link></Button>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {examenVencido && (
        <div className="flex items-center gap-3 rounded-lg border border-alerta/30 bg-alerta/10 px-4 py-3 text-sm">
          <ShieldAlert className="size-5 shrink-0 text-alerta" />
          Examen periódico vencido desde el {fecha(t.proximoExamen)}.
        </div>
      )}

      <Tabs defaultValue="resumen">
        <TabsList>
          <TabsTrigger value="resumen">Resumen</TabsTrigger>
          <TabsTrigger value="laboral">Laboral y riesgos</TabsTrigger>
          <TabsTrigger value="consultas">Consultas ({consultas.length})</TabsTrigger>
          {verAdjuntos && <TabsTrigger value="historia">Historia laboral ({empleos.length})</TabsTrigger>}
          {verAdjuntos && <TabsTrigger value="resultados">Resultados ({adjuntos.length})</TabsTrigger>}
        </TabsList>

        <TabsContent value="resumen" className="mt-4 grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader><CardTitle className="text-base">Datos personales</CardTitle></CardHeader>
            <CardContent>
              <Datos filas={[
                ["Fecha de nacimiento", fecha(t.fechaNacimiento)],
                ["Grupo sanguíneo", t.grupoSanguineo],
                ["Lateralidad", t.lateralidad],
                ["Teléfono", t.telefono],
                ["Correo", t.correo],
              ]} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-base">Vigilancia de la salud</CardTitle></CardHeader>
            <CardContent>
              <Datos filas={[
                ["Estado", ETIQUETA_ESTADO[t.estado]],
                ["Última aptitud", fecha(t.aptitudFecha)],
                ["Próximo examen", fecha(t.proximoExamen)],
                ["Tipo de paciente", t.tipoPaciente],
              ]} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="laboral" className="mt-4 grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader><CardTitle className="text-base">Puesto actual</CardTitle></CardHeader>
            <CardContent>
              <Datos filas={[
                ["Empresa", t.empresa],
                ["Dependencia", t.dependencia],
                ["Cargo", t.cargo || null],
                ["Turno", t.turno],
                ["Ingreso", fecha(t.fechaIngreso)],
              ]} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-base">Riesgos del puesto</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {GRUPOS_RIESGO.map(([clave, nombre]) => {
                const lista = t.riesgos[clave] ?? [];
                return (
                  <div key={clave} className="flex flex-wrap items-baseline gap-2 text-sm">
                    <span className="w-28 shrink-0 text-muted-foreground">{nombre}</span>
                    {lista.length ? lista.map((r) => (
                      <span key={r} className="rounded-md bg-muted px-2 py-0.5">{r}</span>
                    )) : <span className="text-muted-foreground/60">—</span>}
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="consultas" className="mt-4">
          <Card className="py-0">
            {consultas.length === 0 ? (
              <div className="grid place-items-center gap-2 py-14 text-muted-foreground">
                <CalendarClock className="size-7" /> Sin consultas registradas.
              </div>
            ) : (
              <ul className="divide-y">
                {consultas.map((c) => (
                  <li key={c.id} className="relative flex flex-wrap items-center gap-4 px-5 py-3 transition hover:bg-muted/40">
                    {!c.demo && <Link href={`/atencion/${c.id}`} className="absolute inset-0" aria-label="Abrir consulta" />}
                    <span className="w-24 font-mono text-sm text-muted-foreground">{fecha(c.fecha)}</span>
                    <div className="min-w-0 flex-1">
                      <div className="font-medium">{c.motivo}</div>
                      <div className="text-xs capitalize text-muted-foreground">{c.tipo} · {c.detalle}</div>
                    </div>
                    {c.aptitud && (
                      <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium", ESTILO_APTITUD[c.aptitud])}>{ETIQUETA_APTITUD[c.aptitud]}</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </TabsContent>
        {verAdjuntos && (
          <TabsContent value="historia" className="mt-4">
            <Card><CardContent><HistoriaLaboral trabajadorId={t.id} empleos={empleos} /></CardContent></Card>
          </TabsContent>
        )}
        {verAdjuntos && (
          <TabsContent value="resultados" className="mt-4">
            <Card><CardContent><Adjuntos orgId={sesion.orgId!} trabajadorId={t.id} iniciales={adjuntos} /></CardContent></Card>
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}

function Datos({ filas }: { filas: [string, string | null][] }) {
  return (
    <dl className="divide-y text-sm">
      {filas.map(([k, v]) => (
        <div key={k} className="flex justify-between gap-4 py-2 first:pt-0 last:pb-0">
          <dt className="text-muted-foreground">{k}</dt>
          <dd className="text-right font-medium">{v || "—"}</dd>
        </div>
      ))}
    </dl>
  );
}
