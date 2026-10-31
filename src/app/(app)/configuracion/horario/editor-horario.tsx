"use client";

import { useState, useTransition } from "react";
import { CalendarOff, Copy, Loader2, Plus, Save, Trash2, X } from "lucide-react";
import { Aviso } from "@/components/app/campo";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { hora12 } from "@/lib/propuesta";
import { cn } from "@/lib/utils";
import { agregarBloqueo, guardarHorario, quitarBloqueo, type Tramo } from "./acciones";

export type Bloqueo = { id: string; fecha: string; desde: string | null; hasta: string | null; motivo: string | null };
type Resultado = { ok: boolean; mensaje: string } | null;

const DIAS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
const DIA_CORTO = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
const minutosDe = (h: string) => { const [a, b] = h.split(":").map(Number); return a * 60 + b; };
const turnos = (t: { desde: string; hasta: string }, minutos: number) => Math.max(0, Math.floor((minutosDe(t.hasta) - minutosDe(t.desde)) / minutos));
const fechaCorta = (f: string) => { const [a, m, d] = f.split("-").map(Number); return `${DIA_CORTO[new Date(Date.UTC(a, m - 1, d)).getUTCDay()]} ${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}`; };

export function EditorHorario({ tramos: iniciales, minutos: m0, cupos: c0, bloqueos, edita, hoy }: { tramos: Tramo[]; minutos: number; cupos: number; bloqueos: Bloqueo[]; edita: boolean; hoy: string }) {
  const [tramos, setTramos] = useState<Tramo[]>(iniciales);
  const [minutos, setMinutos] = useState(m0);
  const [cupos, setCupos] = useState(c0);
  const [resultado, setResultado] = useState<Resultado>(null);
  const [guardando, iniciar] = useTransition();
  const cambiado = JSON.stringify(tramos) !== JSON.stringify(iniciales) || minutos !== m0 || cupos !== c0;

  const delDia = (d: number) => tramos.map((t, i) => ({ ...t, i })).filter((t) => t.dia === d);
  const poner = (i: number, cambio: Partial<Tramo>) => setTramos((l) => l.map((t, k) => (k === i ? { ...t, ...cambio } : t)));
  const agregar = (d: number) => setTramos((l) => {
    const previo = l.filter((t) => t.dia === d).at(-1);
    return [...l, previo ? { dia: d, desde: previo.hasta < "13:00" ? "13:00" : previo.hasta, hasta: previo.hasta < "17:00" ? "17:00" : "18:00" } : { dia: d, desde: "08:00", hasta: "12:00" }];
  });
  const copiarLunes = () => setTramos((l) => {
    const lunes = l.filter((t) => t.dia === 1);
    return [...lunes, ...[2, 3, 4, 5].flatMap((d) => lunes.map((t) => ({ ...t, dia: d }))), ...l.filter((t) => t.dia >= 6)];
  });
  const guardar = () => iniciar(async () => setResultado(await guardarHorario(tramos, minutos, cupos)));
  const totalSemana = tramos.reduce((s, t) => s + turnos(t, minutos) * cupos, 0);

  return (<>
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
        <CardTitle className="text-base">Horario semanal</CardTitle>
        {edita && <Button variant="outline" size="sm" onClick={copiarLunes} disabled={!delDia(1).length}><Copy /> Copiar el lunes de martes a viernes</Button>}
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-4">
          <label className="text-sm">Cada turno dura
            <select value={minutos} onChange={(e) => setMinutos(Number(e.target.value))} disabled={!edita} className="ml-2 h-9 rounded-md border bg-background px-2">
              {[10, 15, 20, 30, 45, 60, 90, 120].map((v) => <option key={v} value={v}>{v} min</option>)}
            </select>
          </label>
          <label className="text-sm">Personas por turno
            <Input type="number" min={1} max={50} value={cupos} onChange={(e) => setCupos(Math.max(1, Math.min(50, Number(e.target.value) || 1)))} disabled={!edita} className="ml-2 inline-block h-9 w-20" />
          </label>
        </div>
        <ul className="divide-y rounded-lg border">
          {DIAS.map((nombre, k) => {
            const d = k + 1;
            const del = delDia(d);
            return (
              <li key={d} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5">
                <span className={cn("w-24 text-sm font-medium", !del.length && "text-muted-foreground")}>{nombre}</span>
                <div className="flex flex-1 flex-wrap items-center gap-2">
                  {!del.length && <span className="text-sm text-muted-foreground">No atiende</span>}
                  {del.map((t) => (
                    <span key={t.i} className="flex items-center gap-1 rounded-lg border bg-muted/30 py-0.5 pl-1.5 pr-0.5">
                      <Input type="time" value={t.desde} onChange={(e) => poner(t.i, { desde: e.target.value })} disabled={!edita} aria-label={`${nombre}: desde`} className="h-8 w-[7.5rem] border-0 bg-transparent px-1" />
                      <span className="text-muted-foreground">–</span>
                      <Input type="time" value={t.hasta} onChange={(e) => poner(t.i, { hasta: e.target.value })} disabled={!edita} aria-label={`${nombre}: hasta`} className="h-8 w-[7.5rem] border-0 bg-transparent px-1" />
                      {edita && <Button variant="ghost" size="icon" className="size-7" aria-label={`Quitar tramo del ${nombre}`} onClick={() => setTramos((l) => l.filter((_, i) => i !== t.i))}><X /></Button>}
                    </span>
                  ))}
                  {edita && <Button variant="ghost" size="sm" onClick={() => agregar(d)}><Plus /> {del.length ? "Otro tramo" : "Atiende"}</Button>}
                </div>
                {del.length > 0 && <span className="text-xs text-muted-foreground">{del.reduce((s, t) => s + turnos(t, minutos), 0)} turnos · {del.reduce((s, t) => s + turnos(t, minutos), 0) * cupos} cupos</span>}
              </li>
            );
          })}
        </ul>
        <p className="text-xs text-muted-foreground">
          {tramos.length ? `${totalSemana} cupos por semana. ` : "Sin horario, RR. HH. escribe la hora que quiera (como hasta ahora). "}
          Las citas que usted agenda en Atención médica no tienen límite; solo cuentan para el cupo.
        </p>
        {edita && (
          <div className="flex flex-wrap items-center gap-2">
            <Aviso resultado={resultado} />
            <Button className="ml-auto" onClick={guardar} disabled={guardando || !cambiado}>{guardando ? <Loader2 className="animate-spin" /> : <Save />} Guardar horario</Button>
          </div>
        )}
      </CardContent>
    </Card>
    <Bloqueos bloqueos={bloqueos} edita={edita} hoy={hoy} />
  </>);
}

