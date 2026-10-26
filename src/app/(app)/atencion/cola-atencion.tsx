"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { CalendarCheck2, Clock, Loader2, MessageCircle, Stethoscope, UserCheck, UserX, X } from "lucide-react";
import { enlaceWhatsApp, fechaLarga, llenar, numeroWhatsApp } from "@/lib/mensajes";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Cita, EstadoCita } from "@/lib/citas";
import { cn } from "@/lib/utils";
import { iniciarConsulta } from "./acciones";
import { cambiarEstadoCita } from "./citas-acciones";

const minutosDesde = (iso: string | null, ahora: number) => (iso ? Math.max(0, Math.round((ahora - new Date(iso).getTime()) / 60e3)) : 0);

function Fila({ c, children, detalle }: { c: Cita; children?: React.ReactNode; detalle?: React.ReactNode }) {
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5">
      <span className="w-12 font-mono text-sm text-muted-foreground">{c.hora ?? "—"}</span>
      <div className="min-w-0 flex-1">
        <Link href={`/pacientes/${c.trabajadorId}`} className="font-medium leading-tight hover:text-primary">{c.paciente}</Link>
        <div className="text-xs text-muted-foreground">{[c.motivo, c.cedula].filter(Boolean).join(" · ")}{detalle}</div>
      </div>
      <div className="flex gap-1">{children}</div>
    </li>
  );
}

export function ColaAtencion({ citas, esHoy, mensaje }: { citas: Cita[]; esHoy: boolean; mensaje: { servicio: string; plantilla: string } }) {
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

  const Columna = ({ titulo, icono: Icono, n, tono, children }: { titulo: string; icono: typeof Clock; n: number; tono: string; children: React.ReactNode }) => (
    <Card className="gap-0 py-0">
      <CardHeader className="flex flex-row items-center gap-2 border-b px-4 py-3">
        <Icono className={cn("size-4", tono)} />
        <CardTitle className="text-sm">{titulo}</CardTitle>
        <span className="ml-auto rounded-full bg-muted px-2 text-xs font-medium">{n}</span>
      </CardHeader>
      <CardContent className="px-0">
        {n === 0 ? <p className="px-4 py-6 text-center text-sm text-muted-foreground">Nadie</p> : <ul className="divide-y">{children}</ul>}
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-3">
      {error && <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
      <div className={cn("grid gap-4 md:grid-cols-2 2xl:grid-cols-3", ocupado && "pointer-events-none opacity-70")}>
        <Columna titulo="En espera" icono={Clock} n={espera.length} tono="text-aviso-texto">
          {espera.map((c) => {
            const min = minutosDesde(c.llegada, ahora);
            return (
              <Fila key={c.id} c={c} detalle={<span className={cn(" font-medium", min >= 30 && "text-alerta-texto")}> · espera {min} min</span>}>
                <Button size="sm" onClick={() => atender(c)}>{ocupado ? <Loader2 className="animate-spin" /> : <Stethoscope />} Atender</Button>
              </Fila>
            );
          })}
        </Columna>

        <Columna titulo={esHoy ? "Citados para hoy" : "Citados"} icono={CalendarCheck2} n={citados.length} tono="text-primary">
          {citados.map((c) => (
            <Fila key={c.id} c={c}>
              {esHoy && <Button size="sm" variant="outline" onClick={() => estado(c.id, "en_espera")}><UserCheck /> Llegó</Button>}
              <Button size="icon" variant="ghost" className="size-8 text-ok-texto" asChild title={numeroWhatsApp(c.telefono) ? "Recordar la cita por WhatsApp" : "Recordar por WhatsApp (sin teléfono registrado: elige el contacto)"}>
                <a href={recordatorio(c)} target="_blank" rel="noreferrer"><MessageCircle /></a>
              </Button>
              <Button size="icon" variant="ghost" className="size-8" title="No asistió" onClick={() => estado(c.id, "no_asistio")}><UserX /></Button>
              <Button size="icon" variant="ghost" className="size-8" title="Cancelar cita" onClick={() => confirm(`¿Cancelar la cita de ${c.paciente}?`) && estado(c.id, "cancelada")}><X /></Button>
            </Fila>
          ))}
        </Columna>

        <Columna titulo="En consulta y atendidos" icono={Stethoscope} n={enConsulta.length + cerradas.length} tono="text-ok-texto">
          {[...enConsulta, ...cerradas].map((c) => (
            <Fila
              key={c.id}
              c={c}
              detalle={<span className={cn(" font-medium", c.estado === "en_consulta" ? "text-primary" : c.estado === "atendido" ? "text-ok-texto" : "text-muted-foreground")}>
                {" · "}{{ en_consulta: "en consulta", atendido: "atendido", no_asistio: "no asistió", cancelada: "cancelada" }[c.estado as "en_consulta"]}
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
