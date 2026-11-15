"use client";

import { useEffect, useState } from "react";
import { Check, Clock, Hourglass, Loader2, Mic, MessageCircle, Pencil, Phone, Send, ShieldCheck, Video } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { abrirEnVentana } from "@/lib/escritorio";
import { enlaceWhatsApp } from "@/lib/mensajes";
import { MEDIOS, NOMBRE_MEDIO, type EnSala, type Medio, type Teleconsulta } from "@/lib/telemedicina-tipos";
import { cn } from "@/lib/utils";
import { enlaceConsentimiento, guardarTeleconsulta } from "../telemedicina-acciones";

// El menú «…» de la consulta abre este panel sin recargar la página (lo escrito en la consulta no se pierde)
export const EVENTO_DISTANCIA = "zamorapp:consulta-a-distancia";

const ICONO: Record<Medio, typeof Phone> = { llamada: Phone, videollamada: Video, whatsapp: MessageCircle, nota_voz: Mic };
const fechaCorta = (iso: string) => iso.slice(0, 10).split("-").reverse().join("/");
const horaCaracas = (iso: string) =>
  new Intl.DateTimeFormat("es-VE", { timeZone: "America/Caracas", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
const DURACIONES = [5, 10, 15, 20, 30];

// Sala de Jitsi con nombre imposible de adivinar (el enlace es la llave de la sala)
function salaJitsi() {
  const b = new Uint8Array(12);
  crypto.getRandomValues(b);
  return `https://meet.jit.si/zamorapp-${Array.from(b, (x) => x.toString(36).padStart(2, "0")).join("").slice(0, 20)}`;
}

export function ConsultaADistancia({ consultaId, paciente, telefonoFicha, inicial, salaInicial, firmada, abrirAlCargar, plazoDias, puedeEditar }: {
  consultaId: string;
  paciente: string;
  telefonoFicha: string | null;
  inicial: Teleconsulta | null;
  salaInicial: EnSala | null;
  firmada: boolean;
  abrirAlCargar: boolean;
  plazoDias: number;
  puedeEditar: boolean;
}) {
  const [tele, setTele] = useState(inicial);
  const [sala, setSala] = useState(salaInicial);
  const [abierto, setAbierto] = useState(abrirAlCargar && puedeEditar);

  useEffect(() => {
    const abrir = () => setAbierto(true);
    window.addEventListener(EVENTO_DISTANCIA, abrir);
    return () => window.removeEventListener(EVENTO_DISTANCIA, abrir);
  }, []);

  return (
    <>
      {tele && <Resumen tele={tele} sala={sala} onEditar={puedeEditar ? () => setAbierto(true) : undefined} />}
      {abierto && (
        <Formulario consultaId={consultaId} paciente={paciente} telefonoFicha={telefonoFicha} tele={tele} sala={sala} firmada={firmada} plazoDias={plazoDias}
          onCerrar={() => setAbierto(false)} onGuardada={(t, s) => { setTele(t); setSala(s); }} onConsentimiento={(t) => setTele(t)} />
      )}
    </>
  );
}

function Consent({ tele }: { tele: Teleconsulta }) {
  if (tele.consentimiento === "escrito")
    return <span className="inline-flex items-center gap-1 text-ok-texto"><ShieldCheck className="size-4" aria-hidden /> Aceptó por escrito{tele.consentimientoEn && ` · ${horaCaracas(tele.consentimientoEn)}`}</span>;
  if (tele.consentimiento === "verbal")
    return <span className="inline-flex items-center gap-1"><Check className="size-4" aria-hidden /> Aceptó de palabra{tele.consentimientoEn && ` · ${horaCaracas(tele.consentimientoEn)}`}</span>;
  return <span className="inline-flex items-center gap-1 text-aviso-texto"><Hourglass className="size-4" aria-hidden /> Consentimiento pendiente{tele.enlaceVence && " · enlace enviado"}</span>;
}

function Resumen({ tele, sala, onEditar }: { tele: Teleconsulta; sala: EnSala | null; onEditar?: () => void }) {
  const Icono = ICONO[tele.medio];
  return (
    <section aria-label="Consulta a distancia" className="flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-sm">
      <span className="inline-flex items-center gap-1.5 font-medium text-primary"><Icono className="size-4" aria-hidden /> A distancia · {NOMBRE_MEDIO[tele.medio]}</span>
      {tele.duracionMin != null && <span className="inline-flex items-center gap-1 text-muted-foreground"><Clock className="size-4" aria-hidden /> <span className="tabular-nums">{tele.duracionMin} min</span></span>}
      <Consent tele={tele} />
      {sala && <span className="text-muted-foreground">En la sala de espera{sala.revisarAntes && <> hasta el <span className="tabular-nums whitespace-nowrap">{fechaCorta(sala.revisarAntes)}</span></>}</span>}
      {onEditar && <Button type="button" size="sm" variant="ghost" className="ml-auto h-8" onClick={onEditar}><Pencil /> Editar</Button>}
    </section>
  );
}

function Formulario({ consultaId, paciente, telefonoFicha, tele, sala, firmada, plazoDias, onCerrar, onGuardada, onConsentimiento }: {
  consultaId: string; paciente: string; telefonoFicha: string | null; tele: Teleconsulta | null; sala: EnSala | null; firmada: boolean; plazoDias: number;
  onCerrar: () => void; onGuardada: (t: Teleconsulta, s: EnSala | null) => void; onConsentimiento: (t: Teleconsulta) => void;
}) {
  const [medio, setMedio] = useState<Medio>(tele?.medio ?? "llamada");
  const [duracion, setDuracion] = useState(tele?.duracionMin != null ? String(tele.duracionMin) : "");
  const [ubicacion, setUbicacion] = useState(tele?.ubicacion ?? "");
  const [telefono, setTelefono] = useState(tele?.telefono || telefonoFicha || "");
  const [comprobada, setComprobada] = useState(Boolean(tele?.identidad));
  const [identidad, setIdentidad] = useState(tele?.identidad || "Número registrado en su ficha y confirmó su fecha de nacimiento");
  const [verbal, setVerbal] = useState(tele?.consentimiento === "verbal");
  const [fallas, setFallas] = useState(tele?.fallas ?? "");
  const [enSala, setEnSala] = useState(sala ? true : !tele);
  const [guardando, setGuardando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");
  const [jitsi, setJitsi] = useState("");
  const escrito = tele?.consentimiento === "escrito";

  async function guardar() {
    setGuardando(true);
    setError("");
    const r = await guardarTeleconsulta(consultaId, {
      medio, duracionMin: duracion.trim() ? Number(duracion) : null, ubicacion, telefono, identidad: comprobada ? identidad : "",
      consentimiento: escrito ? null : verbal ? "verbal" : "pendiente", fallas, sala: enSala,
    });
    setGuardando(false);
    if (!r.ok || !r.tele) return setError(r.mensaje);
    onGuardada(r.tele, r.sala ?? null);
    onCerrar();
  }

  // Guarda primero (el enlace necesita la fila) y luego abre WhatsApp con el mensaje listo; Cesar pulsa Enviar
  async function enviarEnlace() {
    setEnviando(true);
    setError("");
    await abrirEnVentana(async () => {
      let base = tele;
      if (!base) {
        const g = await guardarTeleconsulta(consultaId, { medio, duracionMin: duracion.trim() ? Number(duracion) : null, ubicacion, telefono, identidad: comprobada ? identidad : "", consentimiento: "pendiente", fallas, sala: enSala });
        if (!g.ok || !g.tele) { setError(g.mensaje); return null; }
        onGuardada(g.tele, g.sala ?? null);
        base = g.tele;
      }
      const r = await enlaceConsentimiento(consultaId);
      if (!r.ok || !r.whatsapp) { setError(r.mensaje); return null; }
      onConsentimiento({ ...base, enlaceVence: r.vence ?? null });
      return r.whatsapp;
    });
    setEnviando(false);
  }

  const bloqueado = firmada;
  return (
    <Dialog open onOpenChange={(o) => !o && onCerrar()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Consulta a distancia</DialogTitle>
          <DialogDescription>
            {paciente}. Es una consulta normal: historia, diagnóstico, récipe y firma van en sus pasos. Aquí queda cómo fue la atención.
            {bloqueado && " Ya está firmada: solo cambian el consentimiento y la sala de espera."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <fieldset disabled={bloqueado} className="space-y-4">
            <legend className="sr-only">Medio</legend>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {MEDIOS.map((m) => {
                const Icono = ICONO[m.valor];
                return (
                  <button key={m.valor} type="button" aria-pressed={medio === m.valor} onClick={() => setMedio(m.valor)}
                    className={cn("flex min-h-11 flex-col items-center justify-center gap-1 rounded-lg border px-2 py-2 text-sm font-medium transition disabled:opacity-60",
                      medio === m.valor ? "border-primary bg-primary/10 text-primary" : "hover:border-primary/40")}>
                    <Icono className="size-5" aria-hidden /> {m.nombre}
                  </button>
                );
              })}
            </div>

            {medio === "videollamada" && (
              <div className="space-y-2 rounded-lg border bg-muted/40 p-3 text-sm">
                <p>WhatsApp: llama por video desde tu teléfono como siempre. Desde la PC: crea una sala de Jitsi (gratis; se corta a los 95 min y quien la abre entra con una cuenta Google, GitHub o Facebook).</p>
                <div className="flex flex-wrap gap-2">
                  {!jitsi ? <Button type="button" size="sm" variant="outline" onClick={() => setJitsi(salaJitsi())}><Video /> Crear sala Jitsi</Button> : (
                    <>
                      <Button type="button" size="sm" variant="outline" onClick={() => abrirEnVentana(jitsi)}><Video /> Abrir sala</Button>
                      <Button type="button" size="sm" variant="outline" onClick={() => abrirEnVentana(enlaceWhatsApp(telefono, `Su videoconsulta con el servicio médico: ${jitsi}`))}><Send /> Mandar enlace por WhatsApp</Button>
                    </>
                  )}
                </div>
              </div>
            )}
            {medio === "nota_voz" && (
              <p className="rounded-lg border bg-muted/40 p-3 text-sm">Guarda la nota de voz en la PC. Para pasarla a texto, en la consulta usa «Grabar la conversación» › «Abrir audio»: se lee en tu PC y el audio no sale de ella.</p>
            )}

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="tele-duracion">Duración (minutos)</Label>
                <Input id="tele-duracion" inputMode="numeric" value={duracion} onChange={(e) => setDuracion(e.target.value.replace(/\D/g, "").slice(0, 3))} placeholder="Ej. 15" />
                <div className="flex flex-wrap gap-1.5">
                  {DURACIONES.map((n) => (
                    <button key={n} type="button" aria-pressed={duracion === String(n)} onClick={() => setDuracion(String(n))}
                      className={cn("inline-flex min-h-8 items-center justify-center gap-1 rounded-full border px-3 text-xs tabular-nums max-sm:min-h-11 max-sm:min-w-11",
                        duracion === String(n) ? "border-primary bg-primary text-primary-foreground" : "hover:border-primary/40")}>
                      {duracion === String(n) && <Check className="size-3.5" aria-hidden />}{n}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="tele-telefono">Número desde el que habló</Label>
                <Input id="tele-telefono" value={telefono} onChange={(e) => setTelefono(e.target.value.slice(0, 40))} placeholder="0414-0000000" />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="tele-ubicacion">Dónde estaba el paciente</Label>
                <Input id="tele-ubicacion" value={ubicacion} onChange={(e) => setUbicacion(e.target.value.slice(0, 200))} placeholder="Ej. Maturín, en su casa" />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="flex items-start gap-2 text-sm">
                <input type="checkbox" className="mt-0.5 size-4 accent-[var(--primary)]" checked={comprobada} onChange={(e) => setComprobada(e.target.checked)} />
                <span><b>Identidad comprobada</b></span>
              </label>
              {comprobada && <Input aria-label="Cómo se comprobó la identidad" value={identidad} onChange={(e) => setIdentidad(e.target.value.slice(0, 200))} />}
            </div>
          </fieldset>

          <div className="space-y-2 rounded-lg border p-3 text-sm">
            <p className="font-medium">Consentimiento</p>
            {tele ? <Consent tele={tele} /> : <p className="text-muted-foreground">La Ley de Telesalud pide el consentimiento por escrito. Mándale el enlace «Acepto» por WhatsApp; puedes seguir con la consulta mientras tanto.</p>}
            {!escrito && (
              <div className="flex flex-wrap items-center gap-2">
                <Button type="button" size="sm" variant="outline" onClick={enviarEnlace} disabled={enviando}>
                  {enviando ? <Loader2 className="animate-spin" /> : <Send />} {tele?.enlaceVence ? "Enviar otro enlace" : "Enviar enlace por WhatsApp"}
                </Button>
                <label className="flex items-center gap-2">
                  <input type="checkbox" className="size-4 accent-[var(--primary)]" checked={verbal} onChange={(e) => setVerbal(e.target.checked)} />
                  Aceptó de palabra
                </label>
              </div>
            )}
            {!escrito && <p className="text-xs text-muted-foreground">El enlace necesita internet y vence en 7 días. Si no puede abrirlo, marca «Aceptó de palabra».</p>}
          </div>

          <fieldset disabled={bloqueado} className="space-y-1.5">
            <Label htmlFor="tele-fallas">Fallas de conexión (opcional)</Label>
            <Textarea id="tele-fallas" rows={2} value={fallas} onChange={(e) => setFallas(e.target.value.slice(0, 500))} placeholder="Ej. Se cortó una vez; se retomó en 1 minuto." />
          </fieldset>

          <label className="flex items-start gap-2 rounded-lg border p-3 text-sm">
            <input type="checkbox" className="mt-0.5 size-4 accent-[var(--primary)]" checked={enSala} onChange={(e) => setEnSala(e.target.checked)} />
            <span>
              <b>Dejar en la sala de espera</b>{sala?.revisarAntes ? <> hasta el <span className="tabular-nums">{fechaCorta(sala.revisarAntes)}</span></> : ` ${plazoDias} días`}.{" "}
              <span className="text-muted-foreground">Lleva los paraclínicos sin resultado. Si vuelve, abres un control enlazado; si no, se archiva solo y queda en su historia.</span>
            </span>
          </label>

          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onCerrar}>Cancelar</Button>
          <Button type="button" onClick={guardar} disabled={guardando}>{guardando ? <Loader2 className="animate-spin" /> : <Check />} Guardar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
