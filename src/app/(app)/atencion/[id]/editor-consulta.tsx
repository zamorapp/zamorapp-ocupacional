"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, Check, CheckCircle2, ChevronLeft, ChevronRight, Loader2, Lock, Plus, Printer, RotateCcw, Save, Trash2 } from "lucide-react";
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
import { firmarConsulta, guardarConsulta, reabrirConsulta } from "../acciones";
import { MenuImprimir } from "@/components/app/menu-imprimir";
import { enlaceCorreo, enlaceWhatsApp, llenar } from "@/lib/mensajes";
import { Adjuntos } from "@/components/app/adjuntos";
import type { Adjunto } from "@/lib/adjuntos-tipos";
import { Antecedentes } from "./antecedentes";
import { aplicarPerfilExamen, aplicarPerfilParaclinicos, etiquetaMedicina, examenesDePerfil, indicacionPreestablecida } from "./perfiles";
import { BuscadorDiagnostico } from "./buscador-diagnostico";
import { TextosFrecuentes } from "./textos-frecuentes";

type Props = {
  inicial: DatosConsulta;
  trabajador: { id: string; nombre: string; cedula: string; edad: number | null; sexo: string | null; empresa: string; cargo: string; riesgos: Record<string, string[]> };
  medico: string | null;
  listas: Record<string, Item[]>;
  adjuntos: { orgId: string; lista: Adjunto[] } | null;
  envio: { servicio: string; plantilla: string; telefono: string | null; correo: string | null };
  puedeFirmar: boolean;
};

const CONFIRMAR_FIRMA = "La firma bloquea la consulta para siempre (no se edita, reabre ni borra). ¿Firmar?";

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

// Botón de examen normal (perfil con código "normal") y menú con los demás perfiles
function AccionesExamen({ perfiles, etiquetaNormal, onAplicar }: { perfiles: Item[]; etiquetaNormal: string; onAplicar: (texto: string, comoNormal: boolean) => void }) {
  const normal = perfiles.find((p) => p.codigo === "normal");
  const otros = perfiles.filter((p) => p !== normal);
  return (
    <div className="flex items-center gap-2">
      {normal?.texto && (
        <Button type="button" size="sm" variant="outline" className="h-8 border-ok/50 text-ok-texto hover:bg-ok/10 hover:text-ok-texto" onClick={() => onAplicar(normal.texto!, true)}>
          <CheckCircle2 /> {etiquetaNormal}
        </Button>
      )}
      <ElegirPerfil items={otros} onElegir={(t) => onAplicar(t, false)} />
    </div>
  );
}

function ElegirPerfil({ items, onElegir }: { items: Item[]; onElegir: (texto: string) => void }) {
  if (!items.length) return null;
  return (
    <select
      value=""
      onChange={(e) => {
        const it = items.find((i) => i.id === e.target.value);
        if (it?.texto) onElegir(it.texto);
      }}
      className="h-8 max-w-48 rounded-md border bg-transparent px-2 text-xs"
    >
      <option value="">Aplicar perfil…</option>
      {items.map((i) => <option key={i.id} value={i.id}>{i.nombre}</option>)}
    </select>
  );
}

function TablaExamen({ filas, onChange, bloqueado }: { filas: FilaExamen[]; onChange: (f: FilaExamen[]) => void; bloqueado: boolean }) {
  if (!filas.length) return <p className="text-sm text-muted-foreground">Sin plantilla. Agrégala en Configuración › Listas.</p>;
  return (
    <div className="divide-y rounded-lg border">
      {filas.map((f, i) => {
        const alterado = f.valor.trim() !== f.normal.trim();
        return (
          <div key={f.clave} className={cn("grid grid-cols-[8.5rem_minmax(0,1fr)_auto] items-start gap-3 px-3 py-1.5", alterado && "bg-aviso/10")}>
            <span className="pt-1.5 text-sm">{f.nombre}</span>
            <textarea
              rows={1}
              value={f.valor}
              disabled={bloqueado}
              onChange={(e) => onChange(filas.map((x, j) => (j === i ? { ...x, valor: e.target.value } : x)))}
              className={cn("field-sizing-content min-h-8 w-full resize-none rounded border-0 bg-transparent px-2 py-1.5 text-sm leading-snug outline-none focus:bg-card focus:ring-1 focus:ring-primary", alterado && "font-medium")}
            />
            {alterado ? (
              <button type="button" disabled={bloqueado} title="Volver a normal" className="pt-2 text-muted-foreground hover:text-foreground" onClick={() => onChange(filas.map((x, j) => (j === i ? { ...x, valor: x.normal } : x)))}>
                <RotateCcw className="size-3.5" />
              </button>
            ) : <span className="size-3.5" />}
          </div>
        );
      })}
    </div>
  );
}

