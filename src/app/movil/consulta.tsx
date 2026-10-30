"use client";

import { useMemo, useState } from "react";
import { ArrowLeft, Check, Loader2, Plus, Star, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { hoyCaracas, sumarDias } from "@/lib/fecha";
import { buscarDiagnosticos, consultasDe, items, paciente, reposoDeConsulta } from "@/lib/movil/datos";
import type { Fila, Motor } from "@/lib/movil/motor";
import { cn } from "@/lib/utils";

type Dx = { id?: string; cie10: string; descripcion: string; principal: boolean; origen: string };
type Examen = { clave: string; nombre: string; valor: string; normal: string };
type Reposo = { id?: string; dias: string; desde: string; causa: string } | null;

const SIGNOS = [
  { k: "ta", t: "TA", ph: "120/80" }, { k: "fc", t: "FC", ph: "lpm" }, { k: "fr", t: "FR", ph: "rpm" },
  { k: "temp", t: "Temp.", ph: "°C" }, { k: "peso", t: "Peso", ph: "kg" }, { k: "talla", t: "Talla", ph: "m" },
];
const CAUSAS = [
  ["enfermedad_comun", "Enfermedad común"], ["enfermedad_ocupacional", "Enfermedad ocupacional"],
  ["accidente_comun", "Accidente común"], ["accidente_laboral", "Accidente laboral"],
];
const ORIGENES = [["comun", "Común"], ["ocupacional", "Ocupacional"], ["accidente_comun", "Acc. común"], ["accidente_laboral", "Acc. laboral"]];

const s = (v: unknown) => (v == null ? "" : String(v));
const lista = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

export function FormConsulta({ motor, trabajadorId, consultaId, volver }: { motor: Motor; trabajadorId: string; consultaId?: string; volver: () => void }) {
  const p = paciente(motor, trabajadorId);
  const uid = motor.meta.equipo!.uid;
  const existente = consultaId ? motor.tabla("clinico.consultas").get(consultaId) ?? null : null;
  const soloLectura = existente?.estado === "firmada";
  const hoy = hoyCaracas(motor.reloj.ahora());

  // Estado inicial: la consulta guardada o una nueva con el examen en normal y lo de la consulta anterior
  const inicial = useMemo(() => {
    if (existente) {
      const dx = [...motor.tabla("clinico.diagnosticos").values()].filter((d) => d.consulta_id === consultaId)
        .map((d) => ({ id: s(d.id), cie10: s(d.cie10), descripcion: s(d.descripcion), principal: Boolean(d.principal), origen: s(d.origen) || "comun" }));
      const r = reposoDeConsulta(motor, consultaId!);
      return {
        c: existente, dx,
        reposo: r ? { id: s(r.id), desde: s(r.desde), dias: String((Date.parse(s(r.hasta)) - Date.parse(s(r.desde))) / 86_400_000 + 1), causa: s(r.causa) } : null,
      };
    }
    const previa = consultasDe(motor, trabajadorId)[0]?.fila;
    const plantilla = (l: string): Examen[] => items(motor, l).map((i) => ({ clave: s(i.codigo || i.id), nombre: s(i.nombre), valor: s(i.texto), normal: s(i.texto) }));
    const habPrev = new Map(lista<{ clave: string; valor: string }>(previa?.habitos).map((h) => [h.clave, h.valor]));
    const c: Fila = {
      tipo: previa ? "sucesiva" : "primera", motivo_id: null, motivo_texto: "", enfermedad_actual: "", signos_vitales: {},
      examen_fisico: plantilla("examen_fisico"), examen_funcional: plantilla("examen_funcional"),
      antecedentes: previa?.antecedentes ?? [],
      habitos: items(motor, "habito").map((h) => ({ clave: s(h.codigo || h.id), nombre: s(h.nombre), valor: habPrev.get(s(h.codigo || h.id)) ?? "" })),
      conclusiones: "", recomendaciones_trabajador: "", estado: "borrador",
    };
    return { c, dx: [] as Dx[], reposo: null as Reposo };
  }, [existente, consultaId, motor, trabajadorId]);

  const [c, setC] = useState<Fila>(inicial.c);
  const [dx, setDx] = useState<Dx[]>(inicial.dx);
  const [reposo, setReposo] = useState<Reposo>(inicial.reposo);
  const [idC, setIdC] = useState(consultaId); // tras el primer «Guardar», los siguientes actualizan la misma consulta
  const [verExamen, setVerExamen] = useState(false);
  const [q, setQ] = useState("");
  const [guardando, setGuardando] = useState<string | null>(null);
  const [aviso, setAviso] = useState<{ ok: boolean; t: string } | null>(null);
  const motivos = useMemo(() => items(motor, "motivo_consulta"), [motor]);
  const sugeridos = useMemo(() => (q.trim().length >= 2 ? buscarDiagnosticos(motor, q) : []), [motor, q]);

  if (!p) return <p className="text-sm text-muted-foreground">Paciente no encontrado en el teléfono.</p>;
  const campo = (k: string, v: unknown) => setC((x) => ({ ...x, [k]: v }));
  const signos = (c.signos_vitales ?? {}) as Record<string, string>;
  const examen = lista<Examen>(c.examen_fisico);
  const anormales = examen.filter((x) => x.valor !== x.normal).length;

  async function guardar(cerrar: boolean) {
    if (cerrar && !s(c.motivo_texto).trim() && !c.motivo_id) return setAviso({ ok: false, t: "Falta el motivo de la consulta" });
    if (cerrar && !dx.length) return setAviso({ ok: false, t: "Agrega al menos un diagnóstico para cerrar" });
    if (reposo && (!(Number(reposo.dias) >= 1) || !reposo.desde)) return setAviso({ ok: false, t: "Revisa los días y la fecha del reposo" });
    setGuardando(cerrar ? "cerrar" : "guardar"); setAviso(null);
    try {
      const ahoraIso = motor.reloj.iso();
      const t = p!.fila;
      const datos: Fila = {
        tipo: c.tipo, motivo_id: c.motivo_id || null, motivo_texto: c.motivo_texto, enfermedad_actual: c.enfermedad_actual,
        signos_vitales: c.signos_vitales, examen_fisico: c.examen_fisico, examen_funcional: c.examen_funcional,
        antecedentes: c.antecedentes, habitos: c.habitos, conclusiones: c.conclusiones, recomendaciones_trabajador: c.recomendaciones_trabajador,
        ...(cerrar ? { estado: "cerrada", hora_cierre: ahoraIso } : {}),
      };
      let id = idC;
      if (!id) {
        id = motor.insertar("clinico.consultas", {
          ...datos, id: crypto.randomUUID(), empresa_id: t.empresa_id, trabajador_id: trabajadorId, dependencia_id: t.dependencia_id ?? null,
          puesto_id: t.puesto_id ?? null, medico_id: uid, fecha: hoy, hora_inicio: ahoraIso, estado: cerrar ? "cerrada" : "borrador",
        }, uid);
        setIdC(id);
      } else motor.actualizar("clinico.consultas", id, datos, uid);

      // Diagnósticos: los quitados se borran, los nuevos se agregan, los cambiados se actualizan
      const antes = [...motor.tabla("clinico.diagnosticos").values()].filter((d) => d.consulta_id === id);
      for (const d of antes) if (!dx.some((x) => x.id === d.id)) motor.borrar("clinico.diagnosticos", s(d.id), uid);
      const nuevos = dx.map((d) => {
        const fila = { cie10: d.cie10, descripcion: d.descripcion, principal: d.principal, origen: d.origen };
        if (d.id && motor.tabla("clinico.diagnosticos").has(d.id)) { motor.actualizar("clinico.diagnosticos", d.id, fila, uid); return d; }
        return { ...d, id: motor.insertar("clinico.diagnosticos", { ...fila, id: crypto.randomUUID(), consulta_id: id }, uid) };
      });
      setDx(nuevos);

      // Reposo: uno por consulta
      const previo = reposoDeConsulta(motor, id!);
      if (reposo) {
        const fila = { desde: reposo.desde, hasta: sumarDias(reposo.desde, Number(reposo.dias) - 1), causa: reposo.causa,
                       cie10: (dx.find((d) => d.principal) ?? dx[0])?.cie10 ?? null };
        if (previo) motor.actualizar("clinico.reposos", s(previo.id), fila, uid);
        else motor.insertar("clinico.reposos", { ...fila, id: crypto.randomUUID(), consulta_id: id, trabajador_id: trabajadorId, ente_emisor: "servicio_medico" }, uid);
      } else if (previo) motor.borrar("clinico.reposos", s(previo.id), uid);

      await motor.persistir();
      motor.sincronizar().catch(() => {});
      if (cerrar) volver();
      else setAviso({ ok: true, t: "Guardado en el teléfono. Sube solo cuando haya señal." });
    } catch (e) {
      setAviso({ ok: false, t: (e as Error).message || "No se pudo guardar" });
    } finally {
      setGuardando(null);
    }
  }

  return (
    <div className="space-y-4 pb-[calc(6rem+env(safe-area-inset-bottom))]">
      <div className="flex items-center gap-2">
        <Button size="icon" variant="ghost" onClick={volver} aria-label="Volver"><ArrowLeft /></Button>
        <div className="min-w-0">
          <h2 className="truncate font-semibold">{existente ? "Consulta" : "Nueva consulta"} · {p.nombres} {p.apellidos}</h2>
          <p className="text-xs text-muted-foreground">{s(existente?.fecha) || hoy}{soloLectura ? " · firmada (solo lectura)" : ""}</p>
        </div>
      </div>

      <fieldset disabled={soloLectura || Boolean(guardando)} className="space-y-4">
        <Bloque titulo="Motivo">
          <div className="flex gap-2">
            {(["primera", "sucesiva"] as const).map((t) => (
              <button key={t} type="button" onClick={() => campo("tipo", t)}
                className={cn("flex-1 rounded-lg border px-3 py-2 text-sm capitalize", c.tipo === t && "border-primary bg-primary/10 font-medium text-primary")}>{t}</button>
            ))}
          </div>
          {motivos.length > 0 && (
            <select value={s(c.motivo_id)} onChange={(e) => campo("motivo_id", e.target.value || null)} className="h-11 w-full rounded-md border bg-background px-3 text-sm">
              <option value="">Tipo de consulta…</option>
              {motivos.map((m) => <option key={s(m.id)} value={s(m.id)}>{s(m.nombre)}</option>)}
            </select>
          )}
          <Etiqueta t="Motivo de consulta"><Textarea rows={2} value={s(c.motivo_texto)} onChange={(e) => campo("motivo_texto", e.target.value)} placeholder="¿Qué le pasa?" /></Etiqueta>
          <Etiqueta t="Enfermedad actual"><Textarea rows={3} value={s(c.enfermedad_actual)} onChange={(e) => campo("enfermedad_actual", e.target.value)} /></Etiqueta>
        </Bloque>

        <Bloque titulo="Signos vitales">
          <div className="grid grid-cols-3 gap-2">
            {SIGNOS.map((x) => (
              <label key={x.k} className="text-xs text-muted-foreground">{x.t}
                <Input inputMode={x.k === "ta" ? "text" : "decimal"} value={signos[x.k] ?? ""} placeholder={x.ph}
                  onChange={(e) => campo("signos_vitales", { ...signos, [x.k]: e.target.value })} className="mt-1 h-10" />
              </label>
            ))}
          </div>
        </Bloque>

        {examen.length > 0 && (
          <Bloque titulo={`Examen físico${anormales ? ` · ${anormales} con hallazgos` : " · todo normal"}`}>
            {!verExamen ? (
              <Button type="button" variant="outline" className="w-full" onClick={() => setVerExamen(true)}>Revisar o anotar hallazgos</Button>
            ) : (
              <div className="space-y-2">
                {examen.map((x, i) => (
                  <label key={x.clave} className="block text-xs text-muted-foreground">{x.nombre}
                    <Textarea rows={1} value={x.valor} onChange={(e) => campo("examen_fisico", examen.map((y, j) => (j === i ? { ...y, valor: e.target.value } : y)))}
                      className={cn("mt-1 min-h-9 text-sm", x.valor !== x.normal && "border-aviso")} />
                  </label>
                ))}
              </div>
            )}
          </Bloque>
        )}

        <Bloque titulo="Diagnósticos">
          {dx.map((d, i) => (
            <div key={d.cie10 + i} className="space-y-2 rounded-lg border p-2.5">
              <div className="flex items-start gap-2">
                <button type="button" aria-label="Principal" onClick={() => setDx(dx.map((y, j) => ({ ...y, principal: j === i })))}
                  className={cn("mt-0.5", d.principal ? "text-aviso" : "text-muted-foreground/40")}><Star className="size-4" fill={d.principal ? "currentColor" : "none"} /></button>
                <div className="min-w-0 flex-1 text-sm"><span className="font-mono text-xs">{d.cie10}</span> {d.descripcion}</div>
                <button type="button" aria-label="Quitar" onClick={() => setDx(dx.filter((_, j) => j !== i))} className="text-muted-foreground"><X className="size-4" /></button>
              </div>
              <div className="flex flex-wrap gap-1">
                {ORIGENES.map(([k, t]) => (
                  <button key={k} type="button" onClick={() => setDx(dx.map((y, j) => (j === i ? { ...y, origen: k } : y)))}
                    className={cn("rounded-full border px-2.5 py-0.5 text-xs", d.origen === k && "border-primary bg-primary/10 text-primary")}>{t}</button>
                ))}
              </div>
            </div>
          ))}
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar diagnóstico (código o palabras)" className="h-11" />
          {sugeridos.length > 0 && (
            <ul className="max-h-64 divide-y overflow-y-auto rounded-lg border">
              {sugeridos.map((x) => (
                <li key={x.cie10}>
                  <button type="button" className="flex w-full items-start gap-2 px-3 py-2 text-left text-sm active:bg-muted"
                    onClick={() => { setDx([...dx, { cie10: x.cie10, descripcion: x.descripcion, principal: !dx.length, origen: "comun" }]); setQ(""); }}>
                    <Plus className="mt-0.5 size-4 shrink-0 text-primary" />
                    <span><span className="font-mono text-xs">{x.cie10}</span> {x.descripcion}{x.usos ? <span className="text-xs text-muted-foreground"> · usado {x.usos}</span> : null}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Bloque>

        <Bloque titulo="Conducta">
          <Etiqueta t="Conclusiones"><Textarea rows={3} value={s(c.conclusiones)} onChange={(e) => campo("conclusiones", e.target.value)} /></Etiqueta>
          <Etiqueta t="Indicaciones al paciente"><Textarea rows={3} value={s(c.recomendaciones_trabajador)} onChange={(e) => campo("recomendaciones_trabajador", e.target.value)} /></Etiqueta>
        </Bloque>

        <Bloque titulo="Reposo">
          {!reposo ? (
            <Button type="button" variant="outline" className="w-full" onClick={() => setReposo({ dias: "1", desde: hoy, causa: "enfermedad_comun" })}><Plus /> Indicar reposo</Button>
          ) : (
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <label className="text-xs text-muted-foreground">Días
                  <Input inputMode="numeric" value={reposo.dias} onChange={(e) => setReposo({ ...reposo, dias: e.target.value.replace(/\D/g, "") })} className="mt-1 h-10" />
                </label>
                <label className="text-xs text-muted-foreground">Desde
                  <Input type="date" value={reposo.desde} onChange={(e) => setReposo({ ...reposo, desde: e.target.value })} className="mt-1 h-10" />
                </label>
              </div>
              <select value={reposo.causa} onChange={(e) => setReposo({ ...reposo, causa: e.target.value })} className="h-11 w-full rounded-md border bg-background px-3 text-sm">
                {CAUSAS.map(([k, t]) => <option key={k} value={k}>{t}</option>)}
              </select>
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Hasta {Number(reposo.dias) >= 1 && reposo.desde ? sumarDias(reposo.desde, Number(reposo.dias) - 1) : "—"}</span>
                <button type="button" className="text-alerta-texto" onClick={() => setReposo(null)}>Quitar reposo</button>
              </div>
            </div>
          )}
        </Bloque>
      </fieldset>

      {aviso && <p className={cn("rounded-lg px-3 py-2 text-sm", aviso.ok ? "bg-ok/10 text-ok-texto" : "bg-alerta/10 text-alerta-texto")} role="status">{aviso.t}</p>}
      {!soloLectura && (
        <div className="fixed inset-x-0 bottom-0 z-10 mx-auto grid max-w-xl grid-cols-2 gap-2 border-t bg-background/95 px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] backdrop-blur">
          <Button variant="outline" className="h-12" disabled={Boolean(guardando)} onClick={() => guardar(false)}>
            {guardando === "guardar" ? <Loader2 className="animate-spin" /> : null} Guardar
          </Button>
          <Button className="h-12" disabled={Boolean(guardando)} onClick={() => guardar(true)}>
            {guardando === "cerrar" ? <Loader2 className="animate-spin" /> : <Check />} Cerrar consulta
          </Button>
        </div>
      )}
      {!soloLectura && <p className="text-center text-xs text-muted-foreground">La firma se hace con señal, desde la app completa o la PC.</p>}
    </div>
  );
}

function Etiqueta({ t, children }: { t: string; children: React.ReactNode }) {
  return <label className="block space-y-1 text-xs text-muted-foreground"><span>{t}</span>{children}</label>;
}

function Bloque({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2.5 rounded-xl border bg-card p-4">
      <h3 className="text-sm font-semibold">{titulo}</h3>
      {children}
    </section>
  );
}
