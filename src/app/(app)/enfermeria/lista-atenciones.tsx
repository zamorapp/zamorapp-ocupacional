"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { ArrowUp, ArrowUpRight, Check, ClipboardCheck, FileText, Loader2, Trash2 } from "lucide-react";
import { confirmar } from "@/components/app/confirmar";
import { Button } from "@/components/ui/button";
import { ETIQUETA_TIPO_ENFERMERIA, SIGNOS_ENFERMERIA, nivelTension } from "@/lib/enfermeria-tipos";
import { cn } from "@/lib/utils";
import type { AtencionEnfermeria, OrdenEnfermeria } from "@/lib/enfermeria";
import { borrarAtencion, cumplirOrden } from "./acciones";

const fechaCorta = (iso: string) => iso.slice(0, 10).split("-").reverse().join("/");

// La tensión alta lleva palabra y flecha, no solo color (se lee igual en blanco y negro o sin distinguir el rojo)
export function Tension({ ta }: { ta: string }) {
  const nivel = nivelTension(ta);
  if (!nivel) return <>{ta} mmHg</>;
  return (
    <span className="inline-flex items-center gap-0.5 font-semibold text-alerta-texto">
      <ArrowUp className="size-3" aria-hidden />{ta} mmHg · {nivel === "crisis" ? "muy alta, referir" : "alta"}
    </span>
  );
}

export function ListaAtenciones({ atenciones, puedeBorrarTodo, vacio = "Sin atenciones este día.", conConsulta = true }: {
  atenciones: AtencionEnfermeria[]; puedeBorrarTodo: boolean; vacio?: string; conConsulta?: boolean;
}) {
  const [pendiente, iniciar] = useTransition();
  const [mensaje, setMensaje] = useState<{ ok: boolean; mensaje: string } | null>(null);
  const [borrando, setBorrando] = useState<string | null>(null);

  const borrar = async (a: AtencionEnfermeria) => {
    const si = await confirmar({
      titulo: "¿Borrar esta atención?",
      texto: `${ETIQUETA_TIPO_ENFERMERIA[a.tipo] ?? a.tipo}${a.trabajador ? ` de ${a.trabajador.nombre}` : ""}, del ${fechaCorta(a.fecha)}. Es para corregir un error: se puede volver a registrar.`,
      accion: "Sí, borrar",
      peligro: true,
    });
    if (!si) return;
    setBorrando(a.id);
    iniciar(async () => { setMensaje(await borrarAtencion(a.id)); setBorrando(null); });
  };

  if (!atenciones.length) return <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">{vacio}</p>;
  return (
    <div className="space-y-2">
      {mensaje && <p role="status" className={cn("rounded-md px-3 py-2 text-sm", mensaje.ok ? "bg-ok/10 text-ok-texto" : "bg-destructive/10 text-destructive")}>{mensaje.mensaje}</p>}
      <ul className="divide-y rounded-lg border">
        {atenciones.map((a) => {
          const signos = SIGNOS_ENFERMERIA.filter((s) => a.signos[s.k]);
          return (
            <li key={a.id} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1 px-3 py-3 text-sm">
              <div className="min-w-0 space-y-1">
                <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">{ETIQUETA_TIPO_ENFERMERIA[a.tipo] ?? a.tipo}</span>
                  {a.trabajador
                    ? <Link href={`/pacientes/${a.trabajador.id}`} className="font-medium hover:underline [overflow-wrap:anywhere]">{a.trabajador.nombre}</Link>
                    : <span className="font-medium">{a.empresa}</span>}
                  {a.referido && <span className="rounded-full bg-aviso/15 px-2 py-0.5 text-xs font-medium text-aviso-texto">Referido al médico</span>}
                </p>
                {(a.motivo || a.cie10) && <p className="text-muted-foreground">{a.motivo}{a.cie10 && <span className="ml-1 font-cifra text-xs">({a.cie10})</span>}</p>}
                {signos.length > 0 && (
                  <p className="flex flex-wrap gap-x-3 gap-y-0.5 font-cifra text-xs">
                    {signos.map((s) => (
                      <span key={s.k}>
                        {s.t} {s.k === "ta" ? <Tension ta={a.signos.ta} /> : <>{a.signos[s.k]} {s.unidad}</>}
                      </span>
                    ))}
                  </p>
                )}
                {a.tratamiento && <p className="[overflow-wrap:anywhere]"><span className="text-muted-foreground">Tratamiento:</span> {a.tratamiento}</p>}
                {a.nota && <p className={cn("[overflow-wrap:anywhere]", a.tipo !== "evolucion" && "text-muted-foreground")}>{a.nota}</p>}
                {conConsulta && a.consultaId && (
                  <Link href={`/atencion/${a.consultaId}`} className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
                    <FileText className="size-3.5" aria-hidden /> Anotada en una consulta del médico
                  </Link>
                )}
                <p className="text-xs text-muted-foreground">{fechaCorta(a.fecha)}{a.trabajador ? ` · ${a.empresa}` : ""}{a.registradoPor ? ` · ${a.registradoPor}` : ""}</p>
              </div>
              {(a.mia || puedeBorrarTodo) && (
                <Button size="icon" variant="ghost" className="text-muted-foreground hover:text-alerta-texto" aria-label="Borrar esta atención"
                  title="Para un error de tecleo: quien la registró, el mismo día" disabled={pendiente} onClick={() => borrar(a)}>
                  {borrando === a.id ? <Loader2 className="animate-spin" /> : <Trash2 />}
                </Button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// Órdenes del médico a enfermería (de «Indicación o récipe»): la enfermera las marca «Cumplida»
export function OrdenesPendientes({ ordenes }: { ordenes: OrdenEnfermeria[] }) {
  const [pendiente, iniciar] = useTransition();
  const [hechas, setHechas] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const visibles = ordenes.filter((o) => !hechas.includes(o.id));
  if (!visibles.length) return <p className="text-sm text-muted-foreground">No hay órdenes del médico por cumplir.</p>;
  return (
    <div className="space-y-2">
      {error && <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
      <ul className="space-y-2">
        {visibles.map((o) => (
          <li key={o.id} className="flex flex-wrap items-start gap-3 rounded-lg border bg-background p-3 text-sm">
            <ClipboardCheck className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="font-medium [overflow-wrap:anywhere]">{o.paciente} <span className="font-normal text-muted-foreground">· {o.cedula}</span></p>
              <p className="[overflow-wrap:anywhere]">{o.texto || "Ver indicación en su historia"}</p>
              <p className="text-xs text-muted-foreground">{fechaCorta(o.fecha)}{o.indicadoPor ? ` · indicado por ${o.indicadoPor}` : ""}</p>
            </div>
            <Button size="sm" disabled={pendiente} onClick={() => iniciar(async () => {
              const r = await cumplirOrden(o.id, "");
              if (r.ok) setHechas((h) => [...h, o.id]); else setError(r.mensaje);
            })}>
              {pendiente ? <Loader2 className="animate-spin" /> : <Check />} Cumplida
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function VerReporte({ href, children }: { href: string; children: React.ReactNode }) {
  return <Link href={href} className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">{children} <ArrowUpRight className="size-3.5" /></Link>;
}
