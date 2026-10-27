"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { CalendarCheck2, CheckCircle2, Clock, Loader2, MessageCircle, Stethoscope, UserCheck, UserX, X } from "lucide-react";
import { enlaceWhatsApp, fechaLarga, llenar, numeroWhatsApp } from "@/lib/mensajes";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Cita, EstadoCita } from "@/lib/citas";
import { cn } from "@/lib/utils";
import { iniciarConsulta } from "./acciones";
import { cambiarEstadoCita } from "./citas-acciones";
import { confirmar } from "@/components/app/confirmar";

// Tiempo de espera: normal, aviso desde 20 min y alerta desde 40 min
const tonoEspera = (min: number) => (min >= 40 ? "text-alerta-texto" : min >= 20 ? "text-aviso-texto" : "text-muted-foreground");

const minutosDesde = (iso: string | null, ahora: number) => (iso ? Math.max(0, Math.round((ahora - new Date(iso).getTime()) / 60e3)) : 0);

function Fila({ c, children, detalle, arrastrable }: { c: Cita; children?: React.ReactNode; detalle?: React.ReactNode; arrastrable?: boolean }) {
  return (
    <li
      draggable={arrastrable}
      onDragStart={arrastrable ? (e) => { e.dataTransfer.setData("text/cita", c.id); e.dataTransfer.effectAllowed = "move"; } : undefined}
      className={cn("flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5", arrastrable && "cursor-grab active:cursor-grabbing")}
    >
      <span className="w-12 font-mono text-sm text-muted-foreground">{c.hora ?? "—"}</span>
      <div className="min-w-0 flex-1">
        <Link href={`/pacientes/${c.trabajadorId}`} className="font-medium leading-tight hover:text-primary">{c.paciente}</Link>
        <div className="text-xs text-muted-foreground">{[c.motivo, c.cedula].filter(Boolean).join(" · ")}{detalle}</div>
      </div>
      <div className="flex gap-1">{children}</div>
    </li>
  );
}

// Píldora «Faltan N resultados» de la consulta de la cita (no bloquea nada: solo recuerda)
function Faltan({ n }: { n?: number }) {
  if (!n) return null;
  return <span className="ml-1.5 rounded-full bg-aviso/20 px-2 py-px text-[11px] font-semibold whitespace-nowrap text-aviso-texto">Faltan {n} resultado{n === 1 ? "" : "s"}</span>;
}

