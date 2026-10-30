"use client";

import { useMemo, useState } from "react";
import { BellRing, Check, FlaskConical, Loader2, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { AlertaClinica, ParaclinicoPedido } from "@/lib/alertas-tipos";
import type { Item } from "@/lib/listas";
import { cn } from "@/lib/utils";
import { crearAlerta, revisarAlerta } from "../acciones";

const fechaCorta = (iso: string) => iso.split("-").reverse().join("/");
const plano = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim();

// Franja ámbar arriba de los pasos: lo que se dejó para revisar en esta evaluación. Siempre la primera franja.
export function FranjaAlertas({ alertas, consultaId, hoy, puedeRevisar, conResultado, onCambio }: {
  alertas: AlertaClinica[];
  consultaId: string;
  hoy: string; // del servidor (Caracas), nunca el de Windows
  puedeRevisar: boolean;
  // Paraclínicos con resultado en esta consulta (nombre sin acentos): se marcan con ✓
  conResultado: Set<string>;
  onCambio: (a: AlertaClinica) => void;
}) {
  const pendientes = alertas.filter((a) => a.estado === "pendiente" && a.consultaId !== consultaId);
  const revisadasHoy = alertas.filter((a) => a.estado !== "pendiente" && a.revisadaEnConsulta === consultaId);
  if (!pendientes.length && !revisadasHoy.length) return null;
  return (
    <div className="mt-2 space-y-1.5">
      {pendientes.length > 0 && (
        <section aria-label="Alertas para esta evaluación" className="space-y-2 rounded-lg border border-aviso/40 bg-aviso/10 px-3 py-2 text-sm">
          {pendientes.map((a) => <Alerta key={a.id} a={a} consultaId={consultaId} hoy={hoy} puedeRevisar={puedeRevisar} conResultado={conResultado} onCambio={onCambio} />)}
        </section>
      )}
      {revisadasHoy.map((a) => (
        <p key={a.id} className="flex items-start gap-2 px-1 text-xs text-muted-foreground">
          <Check className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          <span className="min-w-0">
            {a.estado === "descartada" ? "Descartada" : a.automatica ? "Cerrada sola" : "Revisada"} hoy · {a.texto || a.paraclinicos.map((p) => p.nombre).join(", ")}
            {a.respuesta && <> · <span className="text-foreground/80">{a.respuesta}</span></>}
          </span>
        </p>
      ))}
    </div>
  );
}

function Alerta({ a, consultaId, hoy, puedeRevisar, conResultado, onCambio }: {
  a: AlertaClinica; consultaId: string; hoy: string; puedeRevisar: boolean; conResultado: Set<string>; onCambio: (a: AlertaClinica) => void;
}) {
  const [verTodo, setVerTodo] = useState(false);
  const [abierta, setAbierta] = useState(false);
  const [respuesta, setRespuesta] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const largo = a.texto.length > 180;

  async function guardar(descartar: boolean) {
    setGuardando(true);
    setError("");
    const r = await revisarAlerta(a.id, consultaId, respuesta, descartar);
    setGuardando(false);
    if (!r.ok) return setError(r.mensaje);
    onCambio({ ...a, estado: descartar ? "descartada" : "revisada", respuesta: respuesta.trim() || null, revisadaEnConsulta: consultaId, automatica: false });
  }

  return (
    <div className="flex items-start gap-2">
      <BellRing className="mt-0.5 size-4 shrink-0 text-aviso-texto" aria-hidden />
      <div className="min-w-0 flex-1 space-y-1">
        <p>
          <span className="font-medium text-aviso-texto">Nota del {fechaCorta(a.creadaEl)}{a.autor && ` · ${a.autor}`}:</span>{" "}
          {a.texto && <span className={cn(!verTodo && "line-clamp-3")}>{a.texto}</span>}
          {largo && (
            <button type="button" className="ml-1 text-xs font-medium text-primary hover:underline" onClick={() => setVerTodo((v) => !v)}>
              {verTodo ? "Ver menos" : "Ver todo"}
            </button>
          )}
        </p>
        {a.paraclinicos.length > 0 && (
          <p className="flex flex-wrap items-center gap-1.5">
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><FlaskConical className="size-3.5" aria-hidden /> Pedir al paciente:</span>
            {a.paraclinicos.map((p) => {
              const listo = conResultado.has(plano(p.nombre));
              return (
                <span key={p.id + p.nombre} className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs",
                  listo ? "border-ok/40 bg-ok/10 text-ok-texto" : "bg-background")}>
                  {listo && <Check className="size-3" aria-hidden />}{p.nombre}{listo && <span className="sr-only"> (con resultado)</span>}
                </span>
              );
            })}
          </p>
        )}
        {a.revisarAntes && (
          <p className={cn("text-xs", a.revisarAntes <= hoy ? "font-medium text-alerta-texto" : "text-muted-foreground")}>
            {a.revisarAntes < hoy ? `Vencida: revisar antes del ${fechaCorta(a.revisarAntes)}` : a.revisarAntes === hoy ? "Vence hoy" : `Revisar antes del ${fechaCorta(a.revisarAntes)}`}
          </p>
        )}
        {abierta && (
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Input autoFocus value={respuesta} maxLength={500} onChange={(e) => setRespuesta(e.target.value)} placeholder="Qué se hizo (opcional)"
              aria-label="Qué se hizo" className="h-8 min-w-0 flex-1 basis-56 bg-background"
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void guardar(false); } if (e.key === "Escape") setAbierta(false); }} />
            <Button type="button" size="sm" className="h-8" disabled={guardando} onClick={() => guardar(false)}>
              {guardando ? <Loader2 className="animate-spin" /> : <Check />} Confirmar
            </Button>
            <Button type="button" size="sm" variant="ghost" className="h-8 text-muted-foreground" disabled={guardando} onClick={() => guardar(true)}>Ya no aplica</Button>
            <Button type="button" size="icon" variant="ghost" className="size-8" aria-label="Cancelar" onClick={() => setAbierta(false)}><X /></Button>
          </div>
        )}
        {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
      </div>
      {!abierta && (puedeRevisar ? (
        <Button type="button" size="sm" variant="outline" className="h-7 shrink-0 bg-background" onClick={() => setAbierta(true)}><Check /> Revisado</Button>
      ) : (
        <span className="shrink-0 text-xs text-muted-foreground">La revisa el médico</span>
      ))}
    </div>
  );
}

