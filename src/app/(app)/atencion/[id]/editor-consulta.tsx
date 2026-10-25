"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, Loader2, Lock, Plus, RotateCcw, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  clasificarImc,
  type DatosConsulta,
  type Diagnostico,
  ETIQUETA_ESTADO_CONSULTA,
  ETIQUETA_ORIGEN,
  type FilaExamen,
  imc,
  type Medicamento,
  type Origen,
  taAlterada,
} from "@/lib/consultas-tipos";
import type { Item } from "@/lib/listas";
import { ESTILO_APTITUD, GRUPOS_RIESGO, type Aptitud } from "@/lib/pacientes";
import { cn } from "@/lib/utils";
import { guardarConsulta, reabrirConsulta } from "../acciones";
import { BuscadorDiagnostico } from "./buscador-diagnostico";
import { TextosFrecuentes } from "./textos-frecuentes";

type Props = {
  inicial: DatosConsulta;
  trabajador: { id: string; nombre: string; cedula: string; edad: number | null; sexo: string | null; empresa: string; cargo: string; riesgos: Record<string, string[]> };
  medico: string | null;
  listas: Record<string, Item[]>;
};

const SELECT = "h-10 w-full rounded-md border bg-transparent px-3 text-sm disabled:opacity-60";
const APTITUDES: Aptitud[] = ["elegible", "elegible_con_restricciones", "no_elegible", "espera_resultados", "diferido"];

function Seccion({ titulo, children, accion }: { titulo: string; children: React.ReactNode; accion?: React.ReactNode }) {
  return (
    <Card className="gap-4">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">{titulo}</CardTitle>
        {accion}
      </CardHeader>
      <CardContent className="space-y-4">{children}</CardContent>
    </Card>
  );
}

function Texto({ etiqueta, valor, onChange, filas = 3, placeholder }: { etiqueta: string; valor: string; onChange: (v: string) => void; filas?: number; placeholder?: string }) {
  return (
    <div>
      <Label className="mb-1.5">{etiqueta}</Label>
      <Textarea value={valor} onChange={(e) => onChange(e.target.value)} rows={filas} placeholder={placeholder} />
    </div>
  );
}

function TablaExamen({ filas, onChange, bloqueado }: { filas: FilaExamen[]; onChange: (f: FilaExamen[]) => void; bloqueado: boolean }) {
  if (!filas.length) return <p className="text-sm text-muted-foreground">Sin plantilla. Agrégala en Configuración › Listas.</p>;
  return (
    <div className="divide-y rounded-lg border">
      {filas.map((f, i) => {
        const alterado = f.valor.trim() !== f.normal.trim();
        return (
          <div key={f.clave} className={cn("grid grid-cols-[10rem_minmax(0,1fr)_auto] items-center gap-3 px-3 py-1.5", alterado && "bg-aviso/10")}>
            <span className="text-sm">{f.nombre}</span>
            <input
              value={f.valor}
              disabled={bloqueado}
              onChange={(e) => onChange(filas.map((x, j) => (j === i ? { ...x, valor: e.target.value } : x)))}
              className={cn("h-8 w-full rounded border-0 bg-transparent px-2 text-sm outline-none focus:bg-card focus:ring-1 focus:ring-primary", alterado && "font-medium")}
            />
            {alterado ? (
              <button type="button" disabled={bloqueado} title="Volver a normal" className="text-muted-foreground hover:text-foreground" onClick={() => onChange(filas.map((x, j) => (j === i ? { ...x, valor: x.normal } : x)))}>
                <RotateCcw className="size-3.5" />
              </button>
            ) : <span className="size-3.5" />}
          </div>
        );
      })}
    </div>
  );
}

