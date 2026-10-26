"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { CheckCircle2, Clock, Loader2, Lock, Plus, Save, Trash2 } from "lucide-react";
import { Semaforo } from "@/components/app/semaforo";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { type Accion, ETIQUETA_ESTADO_EVENTO, ETIQUETA_TIPO, type Evento, fechaHoraVE, plazoDeclaracion, plazoInformeNt02 } from "@/lib/eventos-tipos";
import type { Item } from "@/lib/listas";
import { cn } from "@/lib/utils";
import { cerrarEvento, guardarEvento } from "../acciones";

const SELECT = "h-10 w-full rounded-md border bg-transparent px-3 text-sm";

// ISO ↔ datetime-local en hora de Venezuela (UTC-4)
const aLocal = (iso: string | null) => (iso ? new Date(new Date(iso).getTime() - 4 * 3600e3).toISOString().slice(0, 16) : "");
const deLocal = (v: string) => (v ? new Date(`${v}:00-04:00`).toISOString() : null);

function Seccion({ titulo, children, accion }: { titulo: string; children: React.ReactNode; accion?: React.ReactNode }) {
  return (
    <Card className="gap-4">
      <CardHeader className="flex flex-row items-center justify-between"><CardTitle className="text-base">{titulo}</CardTitle>{accion}</CardHeader>
      <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">{children}</CardContent>
    </Card>
  );
}

function C({ etiqueta, children, ancho }: { etiqueta: string; children: React.ReactNode; ancho?: boolean }) {
  return <div className={ancho ? "sm:col-span-2" : ""}><Label className="mb-1.5">{etiqueta}</Label>{children}</div>;
}

function Lista({ valor, items, onChange }: { valor: string; items: Item[]; onChange: (v: string) => void }) {
  return (
    <select value={valor} onChange={(e) => onChange(e.target.value)} className={SELECT}>
      <option value="">Sin definir</option>
      {items.map((i) => <option key={i.id} value={i.nombre}>{i.nombre}</option>)}
      {valor && !items.some((i) => i.nombre === valor) && <option value={valor}>{valor}</option>}
    </select>
  );
}

