"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Mic, Square } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { confirmar } from "@/components/app/confirmar";
import { puntuar } from "@/lib/escriba";
import { ESCRITORIO } from "@/lib/escritorio-actualizar";
import { dictadoWindows, enEscritorio } from "@/lib/escritorio";
import { useSinInternet } from "@/components/app/sin-internet";

// Dictado por voz con el reconocimiento del navegador (Chrome y Edge; sin costo). Solo escribe en el campo:
// nunca guarda. Un solo campo graba a la vez y el texto se inserta donde está el cursor.

type Reconocedor = {
  lang: string; continuous: boolean; interimResults: boolean;
  start: () => void; stop: () => void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
};
type Constructor = new () => Reconocedor;

const constructor = () =>
  typeof window === "undefined" ? null : ((window as unknown as { SpeechRecognition?: Constructor; webkitSpeechRecognition?: Constructor }).SpeechRecognition
    ?? (window as unknown as { webkitSpeechRecognition?: Constructor }).webkitSpeechRecognition ?? null);

// Campo que está grabando (uno a la vez en toda la pantalla)
let activo: { id: string; detener: () => void } | null = null;
const oyentes = new Set<() => void>();
const avisar = () => oyentes.forEach((f) => f());
const suscribir = (f: () => void) => (oyentes.add(f), () => void oyentes.delete(f));

// El reconocimiento del navegador envía el audio a Google (Chrome) o Microsoft (Edge): se avisa y se pide
// aceptarlo una vez en cada equipo antes de dictar
const CLAVE_PRIVACIDAD = "zamorapp.dictado.aceptado";
async function aceptoPrivacidad() {
  try { if (localStorage.getItem(CLAVE_PRIVACIDAD) === "1") return true; } catch {}
  const si = await confirmar({
    titulo: "¿Dictar con el reconocimiento del navegador?",
    texto: "Para convertir la voz en texto, el audio se envía a los servidores de Google (Chrome) o Microsoft (Edge). No dictes nombres ni datos que no deban salir del consultorio. Solo se pregunta una vez en este equipo.",
    accion: "Aceptar y dictar",
  });
  if (si) try { localStorage.setItem(CLAVE_PRIVACIDAD, "1"); } catch {}
  return si;
}

// sinFin: el navegador corta el reconocimiento tras un silencio o un minuto; para dictar una consulta entera se
// vuelve a encender solo hasta que el médico lo detiene
// Sin permiso del micrófono: en el escritorio lo decide Windows (zamorApp ya lo concede por dentro); en el navegador,
// el candado junto a la dirección
const SIN_PERMISO = ESCRITORIO
  ? "Windows bloquea el micrófono. Toca el botón de abajo, activa los dos interruptores y vuelve a abrir zamorApp."
  : "Permite el micrófono: toca el candado junto a la dirección › Micrófono › Permitir.";

// El reconocimiento de voz solo dice «not-allowed», venga de donde venga. Se abre el micrófono un instante para
// saber la causa real: Windows lo bloquea, no hay micrófono, otro programa lo tiene o falla el servicio de voz.
// En el escritorio zamorApp ya concede el micrófono por dentro (microfono.rs), así que un rechazo aquí es de Windows.
async function causaMicrofono(): Promise<string> {
  if (!navigator.mediaDevices?.getUserMedia) return SIN_PERMISO;
  try {
    const s = await navigator.mediaDevices.getUserMedia({ audio: true });
    s.getTracks().forEach((t) => t.stop());
    return "El micrófono funciona, pero el servicio de voz de Microsoft no respondió. Usa Win + H (dictado de Windows) o la web en Chrome.";
  } catch (e) {
    const nombre = (e as DOMException).name;
    if (nombre === "NotFoundError" || nombre === "OverconstrainedError") return "No encuentro ningún micrófono: revisa que esté conectado (o el de la cámara web) y vuelve a intentar.";
    if (nombre === "NotReadableError") return "Otro programa está usando el micrófono (Zoom, Meet, WhatsApp…): ciérralo y vuelve a intentar.";
    return SIN_PERMISO;
  }
}

// Botón a Configuración › Privacidad › Micrófono de Windows (el escritorio abre solo esa página de Configuración)
export function AyudaMicrofono({ error }: { error: string }) {
  if (!ESCRITORIO || error !== SIN_PERMISO) return null;
  return (
    <button type="button" onClick={() => window.open("ms-settings:privacy-microphone")} className="mt-1 text-xs font-medium text-primary hover:underline">
      Abrir la configuración del micrófono de Windows
    </button>
  );
}