function Bloqueos({ bloqueos, edita, hoy }: { bloqueos: Bloqueo[]; edita: boolean; hoy: string }) {
  const [fecha, setFecha] = useState(hoy);
  const [todo, setTodo] = useState(true);
  const [desde, setDesde] = useState("08:00");
  const [hasta, setHasta] = useState("12:00");
  const [motivo, setMotivo] = useState("");
  const [resultado, setResultado] = useState<Resultado>(null);
  const [ocupado, iniciar] = useTransition();
  const bloquear = () => iniciar(async () => {
    const r = await agregarBloqueo({ fecha, desde: todo ? null : desde, hasta: todo ? null : hasta, motivo: motivo || null });
    setResultado(r);
    if (r.ok) setMotivo("");
  });
  return (
    <Card>
      <CardHeader><CardTitle className="flex items-center gap-2 text-base"><CalendarOff className="size-5" /> Días u horas bloqueadas</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">Evaluaciones en otra empresa, charlas, diligencias o feriados. RR. HH. solo deja de ver esas horas; el motivo lo ve únicamente el servicio.</p>
        {edita && (
          <div className="flex flex-wrap items-end gap-2 rounded-lg border bg-muted/20 p-3">
            <label className="flex flex-col gap-0.5 text-xs text-muted-foreground">Día<Input type="date" min={hoy} value={fecha} onChange={(e) => setFecha(e.target.value)} className="h-9 w-40" /></label>
            <label className="flex h-9 items-center gap-2 self-end text-sm"><input type="checkbox" checked={todo} onChange={(e) => setTodo(e.target.checked)} className="size-4 accent-primary" /> Todo el día</label>
            {!todo && (<>
              <label className="flex flex-col gap-0.5 text-xs text-muted-foreground">Desde<Input type="time" value={desde} onChange={(e) => setDesde(e.target.value)} className="h-9 w-28" /></label>
              <label className="flex flex-col gap-0.5 text-xs text-muted-foreground">Hasta<Input type="time" value={hasta} onChange={(e) => setHasta(e.target.value)} className="h-9 w-28" /></label>
            </>)}
            <label className="flex min-w-48 flex-1 flex-col gap-0.5 text-xs text-muted-foreground">Motivo (solo lo ve el servicio)<Input value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={200} placeholder="Evaluaciones en otra empresa" className="h-9" /></label>
            <Button onClick={bloquear} disabled={ocupado}>{ocupado ? <Loader2 className="animate-spin" /> : <CalendarOff />} Bloquear</Button>
          </div>
        )}
        <Aviso resultado={resultado} />
        {bloqueos.length === 0 ? <p className="text-sm text-muted-foreground">No hay bloqueos próximos.</p> : (
          <ul className="divide-y rounded-lg border">
            {bloqueos.map((b) => <FilaBloqueo key={b.id} b={b} edita={edita} />)}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function FilaBloqueo({ b, edita }: { b: Bloqueo; edita: boolean }) {
  const [ocupado, iniciar] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <li className="flex flex-wrap items-center gap-3 px-3 py-2 text-sm">
      <span className="w-24 font-medium">{fechaCorta(b.fecha)}</span>
      <span className="w-44 text-muted-foreground">{b.desde && b.hasta ? `${hora12(b.desde)} – ${hora12(b.hasta)}` : "Todo el día"}</span>
      <span className="min-w-0 flex-1 truncate">{b.motivo ?? <span className="text-muted-foreground">Sin motivo</span>}</span>
      {error && <span className="text-xs text-destructive">{error}</span>}
      {edita && <Button variant="ghost" size="sm" disabled={ocupado} onClick={() => iniciar(async () => { const r = await quitarBloqueo(b.id); setError(r.ok ? null : r.mensaje); })}>{ocupado ? <Loader2 className="animate-spin" /> : <Trash2 />} Quitar</Button>}
    </li>
  );
}
