"use client";

import { useState, useTransition } from "react";
import { AlertTriangle, CheckCircle2, ChevronDown, Clock, Eraser, Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { cambiarPlazo, limpiarAhora } from "./acciones";
import { borrados, NUNCA, peso, TEXTOS, type EstadoLimpieza, type Regla } from "./reglas";

const OPCIONES = [0, 1, 3, 7, 15, 30, 60, 90, 180, 365, 730, 1095, 1825];
const LIMITE_MB = 500;
const fechaHora = (iso: string) => new Intl.DateTimeFormat("es-VE", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Caracas" }).format(new Date(iso));

function textoDias(d: number) {
  if (d === 0) return "Al vencer";
  if (d % 365 === 0) return `${d / 365} año${d === 365 ? "" : "s"}`;
  return `${d} día${d === 1 ? "" : "s"}`;
}

export function PantallaLimpieza({ estado }: { estado: EstadoLimpieza }) {
  const [confirmar, setConfirmar] = useState(false);
  const [resultado, setResultado] = useState<{ ok: boolean; texto: string } | null>(null);
  const [ocupado, iniciar] = useTransition();
  // Los PDF del trabajador comparten plazo con los de envíos: se suman en esa fila
  const reglas = estado.reglas.map((r) => r.clave === "pdf_enlaces" && estado.pdf_trabajador
    ? { ...r, cantidad: r.cantidad + estado.pdf_trabajador.cantidad, bytes: (r.bytes ?? 0) + (estado.pdf_trabajador.bytes ?? 0) } : r);
  const pendientes = reglas.filter((r) => r.cantidad > 0);
  const totalBytes = pendientes.reduce((s, r) => s + (r.bytes ?? 0), 0);
  const uso = Math.min(100, (estado.base_mb / LIMITE_MB) * 100);

  const limpiar = () => iniciar(async () => {
    const r = await limpiarAhora();
    setConfirmar(false);
    if (!r.ok) { setResultado({ ok: false, texto: r.mensaje }); return; }
    const total = borrados(r.resultado ?? {});
    setResultado({ ok: true, texto: total ? `Listo: se borraron ${total} elemento${total === 1 ? "" : "s"} temporal${total === 1 ? "" : "es"}.` : "Listo: no había nada que borrar." });
  });

  return (
    <div className="space-y-6">
      {/* Resumen: espacio y lo que hay para limpiar */}
      <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-xl border bg-card p-4 sm:col-span-2">
          <div className="flex items-baseline justify-between text-sm">
            <span className="font-medium">Espacio de la base en la nube</span>
            <span className="tabular-nums text-muted-foreground">{estado.base_mb.toLocaleString("es-VE")} MB de {LIMITE_MB} MB</span>
          </div>
          <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-muted" role="meter" aria-valuemin={0} aria-valuemax={LIMITE_MB} aria-valuenow={estado.base_mb} aria-label="Espacio usado">
            <div className={cn("h-full rounded-full", uso > 80 ? "bg-alerta" : uso > 60 ? "bg-aviso" : "bg-primary")} style={{ width: `${uso}%` }} />
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            {uso < 60 ? "Hay espacio de sobra." : uso < 80 ? "Más de la mitad usado: conviene revisar." : "Casi lleno: revisa qué ocupa espacio o escríbenos."}
            {" "}La mayor parte son historias y consultas, que nunca se borran.
          </p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <div className="text-sm font-medium">Última limpieza</div>
          {estado.ultima ? (
            <p className="mt-1 text-sm text-muted-foreground"><Clock className="mr-1 inline size-3.5" />{fechaHora(estado.ultima.en)} · {estado.ultima.automatica ? "automática" : "a mano"}</p>
          ) : (
            <p className="mt-1 text-sm text-muted-foreground">Todavía ninguna. La automática corre cada madrugada a las 5:27.</p>
          )}
          {(estado.historial?.length ?? 0) > 0 && (
            <details className="group mt-2 text-xs">
              <summary className="flex cursor-pointer list-none items-center gap-1 font-medium text-primary hover:underline">
                Ver historial <ChevronDown className="size-3 transition group-open:rotate-180" />
              </summary>
              <ul className="mt-1.5 space-y-1 text-muted-foreground">
                {estado.historial!.map((h) => (
                  <li key={h.en} className="flex justify-between gap-2">
                    <span>{fechaHora(h.en)} · {h.automatica ? "automática" : "a mano"}</span>
                    <span className="tabular-nums">{borrados(h.resultado)}</span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      </section>

      {/* Botón principal */}
      <section className="rounded-xl border bg-card p-4">
        {!confirmar ? (
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex-1 text-sm">
              {pendientes.length
                ? <>Ahora hay <b>{pendientes.reduce((s, r) => s + r.cantidad, 0)}</b> elementos temporales para borrar{totalBytes ? <> ({peso(totalBytes)})</> : null}.</>
                : <>Todo al día: no hay nada temporal para borrar.</>}
            </div>
            <Button disabled={ocupado || estado.local || !pendientes.length} onClick={() => { setResultado(null); setConfirmar(true); }}>
              <Eraser /> Limpiar ahora
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm font-medium">Se borrará para siempre:</p>
            <ul className="space-y-1 text-sm">
              {pendientes.map((r) => (
                <li key={r.clave} className="flex justify-between gap-3">
                  <span>{TEXTOS[r.clave]?.titulo ?? r.clave}</span>
                  <span className="tabular-nums text-muted-foreground">{r.cantidad}{r.bytes ? ` · ${peso(r.bytes)}` : ""}</span>
                </li>
              ))}
            </ul>
            <p className="text-xs text-muted-foreground">No toca historias, consultas, trabajadores ni nada de la lista de abajo.</p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button variant="outline" disabled={ocupado} onClick={() => setConfirmar(false)}>Cancelar</Button>
              <Button disabled={ocupado} onClick={limpiar} className="bg-alerta text-white hover:bg-alerta/90">{ocupado ? <Loader2 className="animate-spin" /> : <Eraser />} Sí, borrar</Button>
            </div>
          </div>
        )}
        {estado.local && <p className="mt-2 text-xs text-muted-foreground">Sin internet: la limpieza se hace en la nube cuando vuelva la conexión.</p>}
        {resultado && (
          <p role="status" className={cn("mt-3 flex items-center gap-1.5 text-sm", resultado.ok ? "text-ok-texto" : "text-alerta-texto")}>
            {resultado.ok ? <CheckCircle2 className="size-4" /> : <AlertTriangle className="size-4" />} {resultado.texto}
          </p>
        )}
      </section>

      {/* Reglas con su plazo */}
      <section className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-[.08em] text-foreground/80">Qué se borra solo y cuándo</h2>
        <ul className="divide-y rounded-xl border bg-card">
          {reglas.map((r) => <FilaRegla key={r.clave} regla={r} />)}
        </ul>
      </section>

      {/* Lo que nunca se toca */}
      <section className="rounded-xl border border-ok/30 bg-ok/5 p-4">
        <h2 className="flex items-center gap-2 text-sm font-semibold"><ShieldCheck className="size-4 text-ok-texto" /> Esto nunca se borra solo</h2>
        <ul className="mt-2 grid grid-cols-1 gap-1 text-sm text-muted-foreground sm:grid-cols-2">
          {NUNCA.map((n) => <li key={n}>• {n}</li>)}
        </ul>
      </section>
    </div>
  );
}

function FilaRegla({ regla }: { regla: Regla }) {
  const t = TEXTOS[regla.clave];
  const [dias, setDias] = useState(regla.dias);
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  const [ocupado, iniciar] = useTransition();
  const opciones = [...new Set([...OPCIONES, regla.dias])].filter((d) => d >= regla.minimo && d <= regla.maximo).sort((a, b) => a - b);
  const guardar = (d: number) => {
    const antes = dias;
    setDias(d);
    iniciar(async () => {
      const r = await cambiarPlazo(regla.clave, d);
      if (!r.ok) setDias(antes);
      setMsg({ ok: r.ok, texto: r.mensaje });
    });
  };
  return (
    <li className="flex flex-col gap-2 p-4 sm:flex-row sm:items-start sm:gap-4">
      <div className="flex-1 space-y-0.5">
        <div className="font-medium">{t?.titulo ?? regla.clave}</div>
        <p className="text-sm text-muted-foreground">{t?.que}</p>
        <p className="text-xs text-muted-foreground">
          Se borra {t ? t.plazo(dias) : `a los ${dias} días`}.
          {regla.cantidad > 0 ? <> Ahora hay <b className="text-foreground">{regla.cantidad}</b>{regla.bytes ? ` (${peso(regla.bytes)})` : ""}.</> : " Ahora no hay ninguno."}
        </p>
        {msg && <p className={cn("text-xs", msg.ok ? "text-ok-texto" : "text-alerta-texto")}>{msg.texto}</p>}
      </div>
      <label className="flex shrink-0 flex-col gap-0.5 text-xs text-muted-foreground">
        Plazo
        <select value={dias} disabled={ocupado} onChange={(e) => guardar(Number(e.target.value))} aria-label={`Plazo de ${t?.titulo ?? regla.clave}`}
          className="h-9 w-36 rounded-md border bg-background px-2 text-sm text-foreground">
          {opciones.map((d) => <option key={d} value={d}>{textoDias(d)}</option>)}
        </select>
      </label>
    </li>
  );
}
