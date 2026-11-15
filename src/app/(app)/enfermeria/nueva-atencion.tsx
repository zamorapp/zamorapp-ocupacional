"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { BookOpen, Check, HeartPulse, Loader2, Printer, Search, X } from "lucide-react";
import { Aviso, CampoSelect } from "@/components/app/campo";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PROCEDIMIENTOS_ENFERMERIA, SIGNOS_ENFERMERIA, TIPOS_ENFERMERIA, tipoEnfermeria, type TipoEnfermeria } from "@/lib/enfermeria-tipos";
import { cn } from "@/lib/utils";
import { buscarPacientes, type PacienteEncontrado } from "../atencion/acciones";
import { consultasDelTrabajador, registrarAtencion, type ConsultaParaLeer } from "./acciones";

type Motivo = { nombre: string; codigo: string | null };

// Atención de enfermería en una sola tarjeta: qué hizo → a quién → motivo de un clic → signos → guardar.
// Tras guardar se queda en el mismo tipo y día, lista para el siguiente trabajador.
export function NuevaAtencion({ fecha, hoy, motivos, empresas, empresa, inicial }: {
  fecha: string; hoy: string; motivos: Motivo[]; empresas: { id: string; nombre: string }[]; empresa: string | null;
  // Desde «Escribir evolución» de una consulta: ya trae al trabajador y la consulta
  inicial?: { paciente: PacienteEncontrado; consultaId: string | null } | null;
}) {
  const [estado, accion, enviando] = useActionState(registrarAtencion, null);
  const [tipo, setTipo] = useState<TipoEnfermeria>(inicial ? "evolucion" : "signos");
  const [texto, setTexto] = useState("");
  const [resultados, setResultados] = useState<PacienteEncontrado[]>([]);
  const [paciente, setPaciente] = useState<PacienteEncontrado | null>(inicial?.paciente ?? null);
  const [consultas, setConsultas] = useState<ConsultaParaLeer[]>([]);
  const [consultaId, setConsultaId] = useState<string>(inicial?.consultaId ?? "");
  const [motivo, setMotivo] = useState("");
  const [cie10, setCie10] = useState("");
  const [buscando, iniciar] = useTransition();
  const formulario = useRef<HTMLFormElement>(null);
  const buscador = useRef<HTMLInputElement>(null);
  const tratamiento = useRef<HTMLTextAreaElement>(null);
  const def = tipoEnfermeria(tipo);
  const inspeccion = tipo === "inspeccion";

  useEffect(() => {
    if (paciente) return;
    const t = setTimeout(() => iniciar(async () => setResultados(await buscarPacientes(texto))), 250);
    return () => clearTimeout(t);
  }, [texto, paciente]);

  // Elegido el trabajador: sus últimas consultas del médico, para leerlas y anotar la evolución en una
  useEffect(() => {
    if (!paciente) { setConsultas([]); return; }
    let vigente = true;
    consultasDelTrabajador(paciente.id).then((c) => { if (vigente) setConsultas(c); });
    return () => { vigente = false; };
  }, [paciente]);

  // Guardada: limpia lo del trabajador y deja el tipo y el día para el siguiente
  useEffect(() => {
    if (!estado?.ok) return;
    formulario.current?.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("[data-limpiar]").forEach((c) => {
      if (c instanceof HTMLInputElement && c.type === "checkbox") c.checked = false; else c.value = "";
    });
    setPaciente(null); setTexto(""); setMotivo(""); setCie10(""); setConsultaId("");
    buscador.current?.focus();
  }, [estado]);

  const elegirMotivo = (m: Motivo) => {
    if (motivo === m.nombre) { setMotivo(""); setCie10(""); return; }
    setMotivo(m.nombre); setCie10(m.codigo ?? "");
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base"><HeartPulse className="size-4 text-primary" /> Nueva atención</CardTitle>
        <CardDescription>Elige qué hiciste, a quién y el motivo. Se guarda en su historia y en la morbilidad de enfermería.</CardDescription>
      </CardHeader>
      <CardContent>
        <form ref={formulario} action={accion} className="space-y-4">
          <input type="hidden" name="tipo" value={tipo} />
          <input type="hidden" name="cie10" value={inspeccion ? "" : cie10} />
          <input type="hidden" name="consulta_id" value={paciente ? consultaId : ""} />

          <fieldset>
            <legend className="mb-1.5 text-sm font-medium">¿Qué hiciste?</legend>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {TIPOS_ENFERMERIA.map((t) => (
                <button key={t.k} type="button" aria-pressed={tipo === t.k} onClick={() => setTipo(t.k)}
                  className={cn("min-h-11 rounded-lg border px-2.5 py-2 text-left text-sm font-medium transition",
                    tipo === t.k ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:bg-muted")}>
                  {t.corto}
                </button>
              ))}
            </div>
          </fieldset>

          {!inspeccion && (
            <div>
              <Label className="mb-1.5">Trabajador {def.sinTrabajador ? <span className="font-normal text-muted-foreground">(si fue a uno solo)</span> : "*"}</Label>
              {paciente ? (
                <div className="flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-2 text-sm">
                  <input type="hidden" name="trabajador_id" value={paciente.id} />
                  <span className="min-w-0 flex-1 [overflow-wrap:anywhere]"><b>{paciente.nombre}</b> · {paciente.cedula} · {paciente.empresa}</span>
                  <button type="button" onClick={() => { setPaciente(null); setConsultaId(""); }} aria-label="Cambiar trabajador" className="rounded p-1 text-muted-foreground hover:text-foreground"><X className="size-4" /></button>
                </div>
              ) : (
                <>
                  <label className="relative block">
                    <span className="sr-only">Buscar trabajador</span>
                    <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <input ref={buscador} value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Cédula o nombre"
                      className="h-11 w-full rounded-md border bg-transparent pl-9 pr-9 text-sm" />
                    {buscando && <Loader2 className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />}
                  </label>
                  {resultados.length > 0 && (
                    <ul className="mt-1 max-h-48 divide-y overflow-y-auto rounded-md border">
                      {resultados.map((p) => (
                        <li key={p.id}>
                          <button type="button" onClick={() => setPaciente(p)} className="w-full px-3 py-2.5 text-left text-sm hover:bg-muted">
                            {p.nombre} <span className="text-muted-foreground">· {p.cedula} · {p.empresa}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )}
            </div>
          )}

          {paciente && !inspeccion && (
            <div className="rounded-lg border bg-muted/20 p-3">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-medium">Consultas del médico <span className="font-normal text-muted-foreground">(solo lectura)</span></p>
                <Link href={`/imprimir/enfermeria/control-ta?trabajador=${paciente.id}`} target="_blank" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                  <Printer className="size-3.5" /> Hoja de tensión para llenar a mano
                </Link>
              </div>
              {consultas.length === 0 ? (
                <p className="text-xs text-muted-foreground">Sin consultas del médico.</p>
              ) : (
                <ul className="space-y-1.5">
                  {consultas.map((c) => (
                    <li key={c.id} className="flex flex-wrap items-center gap-2 text-sm">
                      <label className="flex min-h-9 min-w-0 flex-1 cursor-pointer items-center gap-2">
                        <input type="radio" name="_consulta" checked={consultaId === c.id} onChange={() => setConsultaId(c.id)} className="size-4 accent-[var(--primary)]" />
                        <span className="min-w-0 [overflow-wrap:anywhere]"><span className="font-cifra">{c.fecha.slice(0, 10).split("-").reverse().join("/")}</span> · {c.motivo}</span>
                      </label>
                      <Link href={`/atencion/${c.id}`} target="_blank" className="inline-flex items-center gap-1 rounded-md border bg-background px-2 py-1 text-xs hover:bg-muted">
                        <BookOpen className="size-3.5" /> Leer
                      </Link>
                    </li>
                  ))}
                  <li>
                    <label className="flex min-h-9 cursor-pointer items-center gap-2 text-sm text-muted-foreground">
                      <input type="radio" name="_consulta" checked={consultaId === ""} onChange={() => setConsultaId("")} className="size-4 accent-[var(--primary)]" />
                      Solo en su historia (sin unir a una consulta)
                    </label>
                  </li>
                </ul>
              )}
            </div>
          )}

          {!paciente && (def.sinTrabajador || inspeccion) && (
            <CampoSelect id="empresa_id" etiqueta="Empresa" defaultValue={empresa ?? empresas[0]?.id} key={empresa ?? ""}>
              {empresas.map((e) => <option key={e.id} value={e.id}>{e.nombre}</option>)}
            </CampoSelect>
          )}

          <div>
            <Label htmlFor="motivo" className="mb-1.5">{inspeccion ? "Área o puesto inspeccionado" : "Motivo"}</Label>
            {!inspeccion && motivos.length > 0 && (
              <div className="mb-2 flex flex-wrap gap-1.5">
                {motivos.map((m) => (
                  <button key={m.nombre} type="button" aria-pressed={motivo === m.nombre} onClick={() => elegirMotivo(m)}
                    className={cn("rounded-full border px-3 py-1.5 text-xs transition",
                      motivo === m.nombre ? "border-primary bg-primary/10 font-medium text-primary" : "bg-background hover:bg-muted")}>
                    {motivo === m.nombre && <Check className="mr-1 inline size-3" />}{m.nombre}
                  </button>
                ))}
              </div>
            )}
            <Input id="motivo" name="motivo" value={motivo} maxLength={200} className="h-10"
              onChange={(e) => { setMotivo(e.target.value); if (!motivos.some((m) => m.nombre === e.target.value)) setCie10(""); }}
              placeholder={inspeccion ? "Ej.: comedor, baños y botiquín" : "Elige arriba o escribe otro"} />
          </div>

          {def.pideSignos && (
            <fieldset>
              <legend className="mb-1.5 text-sm font-medium">Signos vitales <span className="font-normal text-muted-foreground">(los que tomaste)</span></legend>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {SIGNOS_ENFERMERIA.slice(0, tipo === "signos" ? 7 : 5).map((s) => (
                  <label key={s.k} className="block text-xs text-muted-foreground">
                    {s.t} <span className="opacity-70">({s.unidad})</span>
                    <Input data-limpiar name={`s_${s.k}`} inputMode={s.k === "ta" ? "text" : "decimal"} placeholder={s.ejemplo} maxLength={12} className="mt-1 h-10 text-sm text-foreground" />
                  </label>
                ))}
              </div>
            </fieldset>
          )}

          {def.pideTratamiento && (
            <div>
              <Label htmlFor="tratamiento" className="mb-1.5">
                {tipo === "cura" ? "¿Qué curaste y con qué?" : tipo === "procedimiento" ? "¿Qué procedimiento hiciste?" : "Tratamiento administrado"}
              </Label>
              {tipo === "procedimiento" && (
                <div className="mb-2 flex flex-wrap gap-1.5">
                  {PROCEDIMIENTOS_ENFERMERIA.map((p) => (
                    <button key={p} type="button" className="rounded-full border bg-background px-3 py-1.5 text-xs transition hover:bg-muted"
                      onClick={() => {
                        const t = tratamiento.current;
                        if (!t) return;
                        t.value = t.value.trim() ? `${t.value.trim()}, ${p.toLowerCase()}` : p;
                        t.focus();
                      }}>
                      + {p}
                    </button>
                  ))}
                </div>
              )}
              <Textarea ref={tratamiento} data-limpiar id="tratamiento" name="tratamiento" rows={2} maxLength={1000}
                placeholder={tipo === "cura" ? "Ej.: herida en mano derecha, lavado y gasa" : tipo === "procedimiento" ? "Ej.: vendaje en tobillo izquierdo" : "Ej.: Complejo B 1 amp IM, indicado por el Dr. …"} />
            </div>
          )}

          <div>
            <Label htmlFor="nota" className="mb-1.5">
              {tipo === "evolucion" ? "Evolución de enfermería *" : inspeccion ? "Hallazgos y recomendaciones" : "Observación"}
              {tipo !== "evolucion" && <span className="font-normal text-muted-foreground"> (opcional)</span>}
            </Label>
            <Textarea data-limpiar id="nota" name="nota" rows={tipo === "evolucion" ? 4 : 2} maxLength={2000} required={tipo === "evolucion"}
              placeholder={tipo === "evolucion" ? "Ej.: paciente refiere mejoría de la cefalea; TA controlada; cumple tratamiento indicado." : undefined} />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block text-sm font-medium">
              Día de la atención
              <Input type="date" name="fecha" defaultValue={fecha} max={hoy} key={fecha} className="mt-1.5 h-10" />
            </label>
            {!inspeccion && (
              <label className="flex min-h-11 cursor-pointer items-center gap-2.5 self-end rounded-lg border bg-background px-3 py-2 text-sm">
                <input data-limpiar type="checkbox" name="referido" className="size-4 accent-[var(--primary)]" />
                Referir al médico
              </label>
            )}
          </div>

          <Aviso resultado={estado} />
          <Button type="submit" size="lg" disabled={enviando} className="w-full sm:w-auto">
            {enviando ? <Loader2 className="animate-spin" /> : <Check />} Guardar atención
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