export function ColaAtencion({ citas, esHoy, mensaje, pendientes = {} }: { citas: Cita[]; esHoy: boolean; mensaje: { servicio: string; plantilla: string }; pendientes?: Record<string, number> }) {
  // Recordatorio de cita por WhatsApp (se abre en el WhatsApp del usuario, listo para enviar)
  const recordatorio = (c: Cita) =>
    enlaceWhatsApp(c.telefono, llenar(mensaje.plantilla, { nombre: c.paciente, cedula: c.cedula, fecha: fechaLarga(c.fecha), hora: c.hora ?? "la hora acordada", motivo: c.motivo, empresa: c.empresa, servicio: mensaje.servicio }));
  const [ocupado, iniciar] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [ahora, setAhora] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setAhora(Date.now()), 30e3);
    return () => clearInterval(t);
  }, []);

  const estado = (id: string, e: EstadoCita) => iniciar(async () => { const r = await cambiarEstadoCita(id, e); setError(r.ok ? null : r.mensaje); });
  const atender = (c: Cita) =>
    iniciar(async () => {
      const r = await iniciarConsulta(c.trabajadorId, c.motivoId ?? undefined, c.id);
      if (r && !r.ok) setError(r.mensaje);
    });

  const de = (...e: EstadoCita[]) => citas.filter((c) => e.includes(c.estado));
  const espera = de("en_espera").sort((a, b) => (a.llegada ?? "").localeCompare(b.llegada ?? ""));
  const citados = de("citado");
  const enConsulta = de("en_consulta");
  const cerradas = de("atendido", "no_asistio", "cancelada");

  // Tablero: se arrastra de Citados a En espera (llegó) y de En espera a En consulta (abre la consulta). Los botones hacen lo mismo.
  // El resaltado de la columna se marca en el DOM (sin estado) para no volver a pintar la tarjeta que se arrastra
  const marcar = (e: React.DragEvent<HTMLElement>, si: boolean) => { e.currentTarget.dataset.sobre = si ? "si" : ""; };
  const soltar = (destino: "en_espera" | "en_consulta") => (e: React.DragEvent<HTMLElement>) => {
    e.preventDefault();
    marcar(e, false);
    const c = citas.find((x) => x.id === e.dataTransfer.getData("text/cita"));
    if (!c) return;
    if (destino === "en_espera" && c.estado === "citado" && esHoy) estado(c.id, "en_espera");
    if (destino === "en_consulta" && c.estado === "en_espera") atender(c);
  };

  const Columna = ({ titulo, icono: Icono, n, tono, children, destino }: { titulo: string; icono: typeof Clock; n: number; tono: string; children: React.ReactNode; destino?: "en_espera" | "en_consulta" }) => (
    <Card
      className="gap-0 py-0 transition-shadow data-[sobre=si]:ring-2 data-[sobre=si]:ring-primary"
      onDragOver={destino ? (e) => { e.preventDefault(); marcar(e, true); } : undefined}
      onDragLeave={destino ? (e) => marcar(e, false) : undefined}
      onDrop={destino ? soltar(destino) : undefined}
    >
      <CardHeader className="flex flex-row items-center gap-2 border-b px-4 py-3">
        <Icono className={cn("size-4", tono)} />
        <CardTitle className="text-sm">{titulo}</CardTitle>
        <span className="ml-auto rounded-full bg-muted px-2 text-xs font-medium tabular-nums">{n}</span>
      </CardHeader>
      <CardContent className="px-0">
        {n === 0 ? <p className="px-4 py-6 text-center text-sm text-muted-foreground">{destino ? "Nadie · suelta aquí" : "Nadie"}</p> : <ul className="divide-y">{children}</ul>}
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-3">
      {error && <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
      <div className={cn("grid grid-cols-1 items-start gap-4 md:grid-cols-2 xl:grid-cols-4", ocupado && "pointer-events-none opacity-70")}>
        <Columna titulo={esHoy ? "Citados para hoy" : "Citados"} icono={CalendarCheck2} n={citados.length} tono="text-primary">
          {citados.map((c) => (
            <Fila key={c.id} c={c} arrastrable={esHoy}>
              {esHoy && <Button size="sm" variant="outline" onClick={() => estado(c.id, "en_espera")}><UserCheck /> Llegó</Button>}
              <Button size="icon" variant="ghost" className="size-8 text-ok-texto" asChild title={numeroWhatsApp(c.telefono) ? "Recordar la cita por WhatsApp" : "Recordar por WhatsApp (sin teléfono registrado: elige el contacto)"}>
                <a href={recordatorio(c)} target="_blank" rel="noreferrer" aria-label="Recordar por WhatsApp"><MessageCircle /></a>
              </Button>
              <Button size="icon" variant="ghost" className="size-8" title="No asistió" aria-label="No asistió" onClick={() => estado(c.id, "no_asistio")}><UserX /></Button>
              <Button size="icon" variant="ghost" className="size-8" title="Cancelar cita" aria-label="Cancelar cita" onClick={async () => (await confirmar({ titulo: `¿Cancelar la cita de ${c.paciente}?`, accion: "Cancelar cita", cancelar: "Volver", peligro: true })) && estado(c.id, "cancelada")}><X /></Button>
            </Fila>
          ))}
        </Columna>

        <Columna titulo="En espera" icono={Clock} n={espera.length} tono="text-aviso-texto" destino={esHoy ? "en_espera" : undefined}>
          {espera.map((c) => {
            const min = minutosDesde(c.llegada, ahora);
            return (
              <Fila key={c.id} c={c} arrastrable detalle={<span className={cn("font-medium tabular-nums", tonoEspera(min))}> · espera {min} min</span>}>
                <Button size="sm" onClick={() => atender(c)}>{ocupado ? <Loader2 className="animate-spin" /> : <Stethoscope />} Atender</Button>
              </Fila>
            );
          })}
        </Columna>

        <Columna titulo="En consulta" icono={Stethoscope} n={enConsulta.length} tono="text-primary" destino="en_consulta">
          {enConsulta.map((c) => (
            <Fila key={c.id} c={c} detalle={<Faltan n={c.consultaId ? pendientes[c.consultaId] : 0} />}>
              {c.consultaId && <Button size="sm" variant="ghost" asChild><Link href={`/atencion/${c.consultaId}`}>Abrir</Link></Button>}
            </Fila>
          ))}
        </Columna>

        <Columna titulo="Atendidos" icono={CheckCircle2} n={cerradas.length} tono="text-ok-texto">
          {cerradas.map((c) => (
            <Fila
              key={c.id}
              c={c}
              detalle={<span className={cn("font-medium", c.estado === "atendido" ? "text-ok-texto" : "text-muted-foreground")}>
                {" · "}{{ atendido: "atendido", no_asistio: "no asistió", cancelada: "cancelada" }[c.estado as "atendido"]}
                <Faltan n={c.consultaId ? pendientes[c.consultaId] : 0} />
              </span>}
            >
              {c.consultaId && <Button size="sm" variant="ghost" asChild><Link href={`/atencion/${c.consultaId}`}>Abrir</Link></Button>}
            </Fila>
          ))}
        </Columna>
      </div>
    </div>
  );
}
