import type { Metadata } from "next";
import Link from "next/link";
import { CalendarClock, CheckCircle2, Clock, FileSpreadsheet, Stethoscope, UserPlus, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { hoyVE, listarCitas } from "@/lib/citas";
import { empresaActivaId } from "@/lib/empresa-activa";
import { listarEmpresas } from "@/lib/empresas";
import { opciones } from "@/lib/listas";
import { ESTILO_APTITUD, ETIQUETA_APTITUD, fecha } from "@/lib/pacientes";
import { listarTrabajadores } from "@/lib/pacientes-datos";
import { obtenerSesion, primerNombre } from "@/lib/sesion";
import { cn } from "@/lib/utils";
import { CancelarSolicitud } from "./cancelar";
import { Refrescar } from "./refrescar";
import { SolicitarCita } from "./solicitar-cita";

export const metadata: Metadata = { title: "Portal" };
export const dynamic = "force-dynamic";

const ESTADO: Record<string, { texto: string; clase: string }> = {
  solicitada: { texto: "Solicitada", clase: "bg-aviso/20 text-amber-800" },
  citado: { texto: "Confirmada", clase: "bg-primary/15 text-primary" },
  en_espera: { texto: "En el servicio", clase: "bg-aviso/20 text-amber-800" },
  en_consulta: { texto: "En consulta", clase: "bg-primary text-primary-foreground" },
  atendido: { texto: "Atendido", clase: "bg-ok/15 text-ok" },
  no_asistio: { texto: "No asistió", clase: "bg-alerta/15 text-alerta" },
  cancelada: { texto: "Cancelada", clase: "bg-muted text-muted-foreground" },
};

const sumarDias = (iso: string, n: number) => {
  const d = new Date(iso + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

export default async function Portal() {
  const hoy = hoyVE();
  const [sesion, citas, trabajadores, empresas, activa, listas] = await Promise.all([
    obtenerSesion(),
    listarCitas(sumarDias(hoy, -14), sumarDias(hoy, 90)),
    listarTrabajadores(),
    listarEmpresas(),
    empresaActivaId(),
    obtenerSesion().then((s) => opciones(s.orgId, ["motivo_consulta"])),
  ]);
  const empresa = empresas.find((e) => e.id === activa) ?? (empresas.length === 1 ? empresas[0] : null);
  const deHoy = citas.filter((c) => c.fecha === hoy && c.estado !== "cancelada");
  const proximas = citas.filter((c) => c.fecha > hoy && ["solicitada", "citado"].includes(c.estado));
  const evaluados = trabajadores
    .filter((t) => t.aptitud && t.aptitudFecha)
    .sort((a, b) => (b.aptitudFecha ?? "").localeCompare(a.aptitudFecha ?? ""))
    .slice(0, 8);
  const vencidos = trabajadores.filter((t) => t.proximoExamen && t.proximoExamen < hoy && t.estado !== "egresado").length;

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <Refrescar />
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">{empresa?.razonSocial ?? "Portal de empresas"}</p>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Hola, {primerNombre(sesion.nombre)}</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" asChild><Link href="/pacientes/importar"><FileSpreadsheet /> Cargar nómina</Link></Button>
          <Button variant="outline" asChild><Link href="/pacientes"><UserPlus /> Trabajadores</Link></Button>
          <SolicitarCita motivos={listas.motivo_consulta.map((m) => ({ id: m.id, nombre: m.nombre }))} manana={sumarDias(hoy, 1)} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { t: "Trabajadores", v: trabajadores.filter((x) => x.estado !== "egresado").length, i: Users },
          { t: "Citas hoy", v: deHoy.length, i: CalendarClock },
          { t: "Próximas citas", v: proximas.length, i: Clock },
          { t: "Exámenes vencidos", v: vencidos, i: Stethoscope },
        ].map(({ t, v, i: Icono }) => (
          <Card key={t} className="gap-1 py-4">
            <CardContent className="px-5">
              <div className="flex items-center gap-2 text-sm text-muted-foreground"><Icono className="size-4" /> {t}</div>
              <div className="text-3xl font-semibold">{v}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2 text-base"><CalendarClock className="size-5 text-primary" /> Hoy en el servicio médico</CardTitle></CardHeader>
          <CardContent className="px-0">
            {deHoy.length === 0 ? <p className="px-6 py-6 text-center text-sm text-muted-foreground">Sin citas para hoy.</p> : (
              <ul className="divide-y">
                {deHoy.map((c) => (
                  <li key={c.id} className="flex items-center gap-3 px-6 py-2.5 text-sm">
                    <span className="w-12 font-mono text-muted-foreground">{c.hora ?? "—"}</span>
                    <div className="min-w-0 flex-1"><div className="font-medium">{c.paciente}</div><div className="text-xs text-muted-foreground">{c.motivo ?? "Sin motivo"}</div></div>
                    <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium", ESTADO[c.estado]?.clase)}>{ESTADO[c.estado]?.texto}</span>
                  </li>
                ))}
              </ul>
            )}
            <p className="px-6 pt-2 text-[11px] text-muted-foreground">Se actualiza solo cada 30 segundos.</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Clock className="size-5 text-primary" /> Próximas citas y solicitudes</CardTitle></CardHeader>
          <CardContent className="px-0">
            {proximas.length === 0 ? <p className="px-6 py-6 text-center text-sm text-muted-foreground">Sin citas próximas. Usa «Solicitar cita».</p> : (
              <ul className="divide-y">
                {proximas.map((c) => (
                  <li key={c.id} className="flex flex-wrap items-center gap-3 px-6 py-2.5 text-sm">
                    <span className="w-24 font-mono text-muted-foreground">{fecha(c.fecha)}{c.hora && ` ${c.hora}`}</span>
                    <div className="min-w-0 flex-1"><div className="font-medium">{c.paciente}</div><div className="text-xs text-muted-foreground">{c.motivo ?? "Sin motivo"}</div></div>
                    <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium", ESTADO[c.estado]?.clase)}>{ESTADO[c.estado]?.texto}</span>
                    {c.estado === "solicitada" && <CancelarSolicitud id={c.id} />}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2 text-base"><CheckCircle2 className="size-5 text-ok" /> Evaluaciones recientes</CardTitle></CardHeader>
        <CardContent className="px-0">
          {evaluados.length === 0 ? <p className="px-6 py-6 text-center text-sm text-muted-foreground">Aún no hay evaluaciones.</p> : (
            <ul className="divide-y">
              {evaluados.map((t) => (
                <li key={t.id} className="flex flex-wrap items-center gap-3 px-6 py-2.5 text-sm">
                  <span className="w-24 font-mono text-muted-foreground">{fecha(t.aptitudFecha)}</span>
                  <Link href={`/pacientes/${t.id}`} className="min-w-0 flex-1 font-medium hover:text-primary">{t.nombres} {t.apellidos}<span className="block text-xs font-normal text-muted-foreground">{t.cargo}</span></Link>
                  <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium", ESTILO_APTITUD[t.aptitud!])}>{ETIQUETA_APTITUD[t.aptitud!]}</span>
                  <span className="text-xs text-muted-foreground">vence {fecha(t.proximoExamen)}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="px-6 pt-2 text-[11px] text-muted-foreground">Por confidencialidad médica solo se muestra la aptitud y las restricciones, nunca diagnósticos.</p>
        </CardContent>
      </Card>
    </div>
  );
}