export function EditorConsulta({ inicial, trabajador, medico, listas }: Props) {
  const [d, setD] = useState<DatosConsulta>(inicial);
  const [guardado, setGuardado] = useState(JSON.stringify(inicial));
  const [aviso, setAviso] = useState<{ ok: boolean; mensaje: string } | null>(null);
  const [guardando, iniciar] = useTransition();
  const [verTodo, setVerTodo] = useState(false);

  const bloqueado = d.estado !== "borrador";
  const cambios = JSON.stringify(d) !== guardado;
  const set = <K extends keyof DatosConsulta>(k: K, v: DatosConsulta[K]) => setD((x) => ({ ...x, [k]: v }));

  const motivo = listas.motivo_consulta.find((m) => m.id === d.motivoId);
  const preventivo = motivo?.grupo === "preventivo";
  const mostrarTratamiento = !preventivo || verTodo || d.tratamiento.length > 0 || d.reposo.activo;
  const etiquetaAptitud = (a: Aptitud) => listas.clasificacion_aptitud.find((i) => i.codigo === a)?.nombre ?? a;

  const valorImc = imc(d.signos.peso, d.signos.talla);
  const claseImc = clasificarImc(valorImc);

  const guardar = useCallback(
    (cerrar: boolean) =>
      iniciar(async () => {
        const r = await guardarConsulta(d, cerrar);
        setAviso(r);
        if (r.ok) {
          const nuevo = cerrar ? { ...d, estado: "cerrada" as const } : d;
          setD(nuevo);
          setGuardado(JSON.stringify(nuevo));
        }
      }),
    [d],
  );

  // Ctrl+S guarda; avisa antes de salir con cambios sin guardar
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (!bloqueado) guardar(false);
      }
    };
    const salir = (e: BeforeUnloadEvent) => {
      if (cambios) e.preventDefault();
    };
    window.addEventListener("keydown", tecla);
    window.addEventListener("beforeunload", salir);
    return () => {
      window.removeEventListener("keydown", tecla);
      window.removeEventListener("beforeunload", salir);
    };
  }, [guardar, bloqueado, cambios]);

  const gruposParaclinicos = useMemo(() => {
    const g = new Map<string, Item[]>();
    for (const p of listas.paraclinico) g.set(p.grupo ?? "Otros", [...(g.get(p.grupo ?? "Otros") ?? []), p]);
    return [...g.entries()];
  }, [listas.paraclinico]);

  const actualizarDiag = (i: number, cambio: Partial<Diagnostico>) =>
    set("diagnosticos", d.diagnosticos.map((x, j) => (j === i ? { ...x, ...cambio } : x)));
  const actualizarMed = (i: number, cambio: Partial<Medicamento>) =>
    set("tratamiento", d.tratamiento.map((x, j) => (j === i ? { ...x, ...cambio } : x)));

  return (
    <div className="space-y-4">
      {/* Cabecera fija con el paciente y las acciones */}
      <div className="sticky top-16 z-10 -mx-4 border-b bg-background/90 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <div className="min-w-0 flex-1">
            <Link href={`/pacientes/${trabajador.id}`} className="text-lg font-semibold hover:text-primary">{trabajador.nombre}</Link>
            <p className="truncate text-sm text-muted-foreground">
              {trabajador.cedula}{trabajador.edad !== null && ` · ${trabajador.edad} años`}{trabajador.sexo && ` · ${trabajador.sexo}`} · {[trabajador.cargo, trabajador.empresa].filter(Boolean).join(" · ")}
            </p>
          </div>
          <div className="text-right text-xs text-muted-foreground">
            <div>{ETIQUETA_ESTADO_CONSULTA[d.estado]} · {d.fecha.split("-").reverse().join("/")}</div>
            {medico && <div>{medico}</div>}
          </div>
          {bloqueado ? (
            <Button variant="outline" onClick={() => iniciar(async () => { const r = await reabrirConsulta(d.id); setAviso(r); if (r.ok) setD({ ...d, estado: "borrador" }); })} disabled={d.estado === "firmada" || guardando}>
              <Lock /> Reabrir
            </Button>
          ) : (
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => guardar(false)} disabled={guardando || !cambios}>
                {guardando ? <Loader2 className="animate-spin" /> : <Save />} {cambios ? "Guardar" : "Guardado"}
              </Button>
              <Button onClick={() => guardar(true)} disabled={guardando}><CheckCircle2 /> Cerrar consulta</Button>
            </div>
          )}
        </div>
        {aviso?.mensaje && (
          <p className={cn("mt-2 text-sm", aviso.ok ? "text-ok" : "text-destructive")}>{aviso.mensaje}</p>
        )}
      </div>

      <fieldset disabled={bloqueado} className="contents">
        <Tabs defaultValue="generales">
          <TabsList className="h-auto flex-wrap">
            <TabsTrigger value="generales">Generales</TabsTrigger>
            <TabsTrigger value="antecedentes">Antecedentes</TabsTrigger>
            <TabsTrigger value="examen">Examen</TabsTrigger>
            <TabsTrigger value="paraclinicos">Paraclínicos{d.paraclinicos.length > 0 && ` (${d.paraclinicos.length})`}</TabsTrigger>
            <TabsTrigger value="diagnostico">Diagnóstico{d.sano ? " · sano" : d.diagnosticos.length > 0 && ` (${d.diagnosticos.length})`}</TabsTrigger>
            <TabsTrigger value="aptitud">Aptitud</TabsTrigger>
            {mostrarTratamiento && <TabsTrigger value="tratamiento">Tratamiento y reposo</TabsTrigger>}
            <TabsTrigger value="conclusiones">Conclusiones</TabsTrigger>
          </TabsList>

          {/* ── Generales ── */}
          <TabsContent value="generales" className="mt-4 space-y-4">
            <Seccion titulo="Motivo">
              <div className="grid gap-4 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
                <div>
                  <Label className="mb-1.5">Motivo de consulta *</Label>
                  <select value={d.motivoId ?? ""} onChange={(e) => set("motivoId", e.target.value || null)} className={SELECT}>
                    <option value="">Elige el motivo</option>
                    {["preventivo", "no_preventivo", null].map((g) => {
                      const items = listas.motivo_consulta.filter((m) => (m.grupo ?? null) === g || (g === null && m.grupo && !["preventivo", "no_preventivo"].includes(m.grupo)));
                      if (!items.length) return null;
                      return (
                        <optgroup key={g ?? "otros"} label={g === "preventivo" ? "Preventivos" : g === "no_preventivo" ? "No preventivos" : "Otros"}>
                          {items.map((m) => <option key={m.id} value={m.id}>{m.nombre}</option>)}
                        </optgroup>
                      );
                    })}
                  </select>
                </div>
                <div>
                  <Label className="mb-1.5">Tipo</Label>
                  <select value={d.tipo} onChange={(e) => set("tipo", e.target.value as DatosConsulta["tipo"])} className={SELECT}>
                    <option value="primera">Primera</option>
                    <option value="sucesiva">Sucesiva</option>
                    <option value="derivada">Derivada</option>
                  </select>
                </div>
              </div>
              {preventivo ? (
                <p className="rounded-md bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
                  Evaluación de <b className="text-foreground">{motivo?.nombre}</b>: el motivo ya queda registrado y no requiere detalle.
                </p>
              ) : (
                <Texto etiqueta="Motivo (detalle)" valor={d.motivoTexto} onChange={(v) => set("motivoTexto", v)} filas={2} />
              )}
              {!preventivo && <Texto etiqueta="Enfermedad actual" valor={d.enfermedadActual} onChange={(v) => set("enfermedadActual", v)} filas={4} />}
            </Seccion>

            <Seccion titulo="Riesgos del puesto">
              <div className="grid gap-2 sm:grid-cols-2">
                {GRUPOS_RIESGO.map(([k, n]) => (
                  <div key={k} className="flex flex-wrap items-baseline gap-2 text-sm">
                    <span className="w-28 text-muted-foreground">{n}</span>
                    {(trabajador.riesgos[k] ?? []).length
                      ? trabajador.riesgos[k].map((r) => <span key={r} className="rounded bg-muted px-2 py-0.5">{r}</span>)
                      : <span className="text-muted-foreground/60">—</span>}
                  </div>
                ))}
              </div>
            </Seccion>
          </TabsContent>

          {/* ── Antecedentes y hábitos ── */}
          <TabsContent value="antecedentes" className="mt-4 grid gap-4 lg:grid-cols-2">
            <Seccion titulo="Antecedentes médicos">
              <div className="space-y-2">
                {listas.antecedente_medico.map((a) => {
                  const marcado = d.antecedentes.find((x) => x.id === a.id);
                  return (
                    <div key={a.id} className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-3">
                      <label className="flex w-56 items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={Boolean(marcado)}
                          onChange={(e) =>
                            set("antecedentes", e.target.checked
                              ? [...d.antecedentes, { id: a.id, nombre: a.nombre, grupo: a.grupo, observacion: "" }]
                              : d.antecedentes.filter((x) => x.id !== a.id))
                          }
                          className="size-4 accent-[var(--primary)]"
                        />
                        {a.nombre}
                      </label>
                      {marcado && (
                        <Input
                          value={marcado.observacion}
                          placeholder="Observación"
                          className="h-8"
                          onChange={(e) => set("antecedentes", d.antecedentes.map((x) => (x.id === a.id ? { ...x, observacion: e.target.value } : x)))}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </Seccion>
            <Seccion titulo="Hábitos">
              <div className="space-y-2">
                {d.habitos.map((h, i) => (
                  <div key={h.clave} className="grid grid-cols-[9rem_minmax(0,1fr)] items-center gap-3">
                    <span className="text-sm">{h.nombre}</span>
                    <Input value={h.valor} className="h-8" placeholder="Niega" onChange={(e) => set("habitos", d.habitos.map((x, j) => (j === i ? { ...x, valor: e.target.value } : x)))} />
                  </div>
                ))}
              </div>
            </Seccion>
          </TabsContent>

          {/* ── Examen ── */}
          <TabsContent value="examen" className="mt-4 space-y-4">
            <Seccion titulo="Signos vitales y antropometría">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
                {([
                  ["ta", "TA (mmHg)", "120/80"], ["fc", "FC (lpm)", ""], ["fr", "FR (rpm)", ""], ["temp", "Temp (°C)", ""],
                  ["sat", "SatO₂ (%)", ""], ["peso", "Peso (kg)", ""], ["talla", "Talla (cm)", ""],
                ] as const).map(([k, n, ph]) => (
                  <div key={k}>
                    <Label className="mb-1.5 text-xs">{n}</Label>
                    <Input
                      value={d.signos[k] ?? ""}
                      placeholder={ph}
                      inputMode={k === "ta" ? "text" : "decimal"}
                      onChange={(e) => set("signos", { ...d.signos, [k]: e.target.value })}
                      className={cn("h-9", k === "ta" && taAlterada(d.signos.ta) && "border-alerta text-alerta")}
                    />
                  </div>
                ))}
                <div>
                  <Label className="mb-1.5 text-xs">IMC</Label>
                  <div className={cn("flex h-9 items-center rounded-md border bg-muted/40 px-3 text-sm font-medium", claseImc?.alerta && "border-aviso text-amber-700")}>
                    {valorImc ?? "—"}
                  </div>
                  {claseImc && <p className={cn("mt-1 text-xs", claseImc.alerta ? "text-amber-700" : "text-muted-foreground")}>{claseImc.texto}</p>}
                </div>
              </div>
              {taAlterada(d.signos.ta) && (
                <p className="flex items-center gap-2 text-sm text-alerta"><AlertTriangle className="size-4" /> Tensión arterial elevada.</p>
              )}
            </Seccion>
            <div className="grid gap-4 lg:grid-cols-2">
              <Seccion titulo="Examen funcional">
                <TablaExamen filas={d.examenFuncional} onChange={(f) => set("examenFuncional", f)} bloqueado={bloqueado} />
              </Seccion>
              <Seccion titulo="Examen físico">
                <TablaExamen filas={d.examenFisico} onChange={(f) => set("examenFisico", f)} bloqueado={bloqueado} />
              </Seccion>
            </div>
            <p className="text-xs text-muted-foreground">Precargado en normal: solo escribe lo que esté alterado. Las filas cambiadas se resaltan.</p>
          </TabsContent>

          {/* ── Paraclínicos ── */}
          <TabsContent value="paraclinicos" className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <Seccion titulo="Catálogo">
              <div className="space-y-4">
                {gruposParaclinicos.map(([grupo, items]) => {
                  const todos = items.every((p) => d.paraclinicos.some((x) => x.id === p.id));
                  return (
                    <div key={grupo}>
                      <div className="mb-1.5 flex items-center justify-between">
                        <span className="text-sm font-medium">{grupo}</span>
                        <button
                          type="button"
                          className="text-xs text-primary hover:underline"
                          onClick={() =>
                            set("paraclinicos", todos
                              ? d.paraclinicos.filter((x) => !items.some((p) => p.id === x.id))
                              : [...d.paraclinicos, ...items.filter((p) => !d.paraclinicos.some((x) => x.id === p.id)).map((p) => ({ id: p.id, nombre: p.nombre, grupo: p.grupo, resultado: "" }))])
                          }
                        >
                          {todos ? "Quitar perfil" : "Agregar perfil"}
                        </button>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {items.map((p) => {
                          const activo = d.paraclinicos.some((x) => x.id === p.id);
                          return (
                            <button
                              key={p.id}
                              type="button"
                              onClick={() => set("paraclinicos", activo ? d.paraclinicos.filter((x) => x.id !== p.id) : [...d.paraclinicos, { id: p.id, nombre: p.nombre, grupo: p.grupo, resultado: "" }])}
                              className={cn("rounded-full border px-3 py-1 text-xs transition", activo ? "border-primary bg-primary text-primary-foreground" : "hover:border-primary/50")}
                            >
                              {p.nombre}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </Seccion>
            <Seccion titulo={`Solicitados (${d.paraclinicos.length})`}>
              {d.paraclinicos.length === 0 && <p className="text-sm text-muted-foreground">Elige exámenes del catálogo.</p>}
              <div className="space-y-2">
                {d.paraclinicos.map((p, i) => (
                  <div key={p.id} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] items-center gap-2">
                    <span className="truncate text-sm">{p.nombre}</span>
                    <Input value={p.resultado} placeholder="Resultado" className="h-8" onChange={(e) => set("paraclinicos", d.paraclinicos.map((x, j) => (j === i ? { ...x, resultado: e.target.value } : x)))} />
                    <button type="button" className="text-muted-foreground hover:text-destructive" onClick={() => set("paraclinicos", d.paraclinicos.filter((_, j) => j !== i))}><Trash2 className="size-4" /></button>
                  </div>
                ))}
              </div>
            </Seccion>
          </TabsContent>

          {/* ── Diagnóstico ── */}
          <TabsContent value="diagnostico" className="mt-4 space-y-4">
            <Card className={cn("gap-0 py-4", d.sano && "border-ok/50 bg-ok/5")}>
              <CardContent className="px-6">
                <label className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={d.sano}
                    onChange={(e) => {
                      const sano = e.target.checked;
                      if (sano && d.diagnosticos.some((x) => x.descripcion.trim()) && !confirm("Se quitarán los diagnósticos escritos. ¿Continuar?")) return;
                      setD((x) => ({
                        ...x,
                        sano,
                        diagnosticos: sano ? [] : x.diagnosticos,
                        aptitud: sano && !x.aptitud.clasificacion ? { ...x.aptitud, clasificacion: "elegible" } : x.aptitud,
                      }));
                    }}
                    className="mt-0.5 size-5 accent-[var(--primary)]"
                  />
                  <span>
                    <span className="font-medium">Trabajador sano</span>
                    <span className="block text-sm text-muted-foreground">
                      De acuerdo con los protocolos de evaluación clínica ocupacional, no presenta patología al momento de la evaluación.
                    </span>
                  </span>
                </label>
              </CardContent>
            </Card>
            {!d.sano && (
            <Seccion
              titulo="Diagnósticos (CIE-10)"
              accion={<Button type="button" size="sm" variant="outline" onClick={() => set("diagnosticos", [...d.diagnosticos, { cie10: "", descripcion: "", sistema: "", origen: "comun", principal: d.diagnosticos.length === 0 }])}><Plus /> Agregar</Button>}
            >
              {d.diagnosticos.length === 0 && <p className="text-sm text-muted-foreground">Sin diagnósticos. Pulsa Agregar y escribe parte del nombre o del código.</p>}
              {d.diagnosticos.map((x, i) => (
                <div key={i} className="grid gap-2 rounded-lg border p-3 sm:grid-cols-[minmax(0,3fr)_minmax(0,1fr)_minmax(0,1fr)_auto]">
                  <BuscadorDiagnostico
                    cie10={x.cie10}
                    descripcion={x.descripcion}
                    autoFocus={!x.descripcion}
                    onElegir={(v) => actualizarDiag(i, v)}
                    onEscribir={(descripcion) => actualizarDiag(i, { descripcion, cie10: "" })}
                  />
                  <select value={x.sistema} onChange={(e) => actualizarDiag(i, { sistema: e.target.value })} className={cn(SELECT, "h-9")}>
                    <option value="">Aparato o sistema</option>
                    {listas.sistema_organico.map((s) => <option key={s.id} value={s.nombre}>{s.nombre}</option>)}
                  </select>
                  <select value={x.origen} onChange={(e) => actualizarDiag(i, { origen: e.target.value as Origen })} className={cn(SELECT, "h-9", x.origen !== "comun" && "border-aviso")}>
                    {(Object.keys(ETIQUETA_ORIGEN) as Origen[]).map((o) => <option key={o} value={o}>{ETIQUETA_ORIGEN[o]}</option>)}
                  </select>
                  <button type="button" className="justify-self-end text-muted-foreground hover:text-destructive" onClick={() => set("diagnosticos", d.diagnosticos.filter((_, j) => j !== i))}><Trash2 className="size-4" /></button>
                  {i === 0 && <span className="text-xs text-muted-foreground sm:col-span-4">Diagnóstico principal</span>}
                </div>
              ))}
              {d.diagnosticos.some((x) => x.origen === "ocupacional") && (
                <p className="flex items-center gap-2 rounded-md bg-alerta/10 px-3 py-2 text-sm text-alerta">
                  <AlertTriangle className="size-4" /> Sospecha de enfermedad ocupacional: la declaración ante el INPSASEL vence 24 h después del diagnóstico.
                </p>
              )}
            </Seccion>
            )}
            <Seccion titulo="Interconsultas" accion={<Button type="button" size="sm" variant="outline" onClick={() => set("interconsultas", [...d.interconsultas, { especialidad: "", motivo: "" }])}><Plus /> Agregar</Button>}>
              {d.interconsultas.length === 0 && <p className="text-sm text-muted-foreground">Sin interconsultas.</p>}
              {d.interconsultas.map((x, i) => (
                <div key={i} className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_auto]">
                  <select value={x.especialidad} onChange={(e) => set("interconsultas", d.interconsultas.map((y, j) => (j === i ? { ...y, especialidad: e.target.value } : y)))} className={cn(SELECT, "h-9")}>
                    <option value="">Especialidad</option>
                    {listas.especialidad.map((s) => <option key={s.id} value={s.nombre}>{s.nombre}</option>)}
                  </select>
                  <Input value={x.motivo} placeholder="Motivo de la referencia" className="h-9" onChange={(e) => set("interconsultas", d.interconsultas.map((y, j) => (j === i ? { ...y, motivo: e.target.value } : y)))} />
                  <button type="button" className="text-muted-foreground hover:text-destructive" onClick={() => set("interconsultas", d.interconsultas.filter((_, j) => j !== i))}><Trash2 className="size-4" /></button>
                </div>
              ))}
            </Seccion>
          </TabsContent>

          {/* ── Aptitud ── */}
          <TabsContent value="aptitud" className="mt-4 space-y-4">
            <Seccion titulo="Clasificación de aptitud">
              <div className="grid gap-2 sm:grid-cols-5">
                {APTITUDES.map((a) => (
                  <button
                    key={a}
                    type="button"
                    onClick={() => set("aptitud", { ...d.aptitud, clasificacion: d.aptitud.clasificacion === a ? "" : a })}
                    className={cn(
                      "rounded-xl border-2 px-3 py-3 text-sm font-medium transition",
                      d.aptitud.clasificacion === a ? cn(ESTILO_APTITUD[a], "border-current") : "border-transparent bg-muted/50 hover:bg-muted",
                    )}
                  >
                    {etiquetaAptitud(a)}
                  </button>
                ))}
              </div>
              {(d.aptitud.clasificacion === "elegible_con_restricciones" || d.aptitud.limitaciones.length > 0) && (
                <div>
                  <Label className="mb-2">Limitaciones ocupacionales</Label>
                  <div className="flex flex-wrap gap-1.5">
                    {listas.limitacion_ocupacional.map((l) => {
                      const activo = d.aptitud.limitaciones.includes(l.nombre);
                      return (
                        <button
                          key={l.id}
                          type="button"
                          onClick={() => set("aptitud", { ...d.aptitud, limitaciones: activo ? d.aptitud.limitaciones.filter((x) => x !== l.nombre) : [...d.aptitud.limitaciones, l.nombre] })}
                          className={cn("rounded-full border px-3 py-1 text-xs transition", activo ? "border-aviso bg-aviso/20 font-medium" : "hover:border-aviso")}
                        >
                          {l.nombre}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
              <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_14rem]">
                <TextosFrecuentes
                  etiqueta="Recomendaciones de aptitud"
                  items={listas.recomendacion_aptitud}
                  motivoCodigo={motivo?.codigo ?? null}
                  motivoNombre={motivo?.nombre ?? null}
                  valor={d.aptitud.observacion}
                  onChange={(v) => set("aptitud", { ...d.aptitud, observacion: v })}
                />
                <div>
                  <Label className="mb-1.5">Vigente hasta</Label>
                  <Input type="date" value={d.aptitud.vigenteHasta} onChange={(e) => set("aptitud", { ...d.aptitud, vigenteHasta: e.target.value })} />
                  <p className="mt-1 text-xs text-muted-foreground">Vacío: se calcula con la vigencia del examen periódico configurada.</p>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">La empresa cliente solo ve esta clasificación y las limitaciones, nunca el diagnóstico.</p>
            </Seccion>
          </TabsContent>

          {/* ── Tratamiento y reposo ── */}
          {mostrarTratamiento && (
            <TabsContent value="tratamiento" className="mt-4 space-y-4">
              <Seccion
                titulo="Tratamiento"
                accion={<Button type="button" size="sm" variant="outline" onClick={() => set("tratamiento", [...d.tratamiento, { medicina: "", presentacion: "", dosis: "", frecuencia: "", duracion: "", via: "" }])}><Plus /> Medicina</Button>}
              >
                <datalist id="medicinas">{listas.medicina.map((m) => <option key={m.id} value={m.nombre} />)}</datalist>
                {d.tratamiento.length === 0 && <p className="text-sm text-muted-foreground">Sin medicinas indicadas.</p>}
                {d.tratamiento.map((m, i) => (
                  <div key={i} className="grid gap-2 rounded-lg border p-3 sm:grid-cols-[minmax(0,2fr)_repeat(5,minmax(0,1fr))_auto]">
                    <Input list="medicinas" value={m.medicina} placeholder="Principio activo (DCI)" className="h-9" onChange={(e) => actualizarMed(i, { medicina: e.target.value })} />
                    {([["presentacion", listas.presentacion_medicina, "Presentación"], ["via", listas.via_administracion, "Vía"], ["frecuencia", listas.frecuencia_dosis, "Frecuencia"], ["duracion", listas.duracion_tratamiento, "Duración"]] as const).map(([k, items, ph]) => (
                      <select key={k} value={m[k]} onChange={(e) => actualizarMed(i, { [k]: e.target.value })} className={cn(SELECT, "h-9")}>
                        <option value="">{ph}</option>
                        {items.map((x) => <option key={x.id} value={x.nombre}>{x.nombre}</option>)}
                      </select>
                    ))}
                    <Input value={m.dosis} placeholder="Dosis" className="h-9" onChange={(e) => actualizarMed(i, { dosis: e.target.value })} />
                    <button type="button" className="text-muted-foreground hover:text-destructive" onClick={() => set("tratamiento", d.tratamiento.filter((_, j) => j !== i))}><Trash2 className="size-4" /></button>
                  </div>
                ))}
                <Texto etiqueta="Otras indicaciones" valor={d.indicaciones} onChange={(v) => set("indicaciones", v)} filas={2} />
              </Seccion>

              <Seccion titulo="Reposo médico">
                <label className="flex items-center gap-2 text-sm font-medium">
                  <input type="checkbox" checked={d.reposo.activo} onChange={(e) => set("reposo", { ...d.reposo, activo: e.target.checked })} className="size-4 accent-[var(--primary)]" />
                  Indicar reposo
                </label>
                {d.reposo.activo && (
                  <div className="grid gap-3 sm:grid-cols-4">
                    <div className="sm:col-span-2">
                      <Label className="mb-1.5">Causa</Label>
                      <select value={d.reposo.causa} onChange={(e) => set("reposo", { ...d.reposo, causa: e.target.value })} className={SELECT}>
                        {listas.causa_reposo.map((c) => <option key={c.id} value={c.codigo ?? c.nombre}>{c.nombre}</option>)}
                      </select>
                    </div>
                    <div className="sm:col-span-2">
                      <Label className="mb-1.5">Emitido por</Label>
                      <select value={d.reposo.ente} onChange={(e) => set("reposo", { ...d.reposo, ente: e.target.value })} className={SELECT}>
                        {listas.ente_emisor_reposo.map((c) => <option key={c.id} value={c.codigo ?? c.nombre}>{c.nombre}</option>)}
                      </select>
                    </div>
                    <div>
                      <Label className="mb-1.5">Desde</Label>
                      <Input type="date" value={d.reposo.desde} onChange={(e) => set("reposo", { ...d.reposo, desde: e.target.value })} />
                    </div>
                    <div>
                      <Label className="mb-1.5">Hasta</Label>
                      <Input type="date" value={d.reposo.hasta} onChange={(e) => set("reposo", { ...d.reposo, hasta: e.target.value })} />
                    </div>
                    <div className="flex items-end pb-2 text-sm text-muted-foreground sm:col-span-2">
                      {d.reposo.hasta >= d.reposo.desde
                        ? `${Math.round((Date.parse(d.reposo.hasta) - Date.parse(d.reposo.desde)) / 864e5) + 1} días · reintegro el día siguiente`
                        : "La fecha final es anterior a la inicial"}
                    </div>
                  </div>
                )}
              </Seccion>
            </TabsContent>
          )}

          {/* ── Conclusiones ── */}
          <TabsContent value="conclusiones" className="mt-4 space-y-4">
            <Seccion titulo="Conclusiones y recomendaciones">
              <Texto etiqueta="Conclusiones" valor={d.conclusiones} onChange={(v) => set("conclusiones", v)} />
              <TextosFrecuentes
                etiqueta="Recomendaciones para la empresa"
                items={listas.recomendacion_empresa}
                motivoCodigo={motivo?.codigo ?? null}
                motivoNombre={motivo?.nombre ?? null}
                valor={d.recomendacionesEmpresa}
                onChange={(v) => set("recomendacionesEmpresa", v)}
              />
              <TextosFrecuentes
                etiqueta="Recomendaciones para el trabajador"
                items={listas.recomendacion_paciente}
                motivoCodigo={motivo?.codigo ?? null}
                motivoNombre={motivo?.nombre ?? null}
                valor={d.recomendacionesTrabajador}
                onChange={(v) => set("recomendacionesTrabajador", v)}
              />
              <Texto etiqueta="Observación privada (solo personal de salud)" valor={d.observacionPrivada} onChange={(v) => set("observacionPrivada", v)} filas={2} />
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={d.autorizaPaciente} onChange={(e) => set("autorizaPaciente", e.target.checked)} className="size-4 accent-[var(--primary)]" />
                El trabajador autoriza enviar el informe a la empresa (si no, la empresa solo recibe la constancia de aptitud)
              </label>
            </Seccion>
          </TabsContent>
        </Tabs>
      </fieldset>

      {preventivo && !mostrarTratamiento && (
        <button type="button" className="text-sm text-primary hover:underline" onClick={() => setVerTodo(true)}>
          Mostrar tratamiento y reposo (ocultos para motivos preventivos)
        </button>
      )}
    </div>
  );
}
