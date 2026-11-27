"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Bot, CalendarDays, FileText, FlaskConical, Loader2, Mail, MessageCircle, Paperclip, Printer, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { lineaOrden } from "@/lib/indicaciones-sueltas";
import type { BorradorAgente } from "@/lib/agentes/borradores";
import { FormIndicacion } from "../pacientes/[id]/indicaciones";
import { aprobarConstanciaBorrador, descartarBorrador } from "./acciones";

const ENVIO = { imprimir: [Printer, "Imprimir"], whatsapp: [MessageCircle, "WhatsApp"], correo: [Mail, "Correo"] } as const;

export function ListaBorradores({ items }: { items: BorradorAgente[] }) {
  const [abierto, setAbierto] = useState<BorradorAgente | null>(null);
  if (!items.length) {
    return (
      <div className="rounded-xl border bg-muted/30 p-8 text-center">
        <Bot className="mx-auto size-8 text-muted-foreground" aria-hidden />
        <p className="mt-2 font-medium">No hay nada por revisar</p>
        <p className="text-sm text-muted-foreground">
          Pídele a tu agente un récipe, una orden de exámenes o una constancia de aptitud. Se activa en <Link href="/configuracion/agentes" className="text-primary underline">Puerta para agentes</Link>.
        </p>
      </div>
    );
  }
  return (
    <>
      <ul className="space-y-3" aria-label="Por revisar">
        {items.map((b) => <Fila key={b.id} b={b} revisar={() => setAbierto(b)} />)}
      </ul>
      {abierto && abierto.tipo !== "constancia" && (
        <FormIndicacion trabajadorId={abierto.trabajadorId} nombre={abierto.paciente} onCerrar={() => setAbierto(null)}
          inicial={{
            borradorId: abierto.id, tipo: abierto.tipo, tratamiento: abierto.tratamiento, examenes: abierto.examenes, indicaciones: abierto.indicaciones,
            consultaId: abierto.consultaId, envio: abierto.envio, correo: abierto.correo, correoTrabajador: abierto.correoTrabajador, agente: abierto.agente, fecha: abierto.fecha, correosAutorizados: abierto.correosAutorizados,
          }} />
      )}
    </>
  );
}

function Fila({ b, revisar }: { b: BorradorAgente; revisar: () => void }) {
  const router = useRouter();
  const [porDescartar, setPorDescartar] = useState(false);
  const [porAprobar, setPorAprobar] = useState(false);
  const [error, setError] = useState("");
  const [ocupado, iniciar] = useTransition();
  const Icono = b.tipo === "examenes" ? FlaskConical : FileText;
  const [IconoEnvio, envio] = ENVIO[b.envio];
  const lineas = b.tipo === "recipe" ? b.tratamiento.map(lineaOrden) : b.examenes;
  const descartar = () => iniciar(async () => {
    setError("");
    const r = await descartarBorrador(b.id);
    if (!r.ok) setError(r.mensaje); else router.refresh();
  });
  const aprobar = () => iniciar(async () => {
    setError("");
    const r = await aprobarConstanciaBorrador(b.id);
    if (r.ok) router.push(r.ruta); else setError(r.mensaje);
  });
  return (
    <li className="rounded-xl border bg-card p-4" data-borrador={b.tipo}>
      <div className="flex flex-wrap items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"><Icono className="size-5" aria-hidden /></span>
        <div className="min-w-0 flex-1 basis-60">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{b.tipo === "constancia" ? "Constancia de aptitud" : b.tipo === "recipe" ? "Récipe" : "Orden de exámenes"}</span>
            <Link href={`/pacientes/${b.trabajadorId}`} className="text-primary hover:underline">{b.paciente}</Link>
            <span className="font-mono text-xs text-muted-foreground">{b.cedula}</span>
          </div>
          {b.tipo === "constancia" ? (
            b.constancia ? (
              <dl className="mt-1 space-y-0.5 text-sm">
                <div><dt className="inline font-medium">Empresa </dt><dd className="inline">{b.constancia.empresa}</dd></div>
                <div><dt className="inline font-medium">Fecha de consulta </dt><dd className="inline">{b.constancia.fecha.split("-").reverse().join("/")}</dd></div>
                <div><dt className="inline font-medium">Aptitud </dt><dd className="inline">{b.constancia.aptitud}</dd></div>
              </dl>
            ) : <p className="mt-1 text-sm text-muted-foreground">La consulta firmada de este borrador ya no está disponible. Si fue corregida, pide otro borrador.</p>
          ) : <ul className="mt-1 space-y-0.5 text-sm">
            {lineas.slice(0, 6).map((l, i) => <li key={i}>{l}</li>)}
            {lineas.length > 6 && <li className="text-muted-foreground">y {lineas.length - 6} más…</li>}
            {b.indicaciones && <li className="whitespace-pre-line text-muted-foreground">{b.indicaciones}</li>}
          </ul>}
          <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
            <span className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5"><Paperclip className="size-3" aria-hidden />{b.adjuntar === "consulta" ? "Con consulta" : "Suelto"}</span>
            {b.fecha && <span className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5" data-chip="fecha"><CalendarDays className="size-3" aria-hidden />Fecha {b.fecha.split("-").reverse().join("/")}</span>}
            <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5", b.envio === "correo" && "font-medium")}>
              <IconoEnvio className="size-3" aria-hidden />{envio}{b.envio === "correo" && b.correo ? `: ${b.correo}` : ""}
            </span>
            <span className="text-muted-foreground">Preparó {b.agente} · {b.preparadoEl}</span>
          </div>
        </div>
        {!porDescartar && !porAprobar && (
          <div className="flex w-full flex-wrap gap-2 sm:w-auto">
            {b.tipo === "constancia" ? (
              <Button className="h-11 flex-1 sm:h-9 sm:flex-none" disabled={!b.constancia} onClick={() => setPorAprobar(true)}>Revisar constancia</Button>
            ) : <Button className="h-11 flex-1 sm:h-9 sm:flex-none" onClick={revisar} data-accion="revisar-borrador">Revisar y emitir</Button>}
            <Button variant="ghost" className="h-11 text-muted-foreground sm:h-9" onClick={() => setPorDescartar(true)}><X /> Descartar</Button>
          </div>
        )}
      </div>
      {porAprobar && (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-md bg-muted px-3 py-2 text-sm">
          <span className="flex-1 basis-56">Al aprobar, se abre la constancia para imprimir.</span>
          <Button className="min-h-11 sm:min-h-9" disabled={ocupado || !b.constancia} onClick={aprobar}>Aprobar y abrir constancia</Button>
          <Button variant="outline" className="min-h-11 sm:min-h-9" disabled={ocupado} onClick={() => { setPorAprobar(false); setError(""); }}>Cancelar</Button>
        </div>
      )}
      {porDescartar && (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-md bg-muted px-3 py-2 text-sm">
          <span className="flex-1 basis-56">¿Descartar este borrador? No se imprime ni se envía.</span>
          <Button variant="destructive" className="h-11 sm:h-8" disabled={ocupado} onClick={descartar}>{ocupado ? <Loader2 className="animate-spin" /> : <X />} Sí, descartar</Button>
          <Button variant="outline" className="h-11 sm:h-8" disabled={ocupado} onClick={() => setPorDescartar(false)}>Cancelar</Button>
        </div>
      )}
      {error && <p role="alert" className="mt-2 text-sm text-alerta-texto">{error}</p>}
    </li>
  );
}
