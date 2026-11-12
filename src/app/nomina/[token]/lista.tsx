"use client";

import { useMemo, useState, useTransition } from "react";
import { Check, Loader2, Lock, Plus, Search, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MOTIVOS_SALIDA, type Agregado, type Marca, type MotivoSalida, type VistaDepuracion } from "@/lib/depurar-nomina";
import { cn } from "@/lib/utils";
import { agregar, enviar, marcar, marcarResto, quitar } from "./acciones";

type Filtro = "todos" | "pend" | "si" | "no";
const POR_PAGINA = 60;
const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

// Cada toque se guarda al momento (optimista: si falla, vuelve atrás y dice por qué). Nada se aplica a la nómina:
// es una propuesta que el servicio médico confirma.
export function ListaNomina({ token, vista }: { token: string; vista: VistaDepuracion }) {
  const [marcas, setMarcas] = useState<Record<string, Marca>>(vista.respuestas ?? {});
  const [agregados, setAgregados] = useState<Agregado[]>(vista.agregados ?? []);
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [q, setQ] = useState("");
  const [cuantos, setCuantos] = useState(POR_PAGINA);
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(0);
  const [enviado, setEnviado] = useState(Boolean(vista.enviado_en));
  const [enviando, iniciarEnvio] = useTransition();
  const [form, setForm] = useState({ nombres: "", apellidos: "", cedula: "", cargo: "", trampa: "" });
  const [agregando, iniciarAgregar] = useTransition();
  const [errorForm, setErrorForm] = useState("");

  const ids = useMemo(() => new Set(vista.trabajadores.map((t) => t.id)), [vista.trabajadores]);
  const total = vista.trabajadores.length;
  const siguen = Object.entries(marcas).filter(([id, m]) => ids.has(id) && m.e === "si").length;
  const noEstan = Object.entries(marcas).filter(([id, m]) => ids.has(id) && m.e === "no").length;
  const pendientes = total - siguen - noEstan;

  const visibles = useMemo(() => {
    const b = norm(q.trim());
    return vista.trabajadores.filter((t) => {
      const m = marcas[t.id]?.e;
      if (filtro === "pend" ? m : filtro !== "todos" && m !== filtro) return false;
      return !b || norm(`${t.nombre} ${t.cargo ?? ""} ${t.departamento ?? ""} ${t.ci}`).includes(b);
    });
  }, [vista.trabajadores, marcas, filtro, q]);

  async function guardar(cambio: () => void, deshacer: () => void, llamada: () => Promise<{ ok: boolean; mensaje: string }>) {
    cambio();
    setError("");
    setGuardando((n) => n + 1);
    try {
      const r = await llamada();
      if (!r.ok) { deshacer(); setError(r.mensaje); }
    } catch {
      deshacer();
      setError("No se guardó. Revise su conexión e inténtelo de nuevo.");
    } finally {
      setGuardando((n) => n - 1);
    }
  }

  function tocar(id: string, e: "si" | "no") {
    const antes = marcas[id];
    const nueva: Marca | undefined = antes?.e === e ? undefined : { e };
    void guardar(
      () => setMarcas((m) => { const c = { ...m }; if (nueva) c[id] = nueva; else delete c[id]; return c; }),
      () => setMarcas((m) => { const c = { ...m }; if (antes) c[id] = antes; else delete c[id]; return c; }),
      () => marcar(token, id, nueva?.e ?? null, null),
    );
  }

  function motivo(id: string, m: MotivoSalida) {
    const antes = marcas[id];
    const nuevo: MotivoSalida | undefined = antes?.m === m ? undefined : m;
    void guardar(
      () => setMarcas((x) => ({ ...x, [id]: { e: "no", ...(nuevo ? { m: nuevo } : {}) } })),
      () => setMarcas((x) => ({ ...x, [id]: antes })),
      () => marcar(token, id, "no", nuevo ?? null),
    );
  }

  function resto() {
    const antes = marcas;
    void guardar(
      () => setMarcas((m) => { const c = { ...m }; for (const t of vista.trabajadores) if (!c[t.id]) c[t.id] = { e: "si" }; return c; }),
      () => setMarcas(antes),
      () => marcarResto(token),
    );
  }

  function quitarAgregado(id: string) {
    const antes = agregados;
    void guardar(() => setAgregados((a) => a.filter((x) => x.id !== id)), () => setAgregados(antes), () => quitar(token, id));
  }

  function enviarForm(ev: React.FormEvent) {
    ev.preventDefault();
    setErrorForm("");
    if (form.nombres.trim().length < 2 || form.apellidos.trim().length < 2) { setErrorForm("Escriba nombres y apellidos."); return; }
    iniciarAgregar(async () => {
      const r = await agregar(token, form);
      if (!r.ok) { setErrorForm(r.mensaje); return; }
      if (r.agregados) setAgregados(r.agregados);
      else setAgregados((a) => [...a, { id: crypto.randomUUID(), nombres: form.nombres.trim(), apellidos: form.apellidos.trim(), cedula: form.cedula.replace(/\D/g, "") || undefined, cargo: form.cargo.trim() || undefined }]);
      setForm({ nombres: "", apellidos: "", cedula: "", cargo: "", trampa: "" });
    });
  }

  const nombreServicio = vista.servicio.split(" ")[0] || "el servicio médico";

  return (
    <>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] lg:items-start">
        <section className="min-w-0 rounded-2xl border bg-card p-4 shadow-sm sm:p-5">
          <div className="grid grid-cols-4 gap-2 text-center">
            {([["Registrados", total, "bg-muted", ""], ["Siguen", siguen, "bg-ok/10", "text-ok-texto"], ["Ya no están", noEstan, "bg-alerta/10", "text-alerta-texto"], ["Sin revisar", pendientes, "bg-muted", ""]] as const).map(([t, n, fondo, color]) => (
              <div key={t} className={cn("rounded-xl px-1 py-2", fondo)}>
                <b className={cn("block text-xl tabular-nums", color)}>{n}</b>
                <span className="text-[11px] leading-tight text-muted-foreground sm:text-xs">{t}</span>
              </div>
            ))}
          </div>
          <div className="mt-3 flex h-2 overflow-hidden rounded-full bg-muted" aria-hidden>
            <i className="bg-ok transition-all" style={{ width: `${total ? (siguen / total) * 100 : 0}%` }} />
            <i className="bg-alerta transition-all" style={{ width: `${total ? (noEstan / total) * 100 : 0}%` }} />
          </div>
          <p className="mt-1.5 text-xs text-muted-foreground" aria-live="polite">
            {pendientes ? `Faltan ${pendientes} por revisar · ${total - pendientes} de ${total} listos` : "¡Listo! Ya revisó a todos."}
          </p>

          <div className="relative mt-4">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => { setQ(e.target.value); setCuantos(POR_PAGINA); }} placeholder="Buscar por nombre, cédula o cargo" className="h-11 pl-9 text-base sm:text-sm" />
          </div>
          <div className="mt-2.5 flex gap-1.5 overflow-x-auto pb-1">
            {([["todos", `Todos ${total}`], ["pend", `Sin revisar ${pendientes}`], ["si", `Siguen ${siguen}`], ["no", `Ya no están ${noEstan}`]] as const).map(([f, t]) => (
              <button key={f} type="button" onClick={() => { setFiltro(f); setCuantos(POR_PAGINA); }} aria-pressed={filtro === f}
                className="min-h-9 shrink-0 rounded-full border bg-background px-3 text-sm aria-pressed:border-foreground aria-pressed:bg-foreground aria-pressed:text-background">
                {t}
              </button>
            ))}
          </div>

          <ul className="mt-1 divide-y">
            {visibles.slice(0, cuantos).map((t) => {
              const m = marcas[t.id];
              return (
                <li key={t.id} className="flex items-start gap-3 py-3 sm:items-center">
                  <div className="min-w-0 flex-1">
                    <p className={cn("font-medium", m?.e === "no" && "text-muted-foreground line-through")}>{t.nombre}</p>
                    <p className="text-xs text-muted-foreground">{[t.cargo, t.departamento, `C.I. …${t.ci}`].filter(Boolean).join(" · ")}</p>
                    {m?.e === "no" && (
                      <div className="mt-1.5 flex flex-wrap gap-1.5" role="group" aria-label="Motivo (opcional)">
                        {MOTIVOS_SALIDA.map((x) => (
                          <button key={x} type="button" onClick={() => motivo(t.id, x)} aria-pressed={m.m === x}
                            className="min-h-8 rounded-full border bg-background px-2.5 text-xs aria-pressed:border-alerta aria-pressed:bg-alerta/10 aria-pressed:text-alerta-texto">
                            {x}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-col gap-1.5 sm:flex-row">
                    <button type="button" onClick={() => tocar(t.id, "si")} aria-pressed={m?.e === "si"}
                      className="h-10 w-28 rounded-lg border bg-background text-sm font-semibold aria-pressed:border-ok aria-pressed:bg-ok aria-pressed:text-white sm:w-24">
                      Sigue
                    </button>
                    <button type="button" onClick={() => tocar(t.id, "no")} aria-pressed={m?.e === "no"}
                      className="h-10 w-28 rounded-lg border bg-background text-sm font-semibold aria-pressed:border-alerta aria-pressed:bg-alerta aria-pressed:text-white">
                      Ya no está
                    </button>
                  </div>
                </li>
              );
            })}
            {!visibles.length && <li className="py-6 text-center text-sm text-muted-foreground">Nadie con ese filtro.</li>}
          </ul>
          {visibles.length > cuantos && (
            <Button variant="outline" className="mt-2 w-full" onClick={() => setCuantos((n) => n + POR_PAGINA)}>
              Ver {Math.min(POR_PAGINA, visibles.length - cuantos)} más (quedan {visibles.length - cuantos})
            </Button>
          )}
          {pendientes > 0 && (
            <Button variant="secondary" className="mt-3 h-11 w-full whitespace-normal text-primary" onClick={resto}>
              Marcar los {pendientes} que quedan sin revisar como «Sigue»
            </Button>
          )}
        </section>

        <section className="min-w-0 rounded-2xl border bg-card p-4 shadow-sm sm:p-5 lg:sticky lg:top-4">
          <h2 className="text-lg font-semibold">¿Falta alguien?</h2>
          <p className="mb-3 text-sm text-muted-foreground">Si trabaja en la empresa y no está en la lista, agréguelo. Le programaremos su evaluación.</p>
          <form onSubmit={enviarForm} className="space-y-3">
            <input type="text" name="sitio_web" tabIndex={-1} autoComplete="off" aria-hidden className="hidden" value={form.trampa} onChange={(e) => setForm({ ...form, trampa: e.target.value })} />
            <div className="grid grid-cols-2 gap-2.5">
              <Etiqueta texto="Nombres"><Input value={form.nombres} onChange={(e) => setForm({ ...form, nombres: e.target.value })} maxLength={80} autoComplete="off" className="h-11 text-base sm:text-sm" /></Etiqueta>
              <Etiqueta texto="Apellidos"><Input value={form.apellidos} onChange={(e) => setForm({ ...form, apellidos: e.target.value })} maxLength={80} autoComplete="off" className="h-11 text-base sm:text-sm" /></Etiqueta>
              <Etiqueta texto="Cédula" nota="si la tiene"><Input value={form.cedula} onChange={(e) => setForm({ ...form, cedula: e.target.value })} inputMode="numeric" maxLength={14} autoComplete="off" className="h-11 text-base sm:text-sm" /></Etiqueta>
              <Etiqueta texto="Cargo" nota="opcional"><Input value={form.cargo} onChange={(e) => setForm({ ...form, cargo: e.target.value })} maxLength={80} autoComplete="off" className="h-11 text-base sm:text-sm" /></Etiqueta>
            </div>
            {errorForm && <p className="text-sm text-alerta-texto" role="alert">{errorForm}</p>}
            <Button type="submit" className="h-11 w-full" disabled={agregando}>
              {agregando ? <Loader2 className="animate-spin" /> : <Plus />} Agregar a la lista
            </Button>
          </form>
          {agregados.length > 0 && (
            <div className="mt-4 space-y-2">
              <p className="text-sm font-semibold text-info-texto">{agregados.length} {agregados.length === 1 ? "agregado" : "agregados"}</p>
              {agregados.map((a) => (
                <div key={a.id} className="flex items-center gap-3 rounded-xl bg-info/10 px-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{a.nombres} {a.apellidos}</p>
                    <p className="text-xs text-muted-foreground">{[a.cedula ? `C.I. ${a.cedula}` : "Sin cédula", a.cargo].filter(Boolean).join(" · ")}</p>
                  </div>
                  <button type="button" onClick={() => quitarAgregado(a.id)} className="min-h-10 px-2 text-sm font-semibold text-alerta-texto">Quitar</button>
                </div>
              ))}
            </div>
          )}
          <p className="mt-4 flex gap-2 text-xs text-muted-foreground"><Lock className="size-3.5 shrink-0 translate-y-0.5" /> Solo vemos nombre, cargo y los últimos 4 números de la cédula. Ningún dato médico.</p>
        </section>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-10 border-t bg-background/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 sm:flex-row sm:items-center">
          <p className="flex-1 text-xs text-muted-foreground" aria-live="polite">
            {error ? <span className="font-medium text-alerta-texto">{error}</span>
              : guardando ? <span className="inline-flex items-center gap-1"><Loader2 className="size-3.5 animate-spin" /> Guardando…</span>
              : enviado ? <span className="inline-flex items-center gap-1 font-medium text-ok-texto"><Check className="size-3.5" /> Enviado. Puede corregir hasta que venza el enlace.</span>
              : <span className="inline-flex items-center gap-1"><Check className="size-3.5 text-ok-texto" /> Guardado. Puede corregir hasta que venza el enlace.</span>}
          </p>
          <Button className="h-11 sm:min-w-56" disabled={enviando || guardando > 0}
            onClick={() => iniciarEnvio(async () => { const r = await enviar(token); if (r.ok) { setEnviado(true); setError(""); } else setError(r.mensaje); })}>
            {enviando ? <Loader2 className="animate-spin" /> : <Send />} {enviado ? "Enviar de nuevo" : `Enviar a ${nombreServicio}`}
          </Button>
        </div>
      </div>
    </>
  );
}

function Etiqueta({ texto, nota, children }: { texto: string; nota?: string; children: React.ReactNode }) {
  return (
    <label className="block min-w-0 space-y-1">
      <span className="text-sm font-medium">{texto}{nota && <span className="font-normal text-muted-foreground"> ({nota})</span>}</span>
      {children}
    </label>
  );
}