// En el escritorio el reconocimiento del navegador interno no funciona (falla sin abrir el micrófono): se usa el
// dictado por voz de Windows, que escribe en el campo con el cursor (campo: id del textarea; por omisión, id)
export function useDictado(id: string, alTexto: (texto: string) => void, sinFin = false, campo = id) {
  const windows = useSyncExternalStore(() => () => {}, enEscritorio, () => false);
  const soportado = useSyncExternalStore(() => () => {}, () => enEscritorio() || Boolean(constructor()), () => false);
  const grabando = useSyncExternalStore(suscribir, () => activo?.id === id, () => false);
  const [error, setError] = useState("");
  // Aviso neutro del dictado de Windows (la app no ve si Windows está escuchando: se dice dónde mirar)
  const [aviso, setAviso] = useState("");
  const sinInternet = useSinInternet();
  const rec = useRef<Reconocedor | null>(null);
  const callback = useRef(alTexto);
  useEffect(() => { callback.current = alTexto; }, [alTexto]);

  const detener = () => {
    rec.current?.stop();
    rec.current = null;
    if (activo?.id === id) { activo = null; avisar(); }
  };

  const conWindows = async () => {
    setError("");
    if (sinInternet) return setAviso("El dictado necesita internet. Escribe a mano o vuelve a intentar al volver la señal.");
    if (!(await aceptoPrivacidad())) return;
    activo?.detener();
    document.getElementById(campo)?.focus();
    try {
      await dictadoWindows();
      setAviso("Windows te escucha: mira la barrita arriba de la pantalla.");
      setTimeout(() => setAviso(""), 6000);
    } catch (e) {
      setAviso("");
      setError(e instanceof Error ? e.message : "Pulsa Win + H con el cursor en el campo.");
    }
  };

  const iniciar = async () => {
    if (windows) return conWindows();
    const C = constructor();
    if (!C) return;
    if (!(await aceptoPrivacidad())) return;
    activo?.detener();
    setError("");
    const r = new C();
    r.lang = "es-VE";
    r.continuous = true;
    r.interimResults = false;
    r.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++) if (e.results[i].isFinal) callback.current(e.results[i][0].transcript);
    };
    r.onerror = (e) => {
      if (e.error === "no-speech" || e.error === "aborted") return;
      // Un error real no se reintenta: onend apaga el micrófono
      rec.current = null;
      if (e.error === "not-allowed" || e.error === "service-not-allowed" || e.error === "audio-capture") void causaMicrofono().then(setError);
      else if (e.error === "network") setError("El dictado necesita internet. En Windows también puedes usar Win + H.");
      else setError("No se pudo dictar. En Windows puedes usar Win + H.");
    };
    r.onend = () => {
      if (sinFin && rec.current === r && activo?.id === id) { try { r.start(); return; } catch {} }
      if (activo?.id === id) { activo = null; avisar(); }
    };
    rec.current = r;
    activo = { id, detener };
    avisar();
    try { r.start(); } catch { detener(); }
  };

  useEffect(() => () => { if (activo?.id === id) { rec.current?.stop(); activo = null; avisar(); } }, [id]);

  return { soportado, grabando, error, aviso, windows, alternar: () => (grabando ? detener() : void iniciar()) };
}

// Textarea con botón de micrófono dentro (abajo a la derecha)
export function TextoDictado({ id, etiqueta, valor, onChange, filas = 3, placeholder, disabled }: {
  id: string; etiqueta?: string; valor: string; onChange: (v: string) => void; filas?: number; placeholder?: string; disabled?: boolean;
}) {
  const valorRef = useRef(valor);
  // Última posición del cursor (al tocar el micrófono el campo pierde el foco); null = al final
  const cursor = useRef<number | null>(null);
  useEffect(() => { valorRef.current = valor; }, [valor]);

  const { soportado, grabando, error, aviso, windows, alternar } = useDictado(id, (texto) => {
    const v = valorRef.current;
    const pos = Math.min(cursor.current ?? v.length, v.length);
    const insertado = puntuar(texto, v.slice(0, pos));
    const nuevo = v.slice(0, pos) + insertado + v.slice(pos);
    valorRef.current = nuevo;
    cursor.current = pos + insertado.length;
    onChange(nuevo);
  });

  return (
    <div>
      {etiqueta && <Label htmlFor={id} className="mb-1.5">{etiqueta}</Label>}
      <div className="relative">
        <Textarea
          id={id}
          value={valor}
          rows={filas}
          placeholder={placeholder}
          disabled={disabled}
          onChange={(e) => { cursor.current = e.target.selectionStart; onChange(e.target.value); }}
          onSelect={(e) => { cursor.current = e.currentTarget.selectionStart; }}
          className={cn(soportado && "pr-11", grabando && "border-alerta focus-visible:ring-alerta/40")}
        />
        {soportado && !disabled && (
          <button
            type="button"
            onClick={alternar}
            aria-label={grabando ? "Detener dictado" : "Dictar"}
            title={windows ? "Dictar con Windows (Win + H)" : grabando ? "Detener dictado" : "Dictar (el audio lo procesa Google o Microsoft). Di «punto», «coma», «punto y aparte»"}
            className={cn(
              "absolute bottom-2 right-2 grid size-8 place-items-center rounded-full transition",
              grabando ? "animate-pulse bg-alerta text-white motion-reduce:animate-none" : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            {grabando ? <Square className="size-3.5 fill-current" /> : <Mic className="size-4" />}
          </button>
        )}
      </div>
      <p aria-live="polite" className={cn("flex items-center gap-1 text-xs", (grabando || error || aviso) && "mt-1", error || grabando ? "text-alerta-texto" : "text-muted-foreground")}>
        {grabando ? "Escuchando… toca para detener" : error || (aviso && <><Mic aria-hidden className="size-3.5 shrink-0" /> {aviso}</>)}
      </p>
      <AyudaMicrofono error={error} />
    </div>
  );
}