// Las que se dejaron en ESTA consulta para la próxima: línea gris, para saber que quedó guardada
export function AlertasDejadas({ alertas, consultaId }: { alertas: AlertaClinica[]; consultaId: string }) {
  const dejadas = alertas.filter((a) => a.consultaId === consultaId);
  if (!dejadas.length) return null;
  return (
    <div className="mt-2 space-y-1">
      {dejadas.map((a) => (
        <p key={a.id} className="flex items-start gap-2 px-1 text-xs text-muted-foreground">
          <BellRing className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          <span className="min-w-0 line-clamp-2">
            Para la próxima evaluación: {[a.texto, a.paraclinicos.length ? `pedir ${a.paraclinicos.map((p) => p.nombre).join(", ")}` : ""].filter(Boolean).join(" · ")}
            {a.revisarAntes && ` · antes del ${fechaCorta(a.revisarAntes)}`}
          </span>
        </p>
      ))}
    </div>
  );
}

// Ventana para dejar la alerta: qué revisar, paraclínicos del catálogo y fecha opcional
export function NuevaAlerta({ abierta, onCerrar, consultaId, paraclinicos, hoy, onCreada }: {
  abierta: boolean;
  onCerrar: () => void;
  consultaId: string;
  paraclinicos: Item[];
  hoy: string;
  onCreada: (a: AlertaClinica) => void;
}) {
  const [texto, setTexto] = useState("");
  const [elegidos, setElegidos] = useState<ParaclinicoPedido[]>([]);
  const [filtro, setFiltro] = useState("");
  const [fecha, setFecha] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const opciones = useMemo(() => {
    const f = plano(filtro);
    if (!f) return [];
    return paraclinicos.filter((p) => plano(p.nombre).includes(f) && !elegidos.some((e) => e.id === p.id)).slice(0, 8);
  }, [filtro, paraclinicos, elegidos]);

  async function guardar() {
    setGuardando(true);
    setError("");
    const r = await crearAlerta(consultaId, texto, elegidos, fecha || null);
    setGuardando(false);
    if (!r.ok || !r.id) return setError(r.mensaje);
    onCreada({ id: r.id, texto: texto.trim(), paraclinicos: elegidos, revisarAntes: fecha || null, estado: "pendiente", respuesta: null,
      creadaEl: hoy, autor: null, consultaId, revisadaEnConsulta: null, automatica: false });
    setTexto(""); setElegidos([]); setFiltro(""); setFecha("");
    onCerrar();
  }

  return (
    <Dialog open={abierta} onOpenChange={(v) => !v && onCerrar()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader className="text-left">
          <DialogTitle className="flex items-center gap-2"><BellRing className="size-5 text-aviso-texto" aria-hidden /> Alerta para la próxima evaluación</DialogTitle>
          <DialogDescription>Sale arriba de la próxima consulta de este trabajador hasta que el médico la marque revisada. Solo la ve el personal de salud.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <label className="block space-y-1 text-sm">
            <span className="font-medium">Qué revisar</span>
            <Textarea value={texto} maxLength={500} rows={3} autoFocus onChange={(e) => setTexto(e.target.value)} placeholder="Ej.: verificar la lesión infectada del pie derecho" />
          </label>
          <div className="space-y-1 text-sm">
            <span className="font-medium">Paraclínicos indicados: pedir al paciente</span>
            {elegidos.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {elegidos.map((p) => (
                  <span key={p.id} className="inline-flex items-center gap-1 rounded-full border bg-muted px-2 py-0.5 text-xs">
                    {p.nombre}
                    <button type="button" aria-label={`Quitar ${p.nombre}`} onClick={() => setElegidos((x) => x.filter((e) => e.id !== p.id))}><X className="size-3" /></button>
                  </span>
                ))}
              </div>
            )}
            <div className="relative">
              <Input value={filtro} onChange={(e) => setFiltro(e.target.value)} placeholder="Busca en el catálogo: hematología, glicemia…" aria-label="Buscar paraclínico" />
              {opciones.length > 0 && (
                <ul className="absolute z-50 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border bg-popover py-1 shadow-lg">
                  {opciones.map((p) => (
                    <li key={p.id}>
                      <button type="button" className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-primary/10"
                        onClick={() => { setElegidos((x) => [...x, { id: p.id, nombre: p.nombre }]); setFiltro(""); }}>
                        <Plus className="size-3.5 text-primary" aria-hidden /> {p.nombre}
                        {p.grupo && <span className="ml-auto text-xs text-muted-foreground">{p.grupo}</span>}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <p className="text-xs text-muted-foreground">Si solo pides paraclínicos, la alerta se cierra sola cuando cargues los resultados.</p>
          </div>
          <label className="block space-y-1 text-sm">
            <span className="font-medium">Revisar antes del <span className="font-normal text-muted-foreground">(opcional: avisa en la campana)</span></span>
            <Input type="date" value={fecha} min={hoy} max="2099-12-31" onChange={(e) => setFecha(e.target.value)} className="w-full sm:w-48" />
          </label>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onCerrar}>Cancelar</Button>
          <Button type="button" disabled={guardando || (!texto.trim() && !elegidos.length)} onClick={guardar}>
            {guardando ? <Loader2 className="animate-spin" /> : <BellRing />} Guardar alerta
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
