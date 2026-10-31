"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { AlertTriangle, CalendarClock, Check, ChevronDown, Inbox, Loader2, MessageCircle, Send, Undo2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { Cita } from "@/lib/citas";
import { enlaceWhatsApp } from "@/lib/mensajes";
import { hora12, textoPropuesta, type ModoPropuesta } from "@/lib/propuesta";
import { cn } from "@/lib/utils";
import { agendaDelDia, anularPropuesta, choquesAgenda, confirmarSolicitudes, proponerHora, rechazarSolicitudes, type Agenda } from "./citas-acciones";
import { confirmar } from "@/components/app/confirmar";

export type Contacto = { nombre: string; telefono: string };
type Grupo = { clave: string; citas: Cita[] };

const MODOS: { v: ModoPropuesta; t: string }[] = [
  { v: "exacta", t: "Hora exacta" },
  { v: "rango", t: "Entre" },
  { v: "desde", t: "A partir de" },
];

// Una solicitud de varios trabajadores (misma empresa, día, hora y estado de propuesta) se atiende de una vez
function agrupar(solicitudes: Cita[]): Grupo[] {
  const grupos = new Map<string, Cita[]>();
  for (const c of solicitudes) {
    const p = c.propuesta;
    const clave = [c.empresaId, c.fecha, c.hora, c.motivoId, c.observacion, p ? `${p.fecha}|${p.desde}|${p.hasta}|${p.modo}` : "", c.respuestaEmpresa].join("·");
    grupos.set(clave, [...(grupos.get(clave) ?? []), c]);
  }
  return [...grupos].map(([clave, citas]) => ({ clave, citas }));
}

// Aviso de choque: solo informa, nunca bloquea. Se recalcula al cambiar el día o la hora.
function useChoques(fecha: string, hora: string, excluir: string) {
  const [choques, setChoques] = useState<string[]>([]);
  useEffect(() => {
    let vigente = true;
    const t = setTimeout(() => { choquesAgenda(fecha, hora || null, excluir).then((r) => vigente && setChoques(r)).catch(() => {}); }, 300);
    return () => { vigente = false; clearTimeout(t); };
  }, [fecha, hora, excluir]);
  return choques;
}