export function EditorConsulta({ inicial, trabajador, medico, listas, adjuntos, envio, puedeFirmar }: Props) {
  const router = useRouter();
  const [d, setD] = useState<DatosConsulta>(inicial);
  const [guardado, setGuardado] = useState(JSON.stringify(inicial));
  const [aviso, setAviso] = useState<{ ok: boolean; mensaje: string } | null>(null);
  const [guardando, iniciar] = useTransition();
  const [verTodo, setVerTodo] = useState(false);
  const [paso, setPaso] = useState("generales");

  const bloqueado = d.estado !== "borrador";
  const cambios = JSON.stringify(d) !== guardado;
  const set = <K extends keyof DatosConsulta>(k: K, v: DatosConsulta[K]) => setD((x) => ({ ...x, [k]: v }));

  const motivo = listas.motivo_consulta.find((m) => m.id === d.motivoId);
  const preventivo = motivo?.grupo === "preventivo";
  const mostrarTratamiento = !preventivo || verTodo || d.tratamiento.length > 0 || d.reposo.activo;
  const etiquetaAptitud = (a: Aptitud) => listas.clasificacion_aptitud.find((i) => i.codigo === a)?.nombre ?? a;

  // Pasos de la consulta; "hecho" marca con ✓ los que ya tienen información
  const pasos = [
    { id: "generales", titulo: "Generales", hecho: Boolean(d.motivoId) },
    { id: "antecedentes", titulo: "Antecedentes", hecho: d.antecedentes.length > 0 || d.habitos.some((h) => h.valor) },
    { id: "examen", titulo: "Examen", hecho: Boolean(d.signos.ta || d.signos.peso) },
    { id: "paraclinicos", titulo: d.paraclinicos.length ? `Paraclínicos (${d.paraclinicos.length})` : "Paraclínicos", hecho: d.paraclinicos.length > 0 },
    { id: "diagnostico", titulo: d.sano ? "Diagnóstico · sano" : d.diagnosticos.length ? `Diagnóstico (${d.diagnosticos.length})` : "Diagnóstico", hecho: d.sano || d.diagnosticos.length > 0 },
    { id: "aptitud", titulo: "Aptitud", hecho: Boolean(d.aptitud.clasificacion) },
    ...(mostrarTratamiento ? [{ id: "tratamiento", titulo: "Tratamiento y reposo", hecho: d.tratamiento.length > 0 || d.reposo.activo }] : []),
    { id: "conclusiones", titulo: "Conclusiones", hecho: Boolean(d.conclusiones || d.recomendacionesTrabajador || d.recomendacionesEmpresa) },
  ];
  const indicePaso = Math.max(0, pasos.findIndex((p) => p.id === paso));
  const irA = (i: number) => { setPaso(pasos[i].id); window.scrollTo({ top: 0, behavior: "smooth" }); };

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

  // Un clic: cierra (guardar_consulta con p_cerrar), firma y abre todos los documentos de la consulta en una sola impresión
  const firmarEImprimir = () => {
    if (!confirm(CONFIRMAR_FIRMA)) return;
    iniciar(async () => {
      if (d.estado === "borrador") {
        const g = await guardarConsulta(d, true);
        if (!g.ok) return setAviso(g);
        setGuardado(JSON.stringify({ ...d, estado: "cerrada" }));
      }
      const r = await firmarConsulta(d.id);
      setAviso(r);
      if (!r.ok) return setD((x) => ({ ...x, estado: "cerrada" }));
      setD((x) => ({ ...x, estado: "firmada" }));
      router.push(`/imprimir/paquete/${d.id}`);
    });
  };

  // Menú Imprimir: con cambios sin guardar, guarda primero para que el documento salga con lo que se ve en pantalla
  const guardarAntes = async () => {
    const r = await guardarConsulta(d, false);
    setAviso(r);
    if (r.ok) setGuardado(JSON.stringify(d));
    return r.ok;
  };
  const menuImprimir = (variante: "default" | "outline") => (
    <MenuImprimir
      consultaId={d.id}
      aptitud={Boolean(d.aptitud.clasificacion)}
      reposo={d.reposo.activo}
      tratamiento={d.tratamiento.some((m) => m.medicina)}
      examenes={d.paraclinicos.length > 0}
      referencias={d.interconsultas.some((x) => x.especialidad)}
      antes={cambios && !bloqueado ? guardarAntes : undefined}
      ocupado={guardando}
      variante={variante}
    />
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
    <Tabs value={pasos[indicePaso].id} onValueChange={setPaso} className="gap-4">
      {/* Cabecera fija con el paciente, las acciones y los pasos */}
      <div className="z-10 -mx-4 border-b bg-background/95 px-4 pt-3 lg:sticky lg:top-16 backdrop-blur sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <div className="grid size-10 shrink-0 sm:size-11 place-items-center rounded-full bg-primary text-base font-semibold text-primary-foreground">
            {trabajador.nombre.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join("").toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <Link href={`/pacientes/${trabajador.id}`} className="text-lg font-semibold hover:text-primary">{trabajador.nombre}</Link>
            <p className="truncate text-sm text-muted-foreground">
              {d.aptitud.clasificacion && (
                <span className={cn("mr-2 rounded-full px-2 py-0.5 text-xs font-medium", ESTILO_APTITUD[d.aptitud.clasificacion])}>{etiquetaAptitud(d.aptitud.clasificacion)}</span>
              )}
              {trabajador.cedula}{trabajador.edad !== null && ` · ${trabajador.edad} años`}{trabajador.sexo && ` · ${trabajador.sexo}`} · {[trabajador.cargo, trabajador.empresa].filter(Boolean).join(" · ")}
            </p>
          </div>
          <div className="text-right text-xs text-muted-foreground">
            <div>{ETIQUETA_ESTADO_CONSULTA[d.estado]} · {d.fecha.split("-").reverse().join("/")}</div>
            {medico && <div>{medico}</div>}
          </div>
          {d.estado === "firmada" ? (
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1.5 text-sm font-medium text-primary"><Lock className="size-4" /> Firmada</span>
              {menuImprimir("default")}
            </div>
          ) : bloqueado ? (
            <div className="flex flex-wrap gap-2">
              {menuImprimir("outline")}
              <Button variant="outline" onClick={() => iniciar(async () => { const r = await reabrirConsulta(d.id); setAviso(r); if (r.ok) setD({ ...d, estado: "borrador" }); })} disabled={guardando}>
                <Lock /> Reabrir
              </Button>
              {puedeFirmar && (
                <>
                  <Button variant="outline" onClick={() => confirm(CONFIRMAR_FIRMA) && iniciar(async () => { const r = await firmarConsulta(d.id); setAviso(r); if (r.ok) setD({ ...d, estado: "firmada" }); })} disabled={guardando}>
                    <CheckCircle2 /> Firmar
                  </Button>
                  <Button onClick={firmarEImprimir} disabled={guardando}><Printer /> Firmar e imprimir</Button>
                </>
              )}
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {menuImprimir("outline")}
              <Button variant="outline" onClick={() => guardar(false)} disabled={guardando || !cambios}>
                {guardando ? <Loader2 className="animate-spin" /> : <Save />} {cambios ? "Guardar" : "Guardado"}
              </Button>
              <Button variant={puedeFirmar ? "outline" : "default"} onClick={() => guardar(true)} disabled={guardando}><CheckCircle2 /> Cerrar consulta</Button>
              {puedeFirmar && <Button onClick={firmarEImprimir} disabled={guardando}><Printer /> Cerrar, firmar e imprimir</Button>}
            </div>
          )}
        </div>
        {!cambios && d.aptitud.clasificacion && d.estado !== "borrador" && (() => {
          const texto = llenar(envio.plantilla, { nombre: trabajador.nombre, cedula: trabajador.cedula, fecha: d.fecha.split("-").reverse().join("/"), motivo: motivo?.nombre ?? "",
            empresa: trabajador.empresa, servicio: envio.servicio, aptitud: etiquetaAptitud(d.aptitud.clasificacion as Aptitud), observacion: d.aptitud.observacion ? " " + d.aptitud.observacion : "" });
          return (
            <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
              <span>Enviar resultado a RR. HH.:</span>
              <a href={enlaceWhatsApp(envio.telefono, texto)} target="_blank" rel="noreferrer" className="rounded-md border bg-card px-2 py-1 font-medium hover:border-primary/50 hover:text-primary">WhatsApp</a>
              <a href={enlaceCorreo(envio.correo, `Resultado de evaluación · ${trabajador.nombre}`, texto)} className="rounded-md border bg-card px-2 py-1 font-medium hover:border-primary/50 hover:text-primary">Correo</a>
            </div>
          );
        })()}
        {aviso?.mensaje && (
          <p className={cn("mt-2 text-sm", aviso.ok ? "text-ok-texto" : "text-destructive")}>{aviso.mensaje}</p>
        )}
        <TabsList className="-mb-px mt-3 flex h-auto w-full justify-start gap-1 overflow-x-auto overflow-y-hidden rounded-none [scrollbar-width:none] bg-transparent p-0">
          {pasos.map((p, i) => (
            <TabsTrigger
              key={p.id}
              value={p.id}
              className="group mb-2 h-9 flex-none gap-2 rounded-lg border-0 px-3 text-muted-foreground shadow-none hover:bg-muted data-[state=active]:bg-primary/10 data-[state=active]:font-semibold data-[state=active]:text-primary data-[state=active]:shadow-none"
            >
              <span className={cn(
                "grid size-5 place-items-center rounded-full border text-[11px] font-semibold",
                p.hecho ? "border-ok bg-ok text-white" : "group-data-[state=active]:border-primary group-data-[state=active]:text-primary",
              )}>
                {p.hecho ? <Check className="size-3" strokeWidth={3} /> : i + 1}
              </span>
              {p.titulo}
            </TabsTrigger>
          ))}
        </TabsList>
      </div>

      <fieldset disabled={bloqueado} className="contents">

          {/* ── Generales ── */}
          <TabsContent value="generales" className="mt-4 space-y-4">
            <Seccion titulo="Motivo">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
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
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
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
              <Antecedentes items={listas.antecedente_medico} valor={d.antecedentes} onChange={(v) => set("antecedentes", v)} />
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
                      className={cn("h-9", k === "ta" && taAlterada(d.signos.ta) && "border-alerta text-alerta-texto")}
                    />
                  </div>
                ))}
                <div>
                  <Label className="mb-1.5 text-xs">IMC</Label>
                  <div className={cn("flex h-9 items-center rounded-md border bg-muted/40 px-3 text-sm font-medium", claseImc?.alerta && "border-aviso text-aviso-texto")}>
                    {valorImc ?? "—"}
                  </div>
                  {claseImc && <p className={cn("mt-1 text-xs", claseImc.alerta ? "text-aviso-texto" : "text-muted-foreground")}>{claseImc.texto}</p>}
                </div>
              </div>
              {taAlterada(d.signos.ta) && (
                <p className="flex items-center gap-2 text-sm text-alerta-texto"><AlertTriangle className="size-4" /> Tensión arterial elevada.</p>
              )}
            </Seccion>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <Seccion titulo="Examen funcional" accion={<AccionesExamen perfiles={listas.perfil_examen_funcional} etiquetaNormal="Funcional normal" onAplicar={(t, normal) => set("examenFuncional", aplicarPerfilExamen(d.examenFuncional, t, normal))} />}>
                <TablaExamen filas={d.examenFuncional} onChange={(f) => set("examenFuncional", f)} bloqueado={bloqueado} />
              </Seccion>
              <Seccion titulo="Examen físico" accion={<AccionesExamen perfiles={listas.perfil_examen_fisico} etiquetaNormal="Evaluación física normal" onAplicar={(t, normal) => set("examenFisico", aplicarPerfilExamen(d.examenFisico, t, normal))} />}>
                <TablaExamen filas={d.examenFisico} onChange={(f) => set("examenFisico", f)} bloqueado={bloqueado} />
              </Seccion>
            </div>
            <p className="text-xs text-muted-foreground">Precargado en normal: solo escribe lo que esté alterado. Las filas cambiadas se resaltan.</p>
          </TabsContent>

          {/* ── Paraclínicos ── */}
          <TabsContent value="paraclinicos" className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <Seccion titulo="Catálogo">
              {listas.grupo_paraclinicos.length > 0 && (
                <div className="rounded-lg border bg-muted/30 p-3">
                  <div className="mb-2 text-sm font-medium">Perfiles</div>
                  <div className="flex flex-wrap gap-1.5">
                    {listas.grupo_paraclinicos.map((pf) => {
                      const sugerido = Boolean(pf.grupo && trabajador.empresa.toLowerCase().includes(pf.grupo.toLowerCase()));
                      return (
                        <button
                          key={pf.id}
                          type="button"
                          title={examenesDePerfil(pf.texto).join(", ")}
                          onClick={() => set("paraclinicos", aplicarPerfilParaclinicos(d.paraclinicos, pf.texto ?? "", listas.paraclinico))}
                          className={cn("inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs transition hover:border-primary", sugerido && "border-primary bg-primary/10 font-medium text-primary")}
                        >
                          <Plus className="size-3" /> {pf.nombre} <span className="text-muted-foreground">({examenesDePerfil(pf.texto).length})</span>
                        </button>
                      );
                    })}
                  </div>
                  {listas.grupo_paraclinicos.some((pf) => pf.grupo && trabajador.empresa.toLowerCase().includes(pf.grupo.toLowerCase())) && (
                    <p className="mt-2 text-xs text-primary">Resaltado: perfil de esta empresa.</p>
                  )}
                </div>
              )}
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
            {adjuntos && (
              <div className="lg:col-span-2">
                <Seccion titulo="Resultados adjuntos (PDF o fotos)">
                  <Adjuntos orgId={adjuntos.orgId} trabajadorId={trabajador.id} consultaId={d.id} iniciales={adjuntos.lista} />
                </Seccion>
              </div>
            )}
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
                <p className="flex items-center gap-2 rounded-md bg-alerta/10 px-3 py-2 text-sm text-alerta-texto">
                  <AlertTriangle className="size-4" /> Sospecha de enfermedad ocupacional: la declaración ante el INPSASEL vence 24 h después del diagnóstico.
                </p>
              )}
            </Seccion>
            )}
            <Seccion titulo="Interconsultas" accion={<Button type="button" size="sm" variant="outline" onClick={() => set("interconsultas", [...d.interconsultas, { especialidad: "", motivo: "" }])}><Plus /> Agregar</Button>}>
              {d.interconsultas.length === 0 && <p className="text-sm text-muted-foreground">Sin interconsultas.</p>}
              {d.interconsultas.map((x, i) => (
                <div key={i} className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_auto]">
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
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-5">
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
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-[minmax(0,1fr)_14rem]">
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
                accion={<Button type="button" size="sm" variant="outline" onClick={() => set("tratamiento", [...d.tratamiento, { medicina: "", concentracion: "", presentacion: "", dosis: "", frecuencia: "", duracion: "", via: "", observacion: "" }])}><Plus /> Medicina</Button>}
              >
                <datalist id="medicinas">{listas.medicina.map((m) => <option key={m.id} value={etiquetaMedicina(m.nombre, m.texto)} />)}</datalist>
                {d.tratamiento.length === 0 && <p className="text-sm text-muted-foreground">Sin medicinas indicadas.</p>}
                {d.tratamiento.map((m, i) => (
                  <div key={i} className="grid gap-2 rounded-lg border p-3 sm:grid-cols-[minmax(0,2fr)_repeat(6,minmax(0,1fr))_auto]">
                    <Input
                      list="medicinas"
                      value={m.medicina}
                      placeholder="Principio activo (DCI)"
                      className="h-9"
                      onChange={(e) => {
                        const v = e.target.value;
                        // Si elige del vademécum, se llenan los parámetros preestablecidos (editables)
                        const it = listas.medicina.find((x) => etiquetaMedicina(x.nombre, x.texto) === v);
                        if (!it) return actualizarMed(i, { medicina: v });
                        const pre = indicacionPreestablecida(it.texto);
                        actualizarMed(i, {
                          medicina: it.nombre,
                          concentracion: pre.concentracion ?? "",
                          presentacion: pre.presentacion ?? "",
                          via: pre.via ?? "",
                          dosis: pre.dosis ?? "",
                          frecuencia: pre.frecuencia ?? "",
                          duracion: pre.duracion ?? "",
                          observacion: pre.observacion ?? "",
                        });
                      }}
                    />
                    <Input value={m.concentracion ?? ""} placeholder="Concentración" className="h-9" onChange={(e) => actualizarMed(i, { concentracion: e.target.value })} />
                    {([["presentacion", listas.presentacion_medicina, "Presentación"], ["via", listas.via_administracion, "Vía"], ["frecuencia", listas.frecuencia_dosis, "Frecuencia"], ["duracion", listas.duracion_tratamiento, "Duración"]] as const).map(([k, items, ph]) => (
                      <select key={k} value={m[k]} onChange={(e) => actualizarMed(i, { [k]: e.target.value })} className={cn(SELECT, "h-9")}>
                        <option value="">{ph}</option>
                        {items.map((x) => <option key={x.id} value={x.nombre}>{x.nombre}</option>)}
                      </select>
                    ))}
                    <Input value={m.dosis} placeholder="Dosis" className="h-9" onChange={(e) => actualizarMed(i, { dosis: e.target.value })} />
                    <button type="button" className="text-muted-foreground hover:text-destructive" onClick={() => set("tratamiento", d.tratamiento.filter((_, j) => j !== i))}><Trash2 className="size-4" /></button>
                    <Input value={m.observacion ?? ""} placeholder="Observación (ej. después de las comidas)" className="h-8 sm:col-span-8" onChange={(e) => actualizarMed(i, { observacion: e.target.value })} />
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
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
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
      </fieldset>

      {/* Navegación entre pasos */}
      <div className="flex items-center justify-between gap-3 border-t pt-4">
        <Button type="button" variant="ghost" disabled={indicePaso === 0} onClick={() => irA(indicePaso - 1)}>
          <ChevronLeft /> {indicePaso > 0 ? pasos[indicePaso - 1].titulo : "Anterior"}
        </Button>
        <span className="text-xs text-muted-foreground">Paso {indicePaso + 1} de {pasos.length} · {pasos.filter((p) => p.hecho).length} completos</span>
        {indicePaso < pasos.length - 1 ? (
          <Button type="button" variant="outline" onClick={() => irA(indicePaso + 1)}>
            {pasos[indicePaso + 1].titulo} <ChevronRight />
          </Button>
        ) : !bloqueado ? (
          <Button type="button" onClick={() => guardar(true)} disabled={guardando}><CheckCircle2 /> Cerrar consulta</Button>
        ) : <span />}
      </div>

      {preventivo && !mostrarTratamiento && (
        <button type="button" className="text-sm text-primary hover:underline" onClick={() => setVerTodo(true)}>
          Mostrar tratamiento y reposo (ocultos para motivos preventivos)
        </button>
      )}
    </Tabs>
  );
}
