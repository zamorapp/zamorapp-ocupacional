"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { CalendarCheck2, CalendarClock, CalendarX2, Loader2, MessageCircle, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FranjaDeshacerLocal } from "@/components/app/franja-deshacer-local";
import type { CitaPorConfirmar } from "@/lib/citas";
import { enlaceWhatsApp, fechaLarga, llenar, numeroWhatsApp } from "@/lib/mensajes";
import { cn } from "@/lib/utils";
import { cambiarFechaCitaPendiente, confirmarCitaPendiente, deshacerEliminarCita, eliminarCitaPendiente } from "../citas-acciones";

const DIA = new Intl.DateTimeFormat("es-VE", { weekday: "short", timeZone: "UTC" });
const MES = new Intl.DateTimeFormat("es-VE", { month: "short", timeZone: "UTC" });
const partes = (iso: string) => {
  const d = new Date(iso + "T12:00:00Z");
  return { dia: DIA.format(d).replace(".", ""), num: iso.slice(8, 10), mes: MES.format(d).replace(".", "") };
};

type Borrada = { cita: CitaPorConfirmar; antes: "citado" | "solicitada" };

export function ListaPorConfirmar({ citas, hoy, servicio, plantilla }: { citas: CitaPorConfirmar[]; hoy: string; servicio: string; plantilla: string }) {
  // Lo que se quitó (confirmada o eliminada) se esconde al instante; el refresco del servidor trae la lista nueva
  const [quitadas, setQuitadas] = useState<Set<string>>(new Set());
  const [borrada, setBorrada] = useState<Borrada | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cambiando, setCambiando] = useState<string | null>(null);
  const [ocupado, iniciar] = useTransition();

  // «Deshacer» queda 10 s a la vista (Diseño: mínimo 8 s); la X lo cierra antes
  useEffect(() => {
    if (!borrada && !aviso) return;
    const t = setTimeout(() => { setBorrada(null); setAviso(null); }, 10_000);
    return () => clearTimeout(t);
  }, [borrada, aviso]);

  const visibles = citas.filter((c) => !quitadas.has(c.id));
  const quitar = (id: string) => setQuitadas((q) => new Set(q).add(id));
  const volver = (id: string) => setQuitadas((q) => { const n = new Set(q); n.delete(id); return n; });

  const confirmar = (c: CitaPorConfirmar) => iniciar(async () => {
    quitar(c.id);
    const r = await confirmarCitaPendiente(c.id);
    if (!r.ok) { volver(c.id); setError(r.mensaje); return; }
    setError(null); setBorrada(null); setAviso(`Cita confirmada: ${c.paciente}, ${fechaLarga(c.fecha)}${c.hora ? ` a las ${c.hora}` : ""}.`);
  });
  const eliminar = (c: CitaPorConfirmar) => iniciar(async () => {
    quitar(c.id);
    const r = await eliminarCitaPendiente(c.id);
    if (!r.ok || !r.antes) { volver(c.id); setError(r.mensaje); return; }
    setError(null); setAviso(null); setBorrada({ cita: c, antes: r.antes });
  });
  const deshacer = () => iniciar(async () => {
    if (!borrada) return;
    const r = await deshacerEliminarCita(borrada.cita.id, borrada.antes);
    if (!r.ok) { setError(r.mensaje); return; }
    volver(borrada.cita.id); setBorrada(null);
  });
  const moverFecha = (c: CitaPorConfirmar, datos: FormData) => iniciar(async () => {
    const r = await cambiarFechaCitaPendiente(c.id, String(datos.get("fecha") ?? ""), String(datos.get("hora") ?? "") || null);
    if (!r.ok) { setError(r.mensaje); return; }
    setError(null); setCambiando(null); setAviso(`Nueva fecha para ${c.paciente}: ${fechaLarga(String(datos.get("fecha")))}. Sigue por confirmar.`);
  });

  const mensaje = (c: CitaPorConfirmar) => enlaceWhatsApp(c.telefono, llenar(plantilla, { nombre: c.paciente, cedula: c.cedula, fecha: fechaLarga(c.fecha), hora: c.hora ?? "la hora acordada", motivo: c.motivo, empresa: c.empresa, servicio }));

  return (
    <div className="space-y-3">
      {/* El aviso va arriba y fuera de la lista: no lo tapa la tarjeta que sube a ocupar el lugar de la quitada */}
      <div aria-live="polite" className="space-y-2 empty:hidden">
        {borrada && <FranjaDeshacerLocal texto={`Cita eliminada: ${borrada.cita.paciente}, ${fechaLarga(borrada.cita.fecha)}.`} ocupado={ocupado} onDeshacer={deshacer} onCerrar={() => setBorrada(null)} />}
        {aviso && <p role="status" className="rounded-lg border border-ok/40 bg-ok/10 px-3 py-2 text-sm">{aviso}</p>}
        {error && <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
      </div>

      <Card className="gap-0 overflow-hidden py-0">
        <div className="flex flex-wrap items-center gap-2 border-b px-5 py-3">
          <CalendarClock className="size-5 text-primary" aria-hidden />
          <span className="font-semibold">{visibles.length ? `${visibles.length} por confirmar` : "Nada por confirmar"}</span>
          <Button variant="outline" size="sm" className="ml-auto max-sm:min-h-11" asChild><Link href="/atencion">Agendar otra en Atención médica</Link></Button>
        </div>
        {visibles.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-muted-foreground">No hay citas por confirmar. Al agendar, marca «Por confirmar» si la cita espera el sí de la empresa.</p>
        ) : (
          <ul className="divide-y">
            {visibles.map((c) => {
              const p = partes(c.fecha);
              const vencio = c.fecha < hoy;
              return (
                <li key={c.id} className={cn("grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-3 px-5 py-4 sm:grid-cols-[auto_minmax(0,1fr)_auto]", ocupado && "opacity-90")}>
                  <div className={cn("w-14 self-start rounded-lg border py-1 text-center tabular-nums", vencio && "border-alerta/50")}>
                    <span className="block text-[11px] uppercase text-muted-foreground">{p.dia}</span>
                    <b className="block text-xl leading-tight">{p.num}</b>
                    <span className="block text-[11px] uppercase text-muted-foreground">{p.mes}</span>
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="font-semibold">{c.paciente}</span>
                      <span className={cn("rounded-full px-2 py-px text-[11px] font-semibold whitespace-nowrap", c.tipo === "solicitada" ? "bg-aviso/20 text-aviso-texto" : "bg-primary/15 text-primary")}>
                        {c.tipo === "solicitada" ? "La pidió la empresa" : "Espera a la empresa"}
                      </span>
                      {vencio && <span className="rounded-full bg-alerta/15 px-2 py-px text-[11px] font-semibold text-alerta-texto">Venció</span>}
                    </div>
                    <p className="text-sm text-muted-foreground">{[c.cedula, c.empresa, c.cargo].filter(Boolean).join(" · ")}</p>
                    <p className="text-sm text-muted-foreground">{[c.hora ?? "Sin hora", c.motivo].filter(Boolean).join(" · ")}</p>
                    {c.observacion && <p className="mt-0.5 text-sm break-words">{c.observacion}</p>}
                    {cambiando === c.id && (
                      <form action={(d) => moverFecha(c, d)} className="mt-2 flex flex-wrap items-end gap-2">
                        <label className="text-xs text-muted-foreground">Día<input name="fecha" type="date" required min={hoy} defaultValue={vencio ? hoy : c.fecha} className="mt-0.5 block h-9 rounded-md border bg-transparent px-2 text-sm text-foreground" /></label>
                        <label className="text-xs text-muted-foreground">Hora<input name="hora" type="time" defaultValue={c.hora ?? ""} className="mt-0.5 block h-9 rounded-md border bg-transparent px-2 text-sm text-foreground" /></label>
                        <Button type="submit" size="sm" disabled={ocupado} className="max-sm:min-h-11">{ocupado && <Loader2 className="animate-spin" />} Guardar fecha</Button>
                        <Button type="button" size="sm" variant="ghost" onClick={() => setCambiando(null)} className="max-sm:min-h-11">Cancelar</Button>
                      </form>
                    )}
                  </div>
                  <div className="col-span-2 flex flex-wrap items-start gap-1.5 sm:col-span-1 sm:justify-end">
                    <Button size="sm" disabled={ocupado} onClick={() => confirmar(c)} className="max-sm:min-h-11"><CalendarCheck2 /> Confirmar</Button>
                    {(vencio || c.tipo === "provisional") && cambiando !== c.id && (
                      <Button size="sm" variant="outline" disabled={ocupado} onClick={() => setCambiando(c.id)} className="max-sm:min-h-11"><CalendarClock /> Cambiar fecha</Button>
                    )}
                    <Button size="sm" variant="outline" className="text-ok-texto max-sm:min-h-11" asChild title={numeroWhatsApp(c.telefono) ? "Escribirle por WhatsApp" : "Sin teléfono registrado: elige el contacto"}>
                      <a href={mensaje(c)} target="_blank" rel="noreferrer"><MessageCircle /> WhatsApp</a>
                    </Button>
                    <Button size="sm" variant="outline" disabled={ocupado} onClick={() => eliminar(c)} className="text-destructive max-sm:min-h-11"><Trash2 /> Eliminar</Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
      {visibles.some((c) => c.tipo === "solicitada") && (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><CalendarX2 className="size-3.5 shrink-0" aria-hidden /><span>Para proponer otra hora a la empresa usa «Solicitudes» en <Link href="/atencion" className="text-primary hover:underline">Atención médica</Link>.</span></p>
      )}
    </div>
  );
}