function Proponer({ g, alEnviar, alCerrar }: { g: Grupo; alEnviar: () => void; alCerrar: () => void }) {
  const c = g.citas[0];
  const [modo, setModo] = useState<ModoPropuesta>("rango");
  const [fecha, setFecha] = useState(c.fecha);
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [nota, setNota] = useState("");
  const [agenda, setAgenda] = useState<Agenda | null>(null);
  const [ocupado, iniciar] = useTransition();
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { agendaDelDia(c.empresaId, fecha).then(setAgenda).catch(() => setAgenda(null)); }, [c.empresaId, fecha]);
  const libres = agenda?.horas?.filter((h) => h.libres > 0) ?? [];
  const listo = Boolean(fecha && desde && (modo !== "rango" || (hasta && hasta > desde)));
  const enviar = () => iniciar(async () => {
    const r = await proponerHora(g.citas.map((x) => x.id), { fecha, modo, desde, hasta: modo === "rango" ? hasta : null, nota: nota || null });
    if (r.ok) alEnviar(); else setError(r.mensaje);
  });
  return (
    <div className="mt-2 w-full space-y-3 rounded-lg border border-primary/30 bg-primary/5 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium">Proponer otra hora</span>
        <div role="radiogroup" aria-label="Tipo de propuesta" className="flex rounded-md border bg-background p-0.5">
          {MODOS.map((m) => (
            <button key={m.v} type="button" role="radio" aria-checked={modo === m.v} onClick={() => setModo(m.v)}
              className={cn("rounded px-2.5 py-1 text-xs font-medium transition", modo === m.v ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>
              {m.t}
            </button>
          ))}
        </div>
        <Button type="button" variant="ghost" size="icon" className="ml-auto size-7" aria-label="Cerrar" onClick={alCerrar}><X /></Button>
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-0.5 text-xs text-muted-foreground">Día<Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className="h-9 w-40" /></label>
        <label className="flex flex-col gap-0.5 text-xs text-muted-foreground">{modo === "rango" ? "Desde" : modo === "desde" ? "A partir de" : "Hora"}<Input type="time" value={desde} onChange={(e) => setDesde(e.target.value)} className="h-9 w-32" /></label>
        {modo === "rango" && <label className="flex flex-col gap-0.5 text-xs text-muted-foreground">Hasta<Input type="time" value={hasta} onChange={(e) => setHasta(e.target.value)} className="h-9 w-32" /></label>}
      </div>
      {agenda?.configurado && (
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">{libres.length ? "Horas con cupo ese día (toca una):" : "Ese día no tiene horas con cupo en su horario."}</p>
          <div className="flex flex-wrap gap-1.5">
            {libres.map((h) => (
              <button key={h.hora} type="button" onClick={() => (modo === "rango" && desde && !hasta && h.hora > desde ? setHasta(h.hora) : setDesde(h.hora))}
                className={cn("rounded-full border px-2.5 py-0.5 text-xs transition hover:border-primary", (h.hora === desde || h.hora === hasta) && "border-primary bg-primary text-primary-foreground")}>
                {hora12(h.hora)} <span className="opacity-70">· {h.libres}</span>
              </button>
            ))}
          </div>
        </div>
      )}
      <Input value={nota} onChange={(e) => setNota(e.target.value)} maxLength={300} placeholder="Nota para RR. HH. (opcional): «Ese día tengo evaluaciones en otra empresa»" aria-label="Nota para RR. HH." className="h-9" />
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-xs text-muted-foreground">RR. HH. lo recibe en la campanita, su correo y su celular, y responde «Aceptar» o «Pedir otra».</p>
        <Button size="sm" className="ml-auto" disabled={!listo || ocupado} onClick={enviar}>{ocupado ? <Loader2 className="animate-spin" /> : <Send />} Enviar propuesta</Button>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

function Solicitud({ g, contactos, servicio, url }: { g: Grupo; contactos: Record<string, Contacto>; servicio: string; url: string }) {
  const c = g.citas[0];
  const ids = useMemo(() => g.citas.map((x) => x.id), [g.citas]);
  const [fecha, setFecha] = useState(c.fecha);
  const [hora, setHora] = useState(c.hora ?? "");
  const [proponiendo, setProponiendo] = useState(false);
  const [verTodos, setVerTodos] = useState(false);
  const [ocupado, iniciar] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const choques = useChoques(fecha, hora, c.id);
  const cambiada = fecha !== c.fecha || hora !== (c.hora ?? "");
  const nombres = g.citas.map((x) => x.paciente);
  const contacto = contactos[c.empresaId];
  const p = c.propuesta;
  const textoWa = p && `Buen día${contacto ? `, ${contacto.nombre.split(" ")[0]}` : ""}. ${servicio} le propone otra hora para ${nombres.length === 1 ? "la evaluación de" : "las evaluaciones de"} ${nombres.join(", ")}: ${textoPropuesta(p)}.${p.nota ? ` ${p.nota}.` : ""} Puede aceptarla o pedir otra aquí: ${url}/portal#propuestas`;
  const correr = (paso: () => Promise<{ ok: boolean; mensaje: string }>) => iniciar(async () => { const r = await paso(); setError(r.ok ? null : r.mensaje); });

  return (
    <li className="px-5 py-3 text-sm">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="min-w-48 flex-1">
          <div className="font-medium">
            {nombres.length === 1 ? nombres[0] : `${nombres.length} trabajadores`} <span className="font-normal text-muted-foreground">· {c.empresa}</span>
            {nombres.length > 1 && (
              <button type="button" onClick={() => setVerTodos((v) => !v)} className="ml-1 inline-flex items-center text-xs font-normal text-primary hover:underline">
                {verTodos ? "ocultar" : "ver"} <ChevronDown className={cn("size-3 transition", verTodos && "rotate-180")} />
              </button>
            )}
          </div>
          {verTodos && <div className="text-xs text-muted-foreground">{nombres.join(" · ")}</div>}
          <div className="text-xs text-muted-foreground">{[c.motivo ?? "Sin motivo", nombres.length === 1 && c.cedula, c.observacion].filter(Boolean).join(" · ")}</div>
        </div>
        {!p && (<>
          <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} aria-label="Día" className="h-8 w-36" />
          <Input type="time" value={hora} onChange={(e) => setHora(e.target.value)} aria-label="Hora" className="h-8 w-32 min-w-[7.5rem] whitespace-nowrap" />
          <Button size="sm" disabled={ocupado} onClick={() => correr(() => confirmarSolicitudes(ids, fecha, hora || null))}>
            {ocupado ? <Loader2 className="animate-spin" /> : <Check />} {cambiada ? "Reprogramar" : "Confirmar"}
          </Button>
          <Button size="sm" variant="outline" disabled={ocupado} onClick={() => setProponiendo((v) => !v)}><CalendarClock /> Proponer otra hora</Button>
        </>)}
        <Button size="sm" variant="ghost" disabled={ocupado} onClick={async () => (await confirmar({ titulo: nombres.length > 1 ? `¿Rechazar las ${nombres.length} solicitudes?` : "¿Rechazar la solicitud?", texto: "La empresa verá la cita como cancelada.", accion: "Rechazar", peligro: true })) && correr(() => rechazarSolicitudes(ids))}>
          <X /> Rechazar
        </Button>
      </div>

      {c.respuestaEmpresa === "pidio_otra" && !p && (
        <p className="mt-1.5 inline-flex rounded-full bg-aviso/20 px-2.5 py-0.5 text-xs font-medium text-aviso-texto">RR. HH. pidió otra hora: {c.hora ? hora12(c.hora) : "sin hora"} del {c.fecha.split("-").reverse().join("/")}</p>
      )}

      {p && (
        <div className="mt-2 flex flex-col gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 sm:flex-row sm:items-center">
          <span className="flex min-w-0 flex-1 gap-2"><CalendarClock className="mt-0.5 size-4 shrink-0 text-primary" /><span><b>Propuesta enviada:</b> {textoPropuesta(p)}{p.nota && <span className="text-muted-foreground"> · {p.nota}</span>} <span className="text-muted-foreground">· esperando a RR. HH.</span></span></span>
          <span className="flex flex-wrap gap-2">
          {textoWa && (
            <Button size="sm" variant="outline" asChild>
              <a href={enlaceWhatsApp(contacto?.telefono, textoWa)} target="_blank" rel="noreferrer"><MessageCircle /> WhatsApp{contacto ? ` a ${contacto.nombre.split(" ")[0]}` : ""}</a>
            </Button>
          )}
          <Button size="sm" variant="ghost" disabled={ocupado} onClick={() => correr(async () => { for (const id of ids) { const r = await anularPropuesta(id); if (!r.ok) return r; } return { ok: true, mensaje: "" }; })}>
            <Undo2 /> Anular
          </Button>
          </span>
        </div>
      )}

      {!p && choques.length > 0 && (
        <p role="status" className="mt-1.5 flex items-start gap-1.5 text-xs text-aviso-texto">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" /> <span>Ojo: {choques.join(" · ")}. Puede confirmar igual o proponer otra hora.</span>
        </p>
      )}
      {proponiendo && !p && <Proponer g={g} alEnviar={() => setProponiendo(false)} alCerrar={() => setProponiendo(false)} />}
      {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
    </li>
  );
}

export function Solicitudes({ solicitudes, contactos = {}, servicio = "El servicio médico", url = "" }: { solicitudes: Cita[]; contactos?: Record<string, Contacto>; servicio?: string; url?: string }) {
  const grupos = useMemo(() => agrupar(solicitudes), [solicitudes]);
  if (!solicitudes.length) return null;
  const esperando = grupos.filter((g) => g.citas[0].propuesta).length;
  return (
    <Card className="gap-0 border-aviso/50 py-0">
      <CardHeader className="flex flex-row flex-wrap items-center gap-2 border-b bg-aviso/10 py-3">
        <Inbox className="size-5 text-aviso-texto" />
        <CardTitle className="text-base">Solicitudes de empresas por confirmar ({solicitudes.length})</CardTitle>
        {esperando > 0 && <span className="text-xs text-muted-foreground">· {esperando} esperando respuesta de RR. HH.</span>}
      </CardHeader>
      <CardContent className="px-0">
        <ul className="divide-y">{grupos.map((g) => <Solicitud key={g.clave} g={g} contactos={contactos} servicio={servicio} url={url} />)}</ul>
      </CardContent>
    </Card>
  );
}
