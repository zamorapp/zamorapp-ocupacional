"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { CheckCircle2, Clock, FileText, Loader2, Lock, Plus, Save, Trash2 } from "lucide-react";
import { Semaforo } from "@/components/app/semaforo";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { type Accion, ETIQUETA_ESTADO_EVENTO, ETIQUETA_TIPO, type Evento, fechaHoraVE, plazoDeclaracion, plazoInformeNt02, plazoInvestigacion } from "@/lib/eventos-tipos";
import { type Cargo, diasCargados, ETIQUETA_INCAPACIDAD, type Incapacidad, TABLA_CARGOS, type Testigo } from "@/lib/covenin474";
import { type Discapacidad, ETIQUETA_DISCAPACIDAD } from "@/lib/investigacion-tipos";
import type { Item } from "@/lib/listas";
import { cn } from "@/lib/utils";
import { cerrarEvento, guardarEvento } from "../acciones";
import { horaLocalCaracas, hoyCaracas } from "@/lib/fecha";

const SELECT = "h-10 w-full rounded-md border bg-transparent px-3 text-sm";

// ISO ↔ datetime-local en hora de Venezuela (UTC-4)
const aLocal = (iso: string | null) => (iso ? horaLocalCaracas(iso) : "");
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
      {items.map((i) => <option key={i.id} value={i.nombre}>{i.codigo ? `${i.codigo} · ${i.nombre}` : i.nombre}</option>)}
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
  const investigacion = plazoInvestigacion(e, ahora);
  const cargados = diasCargados(e.incapacidad, e.cargos);
  const testigo = (i: number, c: Partial<Testigo>) => set("testigosDetalle", e.testigosDetalle.map((t, j) => (j === i ? { ...t, ...c } : t)));
  const cargo = (i: number, c: Partial<Cargo>) => set("cargos", e.cargos.map((x, j) => (j === i ? { ...x, ...c } : x)));
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

      {(declaracion || informe || (investigacion && !investigacion.cumplido)) && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {[declaracion, informe, investigacion && !investigacion.cumplido ? investigacion : null].filter(Boolean).map((p) => (
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
          {e.tipo === "accidente" && (
            <C etiqueta="Turno (Anexo D)">
              <select value={e.turno} onChange={(x) => set("turno", x.target.value as Evento["turno"])} className={SELECT}>
                <option value="">Sin definir</option>
                <option value="diurno">Diurno (5:00 a. m. a 7:00 p. m.)</option>
                <option value="nocturno">Nocturno (7:00 p. m. a 5:00 a. m.)</option>
                <option value="mixto">Mixto</option>
              </select>
            </C>
          )}
          {e.tipo === "accidente" && <C etiqueta="Actividad que realizaba al ocurrir el accidente" ancho><Input value={e.actividadMomento} onChange={(x) => set("actividadMomento", x.target.value)} /></C>}
          {e.tipo === "accidente" && <C etiqueta="Motivo por el que realizaba esa actividad" ancho><Input value={e.motivoActividad} onChange={(x) => set("motivoActividad", x.target.value)} /></C>}
          <C etiqueta="Descripción" ancho><Textarea rows={3} value={e.descripcion} onChange={(x) => set("descripcion", x.target.value)} /></C>
          {e.tipo === "accidente" && <C etiqueta="Lesiones presentadas por el trabajador" ancho><Textarea rows={2} value={e.lesiones} onChange={(x) => set("lesiones", x.target.value)} /></C>}
          {e.tipo !== "enfermedad" && (
            <div className="space-y-2 sm:col-span-2">
              <div className="flex items-center justify-between">
                <Label>Testigos (nombre, cédula y si lo vio o se enteró)</Label>
                <Button type="button" size="sm" variant="outline" onClick={() => set("testigosDetalle", [...e.testigosDetalle, { nombre: "", cedula: "", tipo: "presencial" }])}><Plus /> Testigo</Button>
              </div>
              {e.testigos && !e.testigosDetalle.length && <Input value={e.testigos} onChange={(x) => set("testigos", x.target.value)} />}
              {e.testigosDetalle.map((t, i) => (
                <div key={i} className="grid gap-2 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_10rem_auto]">
                  <Input value={t.nombre} placeholder="Nombre y apellido" className="h-9" onChange={(x) => testigo(i, { nombre: x.target.value })} />
                  <Input value={t.cedula} placeholder="Cédula" className="h-9" onChange={(x) => testigo(i, { cedula: x.target.value })} />
                  <select value={t.tipo} onChange={(x) => testigo(i, { tipo: x.target.value as Testigo["tipo"] })} className={cn(SELECT, "h-9")}>
                    <option value="presencial">Presencial</option>
                    <option value="referencial">Referencial</option>
                  </select>
                  <button type="button" className="text-muted-foreground hover:text-destructive" onClick={() => set("testigosDetalle", e.testigosDetalle.filter((_, j) => j !== i))}><Trash2 className="size-4" /></button>
                </div>
              ))}
            </div>
          )}
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
            {e.trabajadorId && (
              <div className="flex items-end">
                <Button type="button" variant="outline" asChild className="w-full"><Link href={`/accidentes/${e.id}/investigacion`}><FileText /> Informe de investigación (6 partes)</Link></Button>
              </div>
            )}
          </Seccion>
        ) : (
          <Seccion titulo="Lesión (COVENIN 474)">
            <C etiqueta="Parte del cuerpo"><Lista valor={e.parteCuerpo} items={listas.parte_cuerpo} onChange={(v) => set("parteCuerpo", v)} /></C>
            <C etiqueta="Naturaleza de la lesión"><Lista valor={e.naturalezaLesion} items={listas.naturaleza_lesion} onChange={(v) => set("naturalezaLesion", v)} /></C>
            <C etiqueta="Agente"><Lista valor={e.agente} items={listas.agente_lesion} onChange={(v) => set("agente", v)} /></C>
            <C etiqueta="Tipo de accidente"><Lista valor={e.forma} items={listas.forma_accidente} onChange={(v) => set("forma", v)} /></C>
            <C etiqueta="Gravedad">
              <select value={e.gravedad} onChange={(x) => set("gravedad", x.target.value)} className={SELECT}>
                <option value="">Sin definir</option>
                <option value="leve">Leve</option>
                <option value="moderado">Moderado</option>
                <option value="grave">Grave</option>
                <option value="mortal">Mortal</option>
              </select>
            </C>
            {e.tipo === "accidente" ? (
              <C etiqueta="Clasificación de la lesión (COVENIN 474, sección 4)">
                <select value={e.incapacidad ?? ""} onChange={(x) => set("incapacidad", (x.target.value || null) as Incapacidad | null)} className={SELECT}>
                  <option value="">Sin definir</option>
                  {(Object.keys(ETIQUETA_INCAPACIDAD) as Incapacidad[]).map((k) => <option key={k} value={k}>{ETIQUETA_INCAPACIDAD[k]}</option>)}
                </select>
              </C>
            ) : (
              <label className="flex items-center gap-2 self-end pb-2 text-sm">
                <input type="checkbox" checked={e.conTiempoPerdido} onChange={(x) => set("conTiempoPerdido", x.target.checked)} className="size-4 accent-[var(--primary)]" />
                Con tiempo perdido (incapacitante)
              </label>
            )}
            <C etiqueta="Días perdidos (reposo, sin contar el día del accidente ni el de regreso)"><Input type="number" min={0} value={e.diasPerdidos} onChange={(x) => set("diasPerdidos", Number(x.target.value))} /></C>
            {e.incapacidad === "parcial_permanente" && (
              <div className="space-y-2 sm:col-span-2">
                <div className="flex items-center justify-between">
                  <Label>Cargos por pérdida (Tabla 1) y % de pérdida de uso</Label>
                  <Button type="button" size="sm" variant="outline" onClick={() => set("cargos", [...e.cargos, { concepto: "", dias: 0, porcentaje: 100 }])}><Plus /> Cargo</Button>
                </div>
                {e.cargos.map((c, i) => (
                  <div key={i} className="grid gap-2 sm:grid-cols-[minmax(0,3fr)_7rem_auto]">
                    <select value={c.concepto} className={cn(SELECT, "h-9")} onChange={(x) => {
                      const item = TABLA_CARGOS.flatMap((g) => g.items).find((it) => it.concepto === x.target.value);
                      cargo(i, { concepto: x.target.value, dias: item?.dias ?? 0 });
                    }}>
                      <option value="">Elige la pérdida</option>
                      {TABLA_CARGOS.map((g) => (
                        <optgroup key={g.grupo} label={g.grupo}>
                          {g.items.map((it) => <option key={it.concepto} value={it.concepto}>{it.concepto} · {it.dias.toLocaleString("es-VE")} días</option>)}
                        </optgroup>
                      ))}
                    </select>
                    <div className="flex items-center gap-1"><Input type="number" min={1} max={100} value={c.porcentaje} className="h-9" onChange={(x) => cargo(i, { porcentaje: Number(x.target.value) })} /><span className="text-sm text-muted-foreground">%</span></div>
                    <button type="button" className="text-muted-foreground hover:text-destructive" onClick={() => set("cargos", e.cargos.filter((_, j) => j !== i))}><Trash2 className="size-4" /></button>
                  </div>
                ))}
              </div>
            )}
            <div className="rounded-lg bg-muted/40 px-3 py-2 text-sm sm:col-span-2">
              {cargados === null ? (
                <>Días cargados: <b>{e.diasCargados.toLocaleString("es-VE")}</b>. Elige la clasificación para calcularlos según la norma.</>
              ) : (
                <>
                  Días cargados: <b>{cargados.toLocaleString("es-VE")}</b>
                  {e.incapacidad === "parcial_permanente" && <> · para el índice de severidad cuenta el mayor entre el cargo y el reposo: <b>{Math.max(cargados, e.diasPerdidos).toLocaleString("es-VE")}</b> días (4.4)</>}
                  {cargados >= 6000 && " · tope de la norma"}
                </>
              )}
            </div>
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

        {e.tipo !== "incidente" && (
          <Seccion titulo="Certificación del INPSASEL (LOPCYMAT arts. 76 a 83)">
            <label className="flex items-center gap-2 text-sm sm:col-span-2">
              <input type="checkbox" checked={e.potencialDiscapacidad} onChange={(x) => set("potencialDiscapacidad", x.target.checked)} className="size-4 accent-[var(--primary)]" />
              Puede dejar discapacidad: hacer seguimiento hasta la certificación
            </label>
            <C etiqueta="Estado">
              <select value={e.estadoCertificacion} onChange={(x) => set("estadoCertificacion", x.target.value)} className={SELECT}>
                <option value="">Sin iniciar</option>
                <option value="en_tramite">En trámite</option>
                <option value="certificada">Certificada de origen ocupacional</option>
                <option value="no_certificada">No certificada (origen común)</option>
              </select>
            </C>
            <C etiqueta="Fecha de la certificación"><Input type="date" value={e.certificacionFecha ?? ""} onChange={(x) => set("certificacionFecha", x.target.value || null)} /></C>
            <C etiqueta="Nº de certificación"><Input value={e.certificacionNumero} onChange={(x) => set("certificacionNumero", x.target.value)} /></C>
            <C etiqueta="Discapacidad certificada">
              <select value={e.discapacidad ?? ""} onChange={(x) => set("discapacidad", (x.target.value || null) as Discapacidad | null)} className={SELECT}>
                <option value="">Sin discapacidad o pendiente</option>
                {(Object.keys(ETIQUETA_DISCAPACIDAD) as Discapacidad[]).map((k) => <option key={k} value={k}>{ETIQUETA_DISCAPACIDAD[k]}</option>)}
              </select>
            </C>
            {e.discapacidad && e.discapacidad !== "temporal" && (
              <C etiqueta="Porcentaje de pérdida de capacidad">
                <div className="flex items-center gap-1"><Input type="number" min={0} max={100} step="0.01" value={e.discapacidadPct ?? ""} onChange={(x) => set("discapacidadPct", x.target.value === "" ? null : Number(x.target.value))} /><span className="text-sm text-muted-foreground">%</span></div>
              </C>
            )}
          </Seccion>
        )}

        <Seccion titulo="Investigación">
          <C etiqueta="Causas inmediatas (actos y condiciones inseguras)" ancho><Textarea rows={2} value={e.causasInmediatas} onChange={(x) => set("causasInmediatas", x.target.value)} /></C>
          <C etiqueta="Causas básicas (factores personales y del trabajo)" ancho><Textarea rows={2} value={e.causasBasicas} onChange={(x) => set("causasBasicas", x.target.value)} /></C>
          {e.tipo !== "enfermedad" && <C etiqueta="Acto inseguro (COVENIN 474, C.5)"><Lista valor={e.actoInseguro} items={listas.acto_inseguro ?? []} onChange={(v) => set("actoInseguro", v)} /></C>}
          {e.tipo !== "enfermedad" && <C etiqueta="Condición insegura (COVENIN 474, C.6)"><Lista valor={e.condicionInsegura} items={listas.condicion_insegura ?? []} onChange={(v) => set("condicionInsegura", v)} /></C>}
          <C etiqueta="Observaciones" ancho><Textarea rows={2} value={e.observaciones} onChange={(x) => set("observaciones", x.target.value)} /></C>
        </Seccion>

        <Seccion
          titulo={`Acciones correctivas (${e.acciones.length})`}
          accion={<Button type="button" size="sm" variant="outline" onClick={() => set("acciones", [...e.acciones, { descripcion: "", responsable: "", fecha: "", estado: "pendiente" }])}><Plus /> Acción</Button>}
        >
          {e.acciones.length === 0 && <p className="text-sm text-muted-foreground sm:col-span-2">Cada acción lleva responsable y fecha límite.</p>}
          {e.acciones.map((a, i) => {
            const vencida = a.estado !== "cumplida" && a.fecha && a.fecha < hoyCaracas();
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