export function EditorEvento({ inicial, listas }: { inicial: Evento; listas: Record<string, Item[]> }) {
  const [e, setE] = useState(inicial);
  const [guardado, setGuardado] = useState(JSON.stringify(inicial));
  const [aviso, setAviso] = useState<{ ok: boolean; mensaje: string } | null>(null);
  const [ocupado, iniciar] = useTransition();
  const [ahora, setAhora] = useState(() => new Date());
  const set = <K extends keyof Evento>(k: K, v: Evento[K]) => setE((x) => ({ ...x, [k]: v }));
  const cambios = JSON.stringify(e) !== guardado;
  const cerrado = e.estado === "cerrado";

  // El cronómetro se actualiza cada minuto
  useEffect(() => {
    const t = setInterval(() => setAhora(new Date()), 60e3);
    return () => clearInterval(t);
  }, []);

  const declaracion = plazoDeclaracion(e, ahora);
  const informe = plazoInformeNt02(e, ahora);
  const accion = (i: number, c: Partial<Accion>) => set("acciones", e.acciones.map((a, j) => (j === i ? { ...a, ...c } : a)));

  const guardar = () =>
    iniciar(async () => {
      const r = await guardarEvento(e);
      setAviso(r);
      if (r.ok) setGuardado(JSON.stringify(e));
    });

  return (
    <div className="space-y-4">
      <div className="sticky top-16 z-10 -mx-4 border-b bg-background/90 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <div className="min-w-0 flex-1">
            <div className="text-lg font-semibold">#{e.numero} · {ETIQUETA_TIPO[e.tipo]}{e.subtipo === "in_itinere" && " (in itinere)"}</div>
            <p className="truncate text-sm text-muted-foreground">
              {e.trabajadorId ? <Link href={`/pacientes/${e.trabajadorId}`} className="hover:text-primary">{e.trabajador}</Link> : "Sin lesionado"} · {e.empresa} · {fechaHoraVE(e.fechaHora)} · {ETIQUETA_ESTADO_EVENTO[e.estado]}
            </p>
          </div>
          {cerrado ? (
            <Button variant="outline" disabled={ocupado} onClick={() => iniciar(async () => { const r = await cerrarEvento(e.id, false); setAviso(r); if (r.ok) set("estado", "investigando"); })}><Lock /> Reabrir</Button>
          ) : (
            <div className="flex gap-2">
              <Button variant="outline" onClick={guardar} disabled={ocupado || !cambios}>{ocupado ? <Loader2 className="animate-spin" /> : <Save />} {cambios ? "Guardar" : "Guardado"}</Button>
              <Button disabled={ocupado || cambios} title={cambios ? "Guarda primero" : undefined} onClick={() => iniciar(async () => { const r = await cerrarEvento(e.id, true); setAviso(r); if (r.ok) { set("estado", "cerrado"); setGuardado(JSON.stringify({ ...e, estado: "cerrado" })); } })}><CheckCircle2 /> Cerrar caso</Button>
            </div>
          )}
        </div>
        {aviso?.mensaje && <p className={cn("mt-2 text-sm", aviso.ok ? "text-ok-texto" : "text-destructive")}>{aviso.mensaje}</p>}
      </div>

      {(declaracion || informe) && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {[declaracion, informe].filter(Boolean).map((p) => (
            <div key={p!.texto} className={cn("flex items-center gap-3 rounded-xl border-2 px-4 py-3", p!.estado === "alerta" ? "border-alerta/50 bg-alerta/10" : p!.estado === "aviso" ? "border-aviso/60 bg-aviso/10" : "border-ok/40 bg-ok/10")}>
              {p!.cumplido ? <CheckCircle2 className="size-6 text-ok-texto" /> : <Clock className={cn("size-6", p!.estado === "alerta" ? "text-alerta-texto" : "text-aviso-texto")} />}
              <div>
                <div className="font-semibold">{p!.texto}</div>
                {p!.vence && <div className="text-xs text-muted-foreground">Límite: {fechaHoraVE(p!.vence.toISOString())}</div>}
              </div>
            </div>
          ))}
        </div>
      )}

      <fieldset disabled={cerrado} className="contents">
        <Seccion titulo={e.tipo === "enfermedad" ? "Caso" : "Hechos"}>
          <C etiqueta={e.tipo === "enfermedad" ? "Fecha del primer reporte" : "Fecha y hora"}>
            <Input type="datetime-local" value={aLocal(e.fechaHora)} onChange={(x) => set("fechaHora", deLocal(x.target.value) ?? e.fechaHora)} />
          </C>
          {e.tipo === "accidente" ? (
            <C etiqueta="Tipo">
              <select value={e.subtipo ?? "trabajo"} onChange={(x) => set("subtipo", x.target.value)} className={SELECT}>
                <option value="trabajo">En el trabajo</option>
                <option value="in_itinere">In itinere (trayecto)</option>
              </select>
            </C>
          ) : <C etiqueta="Lugar"><Input value={e.lugar} onChange={(x) => set("lugar", x.target.value)} /></C>}
          {e.tipo === "accidente" && <C etiqueta="Lugar"><Input value={e.lugar} onChange={(x) => set("lugar", x.target.value)} /></C>}
          {e.tipo !== "enfermedad" && <C etiqueta="Testigos"><Input value={e.testigos} onChange={(x) => set("testigos", x.target.value)} /></C>}
          <C etiqueta="Descripción" ancho><Textarea rows={3} value={e.descripcion} onChange={(x) => set("descripcion", x.target.value)} /></C>
        </Seccion>

        {e.tipo === "enfermedad" ? (
          <Seccion titulo="Diagnóstico (NT-02-2008)">
            <C etiqueta="CIE-10"><Input value={e.cie10} className="font-mono uppercase" onChange={(x) => set("cie10", x.target.value)} /></C>
            <C etiqueta="Fecha y hora del diagnóstico"><Input type="datetime-local" value={aLocal(e.fechaDiagnostico)} onChange={(x) => set("fechaDiagnostico", deLocal(x.target.value))} /></C>
            <C etiqueta="Diagnóstico" ancho><Input value={e.diagnostico} onChange={(x) => set("diagnostico", x.target.value)} /></C>
            <label className="flex items-center gap-2 text-sm sm:col-span-2">
              <input type="checkbox" checked={e.enAnexo1} onChange={(x) => set("enAnexo1", x.target.checked)} className="size-4 accent-[var(--primary)]" />
              Está en la lista de enfermedades ocupacionales (Anexo 1): informe en 15 días. Si no, 30 días.
            </label>
            <C etiqueta="Entrega del informe de investigación"><Input type="date" value={e.fechaInformeNt02 ?? ""} onChange={(x) => set("fechaInformeNt02", x.target.value || null)} /></C>
            <C etiqueta="Estado de la certificación ante el INPSASEL">
              <select value={e.estadoCertificacion} onChange={(x) => set("estadoCertificacion", x.target.value)} className={SELECT}>
                <option value="">Sin iniciar</option>
                <option value="en_tramite">En trámite</option>
                <option value="certificada">Certificada</option>
                <option value="no_certificada">No certificada</option>
              </select>
            </C>
          </Seccion>
        ) : (
          <Seccion titulo="Lesión (COVENIN 474)">
            <C etiqueta="Parte del cuerpo"><Lista valor={e.parteCuerpo} items={listas.parte_cuerpo} onChange={(v) => set("parteCuerpo", v)} /></C>
            <C etiqueta="Naturaleza de la lesión"><Lista valor={e.naturalezaLesion} items={listas.naturaleza_lesion} onChange={(v) => set("naturalezaLesion", v)} /></C>
            <C etiqueta="Agente"><Lista valor={e.agente} items={listas.agente_lesion} onChange={(v) => set("agente", v)} /></C>
            <C etiqueta="Forma del accidente"><Lista valor={e.forma} items={listas.forma_accidente} onChange={(v) => set("forma", v)} /></C>
            <C etiqueta="Gravedad">
              <select value={e.gravedad} onChange={(x) => set("gravedad", x.target.value)} className={SELECT}>
                <option value="">Sin definir</option>
                <option value="leve">Leve</option>
                <option value="moderado">Moderado</option>
                <option value="grave">Grave</option>
                <option value="mortal">Mortal</option>
              </select>
            </C>
            <label className="flex items-center gap-2 self-end pb-2 text-sm">
              <input type="checkbox" checked={e.conTiempoPerdido} onChange={(x) => set("conTiempoPerdido", x.target.checked)} className="size-4 accent-[var(--primary)]" />
              Con tiempo perdido (incapacitante)
            </label>
            <C etiqueta="Días perdidos"><Input type="number" min={0} value={e.diasPerdidos} onChange={(x) => set("diasPerdidos", Number(x.target.value))} /></C>
            <C etiqueta="Días cargados (COVENIN 474: 6.000 por muerte o incapacidad absoluta)"><Input type="number" min={0} value={e.diasCargados} onChange={(x) => set("diasCargados", Number(x.target.value))} /></C>
          </Seccion>
        )}

        {e.tipo !== "incidente" && (
          <Seccion titulo="Declaración ante el INPSASEL (LOPCYMAT art. 73)">
            <C etiqueta="Aviso inmediato (INPSASEL, Comité y delegados)">
              <div className="flex gap-2">
                <Input type="datetime-local" value={aLocal(e.fechaAviso)} onChange={(x) => set("fechaAviso", deLocal(x.target.value))} />
                <Button type="button" variant="outline" onClick={() => set("fechaAviso", new Date().toISOString())}>Ahora</Button>
              </div>
            </C>
            <C etiqueta="Declaración formal">
              <div className="flex gap-2">
                <Input type="datetime-local" value={aLocal(e.fechaDeclaracion)} onChange={(x) => set("fechaDeclaracion", deLocal(x.target.value))} />
                <Button type="button" variant="outline" onClick={() => set("fechaDeclaracion", new Date().toISOString())}>Ahora</Button>
              </div>
            </C>
            <C etiqueta="Nº de declaración INPSASEL"><Input value={e.numeroDeclaracion} onChange={(x) => set("numeroDeclaracion", x.target.value)} /></C>
          </Seccion>
        )}

        <Seccion titulo="Investigación">
          <C etiqueta="Causas inmediatas (actos y condiciones inseguras)" ancho><Textarea rows={2} value={e.causasInmediatas} onChange={(x) => set("causasInmediatas", x.target.value)} /></C>
          <C etiqueta="Causas básicas (factores personales y del trabajo)" ancho><Textarea rows={2} value={e.causasBasicas} onChange={(x) => set("causasBasicas", x.target.value)} /></C>
        </Seccion>

        <Seccion
          titulo={`Acciones correctivas (${e.acciones.length})`}
          accion={<Button type="button" size="sm" variant="outline" onClick={() => set("acciones", [...e.acciones, { descripcion: "", responsable: "", fecha: "", estado: "pendiente" }])}><Plus /> Acción</Button>}
        >
          {e.acciones.length === 0 && <p className="text-sm text-muted-foreground sm:col-span-2">Cada acción lleva responsable y fecha límite.</p>}
          {e.acciones.map((a, i) => {
            const vencida = a.estado !== "cumplida" && a.fecha && a.fecha < new Date().toISOString().slice(0, 10);
            return (
              <div key={i} className="grid gap-2 rounded-lg border p-3 sm:col-span-2 sm:grid-cols-[minmax(0,3fr)_minmax(0,1.5fr)_9rem_8rem_auto]">
                <Input value={a.descripcion} placeholder="Acción" className="h-9" onChange={(x) => accion(i, { descripcion: x.target.value })} />
                <Input value={a.responsable} placeholder="Responsable" className="h-9" onChange={(x) => accion(i, { responsable: x.target.value })} />
                <Input type="date" value={a.fecha} className={cn("h-9", vencida && "border-alerta text-alerta-texto")} onChange={(x) => accion(i, { fecha: x.target.value })} />
                <select value={a.estado} onChange={(x) => accion(i, { estado: x.target.value as Accion["estado"] })} className={cn(SELECT, "h-9")}>
                  <option value="pendiente">Pendiente</option>
                  <option value="en_proceso">En proceso</option>
                  <option value="cumplida">Cumplida</option>
                </select>
                <button type="button" className="text-muted-foreground hover:text-destructive" onClick={() => set("acciones", e.acciones.filter((_, j) => j !== i))}><Trash2 className="size-4" /></button>
                {vencida && <span className="flex items-center gap-1 text-xs text-alerta-texto sm:col-span-5"><Semaforo estado="alerta" /> Fecha límite vencida</span>}
              </div>
            );
          })}
        </Seccion>
      </fieldset>
    </div>
  );
}
