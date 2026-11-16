"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AudioLines, Check, ChevronDown, FileAudio, Loader2, Mic, Pencil, RotateCcw, Square, X } from "lucide-react";
import { confirmar } from "@/components/app/confirmar";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import type { DatosConsulta, SignosVitales } from "@/lib/consultas-tipos";
import type { Aptitud } from "@/lib/pacientes";
import { aplicarDictado, etiquetarConversacion, faltantes, ordenarDictado, type Aceptado, type CampoTexto } from "@/lib/escriba";
import { AyudaMicrofono, useDictado } from "./dictado";
import type { MensajeVoz } from "./whisper.worker";

// «Dictar consulta»: el médico habla de corrido diciendo el nombre de cada sección y aquí se ve, en vivo, en qué
// campo quedará cada cosa. Todo es editable y se puede desmarcar; «Pasar a la consulta» solo agrega (nunca borra)
// y deja «Deshacer». No guarda ni firma.

const ETIQUETA_TEXTO: Record<CampoTexto, string> = {
  motivoTexto: "Motivo (detalle)",
  enfermedadActual: "Enfermedad actual",
  indicaciones: "Indicaciones",
  conclusiones: "Conclusiones",
  recomendacionesEmpresa: "Recomendaciones a la empresa",
  recomendacionesTrabajador: "Recomendaciones al trabajador",
};
const ETIQUETA_SIGNO: Record<keyof SignosVitales, string> = { ta: "TA", fc: "FC", fr: "FR", temp: "Temp", sat: "SatO₂", peso: "Peso", talla: "Talla" };
const FRASES = ["motivo", "enfermedad actual", "antecedentes", "interrogatorio", "signos vitales", "examen físico", "abdomen…", "aptitud", "recomendaciones"];

// nota: qué pasa con lo que ya tiene la consulta en ese campo (el médico debe saberlo antes de pasar)
type Propuesta = { id: string; grupo: string; etiqueta: string; texto: string; corto?: boolean; nota?: { texto: string; aviso?: boolean } };

// La ayuda «Qué decir» se muestra abierta hasta el primer uso; después queda plegada en el celular
const CLAVE_USADO = "zamorapp.escriba.usado";
// Modo elegido la última vez: «conversacion» (por defecto) o «secciones»
const CLAVE_MODO = "zamorapp.escriba.modo";
const modoGuardado = () => { try { return localStorage.getItem(CLAVE_MODO) !== "secciones"; } catch { return true; } };
const yaUsado = () => { try { return localStorage.getItem(CLAVE_USADO) === "1"; } catch { return false; } };
const grande = () => typeof window !== "undefined" && window.matchMedia("(min-width: 640px)").matches;

export function Escriba({ d, motivos, preventivo, etiquetaAptitud, conMotivo, onCambiar }: {
  d: DatosConsulta;
  motivos: { id: string; nombre: string }[];
  preventivo: boolean;
  etiquetaAptitud: (a: Aptitud) => string;
  // Pone el motivo reconocido (con su plantilla, si la tiene) cuando la consulta aún no tiene motivo
  conMotivo: (c: DatosConsulta, motivoId: string) => DatosConsulta;
  onCambiar: (c: DatosConsulta) => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const [texto, setTexto] = useState("");
  const [verTexto, setVerTexto] = useState(false);
  // Ajustes del médico sobre la propuesta: casillas desmarcadas y textos editados (por id)
  const [quitados, setQuitados] = useState<Record<string, boolean>>({});
  const [editados, setEditados] = useState<Record<string, string>>({});
  const [antes, setAntes] = useState<{ antes: DatosConsulta; despues: DatosConsulta } | null>(null);
  const textoRef = useRef("");
  const [ayuda, setAyuda] = useState(true);
  // Conversación: se habla con el paciente sin decir secciones y cada frase se ubica por lo que dice
  const [conversacion, setConversacion] = useState(true);
  const conversacionRef = useRef(true);
  // «Abrir audio»: una grabación (nota de voz, archivo) se lee con Whisper en la PC y entra como la conversación
  const [lectura, setLectura] = useState<{ nombre: string; fase: "descarga" | "lectura"; avance: number; texto?: string } | null>(null);
  const [errorAudio, setErrorAudio] = useState("");
  const worker = useRef<Worker | null>(null);
  const archivoRef = useRef<HTMLInputElement>(null);
  const agregarTexto = (t: string) => {
    if (!t.trim()) return;
    const nuevo = textoRef.current ? `${textoRef.current.trimEnd()}\n${t.trim()}` : t.trim();
    textoRef.current = nuevo;
    setTexto(nuevo);
  };
  // Al salir de la consulta se detiene la lectura
  useEffect(() => () => worker.current?.terminate(), []);
  const cancelarLectura = () => { worker.current?.terminate(); worker.current = null; setLectura(null); };
  const abrirAudio = async (archivo: File) => {
    setErrorAudio("");
    if (dictando) alternarDictado();
    setLectura({ nombre: archivo.name, fase: "lectura", avance: 0 });
    let audio: Float32Array;
    try {
      // 16 kHz y un solo canal, como lo pide Whisper
      const ac = new AudioContext({ sampleRate: 16000 });
      const buf = await ac.decodeAudioData(await archivo.arrayBuffer());
      void ac.close();
      if (buf.duration > 90 * 60) { setLectura(null); return setErrorAudio("El audio dura más de 90 minutos. Córtalo en partes."); }
      audio = buf.getChannelData(0).slice();
      for (let c = 1; c < buf.numberOfChannels; c++) { const o = buf.getChannelData(c); for (let i = 0; i < audio.length; i++) audio[i] = (audio[i] + o[i]) / 2; }
    } catch {
      setLectura(null);
      return setErrorAudio("No pude abrir ese archivo. Prueba con una nota de voz (.ogg, .opus, .m4a, .mp3 o .wav).");
    }
    worker.current?.terminate();
    const w = new Worker(new URL("./whisper.worker.ts", import.meta.url), { type: "module" });
    worker.current = w;
    w.onmessage = (e: MessageEvent<MensajeVoz>) => {
      const m = e.data;
      if (m.tipo === "descarga") setLectura((l) => l && { ...l, fase: "descarga", avance: m.avance });
      else if (m.tipo === "avance") { agregarTexto(m.texto); setLectura((l) => l && { ...l, fase: "lectura", avance: m.hecho / m.total }); }
      else if (m.tipo === "listo") { w.terminate(); worker.current = null; setLectura(null); setVerTexto(true); }
      else { w.terminate(); worker.current = null; setLectura(null); setErrorAudio(`No se pudo leer el audio: ${m.mensaje}. La primera vez necesita internet para bajar el lector de voz.`); }
    };
    w.postMessage({ audio }, [audio.buffer]);
  };

  const elegirModo = (c: boolean) => {
    setConversacion(c); conversacionRef.current = c;
    try { localStorage.setItem(CLAVE_MODO, c ? "conversacion" : "secciones"); } catch {}
  };

  // En el escritorio dicta Windows (Win + H) escribiendo en «Lo que escuché», que entonces queda siempre a la vista
  const { soportado, grabando: dictando, error: errorDictado, aviso: avisoDictado, windows: windowsDictado, alternar: alternarDictado } = useDictado("escriba-consulta", (t) => {
    // En conversación cada frase va en su renglón: así se ubica sola
    const nuevo = textoRef.current ? `${textoRef.current.trimEnd()}${conversacionRef.current ? "\n" : " "}${t.trim()}` : t.trim();
    textoRef.current = nuevo;
    setTexto(nuevo);
  }, true, "escriba-texto");

  // Conversación por micrófono (Analizar, 14-nov): se GRABA en esta PC y al terminar se lee con Whisper, igual que
  // «Abrir audio». El audio nunca sale del equipo (el dictado en vivo, en cambio, lo procesa Google o Microsoft).
  const [grabandoLocal, setGrabandoLocal] = useState(false);
  const [segundos, setSegundos] = useState(0);
  const [errorMic, setErrorMic] = useState("");
  const [puedeGrabar, setPuedeGrabar] = useState(false);
  useEffect(() => setPuedeGrabar(Boolean(navigator.mediaDevices?.getUserMedia) && typeof MediaRecorder !== "undefined"), []);
  const grabadora = useRef<{ rec: MediaRecorder; reloj: number } | null>(null);
  const permisoPedido = useRef(false);
  // leer=false: se descarta lo grabado (cerrar el panel, salir de la consulta)
  const detenerGrabacion = (leer = true) => {
    const g = grabadora.current;
    if (!g) return;
    window.clearInterval(g.reloj);
    if (!leer) g.rec.onstop = () => g.rec.stream.getTracks().forEach((t) => t.stop());
    g.rec.stop();
    grabadora.current = null;
    setGrabandoLocal(false);
  };
  useEffect(() => () => detenerGrabacion(false), []);
  const empezarGrabacion = async () => {
    setErrorMic("");
    setErrorAudio("");
    if (!permisoPedido.current) {
      const si = await confirmar({ titulo: "¿El paciente aceptó que se grabe la consulta?", texto: "Pídele permiso antes de grabar. El audio se queda en esta PC: se convierte en texto y se descarta.", accion: "Sí, aceptó" });
      if (!si) return;
      permisoPedido.current = true;
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      return setErrorMic("No se pudo abrir el micrófono. Revisa que esté conectado y permitido para zamorApp.");
    }
    const rec = new MediaRecorder(stream);
    const partes: Blob[] = [];
    rec.ondataavailable = (e) => { if (e.data.size) partes.push(e.data); };
    rec.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      const blob = new Blob(partes, { type: rec.mimeType || "audio/webm" });
      if (blob.size) void abrirAudio(new File([blob], "grabación de la consulta", { type: blob.type }));
    };
    rec.start(1000);
    setSegundos(0);
    // Contador de la grabación (solo duración; ninguna fecha depende de él). A los 90 min se detiene sola.
    const reloj = window.setInterval(() => setSegundos((x) => x + 1), 1000);
    grabadora.current = { rec, reloj };
    setGrabandoLocal(true);
  };

  useEffect(() => { if (segundos >= 90 * 60) detenerGrabacion(); }, [segundos]);
  const grabando = conversacion ? grabandoLocal : dictando;
  const alternar = conversacion ? () => (grabandoLocal ? detenerGrabacion() : void empezarGrabacion()) : alternarDictado;
  const windows = !conversacion && windowsDictado;
  const error = conversacion ? errorMic : errorDictado;
  const aviso = conversacion ? "" : avisoDictado;
  const reloj = `${Math.floor(segundos / 60)}:${String(segundos % 60).padStart(2, "0")}`;

  const dictado = useMemo(
    () => ordenarDictado(conversacion ? etiquetarConversacion(texto) : texto, { funcional: d.examenFuncional, fisico: d.examenFisico, motivos }),
    [texto, conversacion, d.examenFuncional, d.examenFisico, motivos],
  );
  const motivoReconocido = !d.motivoId && dictado.motivoId ? motivos.find((m) => m.id === dictado.motivoId) : undefined;

  const AGREGA = { texto: "Se agrega al final de lo escrito" };
  // Fila sin tocar (valor normal de la plantilla): se reemplaza; escrita a mano: se agrega al final
  const notaFila = (f: { valor: string; normal: string }) =>
    !f.valor.trim() ? undefined : f.valor.trim() === f.normal.trim() ? { texto: "Reemplaza el texto normal de la plantilla" } : AGREGA;
  const propuestas: Propuesta[] = [
    ...(dictado.sinUbicar ? [{ id: "sin", grupo: "Sin ubicar", etiqueta: conversacion ? "Conversación sin ubicar (va a Enfermedad actual si lo marcas)" : "Antes de la primera sección (va a Enfermedad actual si lo marcas)", texto: dictado.sinUbicar }] : []),
    ...(Object.entries(dictado.textos) as [CampoTexto, string][]).map(([k, v]) => ({ id: `t:${k}`, grupo: "Consulta", etiqueta: ETIQUETA_TEXTO[k], texto: v, nota: d[k].trim() ? AGREGA : undefined })),
    ...(Object.entries(dictado.signos) as [keyof SignosVitales, string][]).map(([k, v]) => ({ id: `s:${k}`, grupo: "Signos vitales", etiqueta: ETIQUETA_SIGNO[k], texto: v, corto: true,
      nota: d.signos[k] && d.signos[k] !== v ? { texto: `No se cambia: ya tiene ${d.signos[k]}`, aviso: true } : undefined })),
    ...d.examenFuncional.filter((f) => dictado.funcional[f.clave]).map((f) => ({ id: `fu:${f.clave}`, grupo: "Examen funcional", etiqueta: f.nombre, texto: dictado.funcional[f.clave], nota: notaFila(f) })),
    ...d.examenFisico.filter((f) => dictado.fisico[f.clave]).map((f) => ({ id: `fi:${f.clave}`, grupo: "Examen físico", etiqueta: f.nombre, texto: dictado.fisico[f.clave], nota: notaFila(f) })),
    ...(dictado.aptitud.clasificacion || dictado.aptitud.observacion
      ? [{ id: "ap", grupo: "Aptitud", etiqueta: dictado.aptitud.clasificacion ? etiquetaAptitud(dictado.aptitud.clasificacion) : "Observación de aptitud", texto: dictado.aptitud.observacion,
        nota: d.aptitud.clasificacion && dictado.aptitud.clasificacion && d.aptitud.clasificacion !== dictado.aptitud.clasificacion
          ? { texto: `No se cambia la clasificación: ya es ${etiquetaAptitud(d.aptitud.clasificacion)}`, aviso: true }
          : d.aptitud.observacion.trim() ? AGREGA : undefined }]
      : []),
  ];
  const marcado = (p: Propuesta) => (p.id === "sin" ? quitados.sin === false : !quitados[p.id]);
  const valor = (p: Propuesta) => editados[p.id] ?? p.texto;
  const elegidas = propuestas.filter(marcado);
  const falta = texto ? faltantes(dictado, { fisico: d.examenFisico, preventivo }) : [];

  const cerrar = () => { if (dictando) alternarDictado(); detenerGrabacion(false); cancelarLectura(); setAbierto(false); };
  const borrar = async () => {
    if (await confirmar({ titulo: "¿Borrar todo lo dictado?", texto: "Se pierde lo que escuché en esta consulta. Lo que ya pasaste a la consulta no cambia.", accion: "Borrar", peligro: true })) empezarDeNuevo();
  };
  const empezarDeNuevo = () => { textoRef.current = ""; setTexto(""); setQuitados({}); setEditados({}); };

  const pasar = () => {
    const a: Aceptado = { textos: {}, signos: {}, funcional: {}, fisico: {}, aptitud: { clasificacion: "", observacion: "" } };
    for (const p of elegidas) {
      const v = valor(p);
      const [tipo, clave] = p.id.split(":");
      if (tipo === "sin") a.textos.enfermedadActual = [v, a.textos.enfermedadActual].filter(Boolean).join("\n");
      else if (tipo === "t") a.textos[clave as CampoTexto] = [a.textos[clave as CampoTexto], v].filter(Boolean).join("\n");
      else if (tipo === "s") a.signos[clave as keyof SignosVitales] = v.trim();
      else if (tipo === "fu") a.funcional[clave] = v;
      else if (tipo === "fi") a.fisico[clave] = v;
      else if (tipo === "ap") a.aptitud = { clasificacion: dictado.aptitud.clasificacion, observacion: v };
    }
    const base = motivoReconocido && !quitados.motivo ? conMotivo(d, motivoReconocido.id) : d;
    const despues = aplicarDictado(base, a);
    setAntes({ antes: d, despues });
    try { localStorage.setItem(CLAVE_USADO, "1"); } catch {}
    onCambiar(despues);
    if (dictando) alternarDictado();
    detenerGrabacion(false);
    setAbierto(false);
    empezarDeNuevo();
  };

  if (!soportado && !puedeGrabar) return null;

  return (
    <>
      <Button variant="outline" onClick={() => { setAyuda(!yaUsado() || grande()); elegirModo(modoGuardado()); setAbierto(true); }} title="Dicta la consulta de corrido y se ordena en sus campos">
        <AudioLines /> <span className="hidden md:inline">Dictar consulta</span>
      </Button>

      {antes && (
        <div role="status" className="fixed inset-x-4 bottom-4 z-50 mx-auto flex max-w-lg flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border bg-card px-4 py-3 text-sm shadow-lg">
          <Check className="size-4 shrink-0 text-ok-texto" />
          <span className="min-w-0 flex-1 basis-56">Dictado pasado a la consulta. Revísalo antes de guardar.</span>
          <Button type="button" size="sm" variant="ghost" className="h-7" onClick={() => { onCambiar(antes.antes); setAntes(null); }}>
            <RotateCcw /> Deshacer
          </Button>
          <Button type="button" size="sm" variant="ghost" className="h-7 text-muted-foreground" onClick={() => setAntes(null)}>Listo</Button>
        </div>
      )}

      <Sheet open={abierto} onOpenChange={(v) => (v ? setAbierto(true) : cerrar())}>
        <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-xl">
          <SheetHeader className="border-b">
            <SheetTitle>{conversacion ? "Grabar la conversación" : "Dictar la consulta"}</SheetTitle>
            <SheetDescription>
              {conversacion
                ? "Conversa con el paciente como siempre o abre una grabación: cada frase se ubica sola en su casilla. Revisa antes de pasar."
                : "Habla de corrido y di el nombre de cada parte al empezarla."}
            </SheetDescription>
            <div role="radiogroup" aria-label="Cómo dictar" className="mt-1 inline-flex w-fit rounded-lg border bg-muted/40 p-0.5 text-sm">
              {([[true, "Conversación"], [false, "Por secciones"]] as const).map(([c, n]) => (
                <button key={n} type="button" role="radio" aria-checked={conversacion === c} onClick={() => elegirModo(c)}
                  className={cn("rounded-md px-3 py-1 max-sm:h-11", conversacion === c ? "bg-background font-medium shadow-sm" : "text-muted-foreground hover:text-foreground")}>
                  {n}
                </button>
              ))}
            </div>
            {!conversacion && <details open={ayuda} onToggle={(e) => setAyuda(e.currentTarget.open)} className="group pt-1">
              <summary className="flex cursor-pointer list-none items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground [&::-webkit-details-marker]:hidden">
                <ChevronDown className="size-3.5 transition -rotate-90 group-open:rotate-0" /> Qué decir
              </summary>
              <div className="flex flex-wrap gap-1.5 pt-1.5">
                {FRASES.map((f) => <span key={f} className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">«{f}»</span>)}
              </div>
            </details>}
          </SheetHeader>

          <div className="flex-1 space-y-4 overflow-y-auto p-4">
            {/* Micrófono */}
            <div className="flex items-center gap-4 rounded-xl border bg-muted/30 p-4">
              <span className="relative grid shrink-0 place-items-center">
              {grabando && <span aria-hidden className="absolute inset-0 animate-ping rounded-full bg-alerta/40 motion-reduce:hidden" />}
              <button
                type="button"
                onClick={alternar}
                aria-label={grabando ? "Detener" : conversacion ? "Empezar a grabar" : "Empezar a dictar"}
                className={cn(
                  "relative grid size-14 shrink-0 place-items-center rounded-full shadow-sm transition",
                  grabando ? "bg-alerta text-white" : "bg-primary text-primary-foreground hover:bg-primary/90",
                )}
              >
                {grabando ? <Square className="size-5 fill-current" /> : <Mic className="size-6" />}
              </button>
              </span>
              <div className="min-w-0 flex-1 text-sm">
                <p className="font-medium">
                  {windows ? "Toca el micrófono y habla. Windows escribe abajo. Para parar: Win + H"
                    : conversacion
                      ? grabando ? `Grabando ${reloj}… toca para terminar y leer` : texto ? "Toca para grabar otra parte" : "Toca para empezar a grabar"
                      : grabando ? "Escuchando… toca para pausar" : texto ? "En pausa. Toca para seguir dictando" : "Toca para empezar"}
                </p>
                <p aria-live="polite" className={cn("flex items-center gap-1 text-xs", error ? "text-alerta-texto" : "text-muted-foreground")}>
                  {error || (aviso && <><Mic aria-hidden className="size-3.5 shrink-0" /> {aviso}</>) || (texto ? `${texto.split(/\s+/).length} palabras` : conversacion ? "Ej.: «me duele la espalda desde hace tres días… tensión 130 sobre 85… le indico diclofenac…»" : "Ej.: «motivo evaluación preempleo… examen físico abdomen normal… aptitud apto»")}
                </p>
                <p className="text-xs text-muted-foreground">
                  {conversacion ? "Se graba y se lee en esta PC: el audio no sale. Pide permiso al paciente." : "Usa Google o Microsoft: necesita internet. No se guarda el audio."}
                </p>
                <AyudaMicrofono error={error} />
              </div>
              {texto && !grabando && !lectura && <Button type="button" size="sm" variant="ghost" className="text-alerta-texto hover:text-alerta-texto" onClick={borrar}>Borrar</Button>}
            </div>

            {/* Abrir audio: en conversación, una grabación entra igual que lo dicho por el micrófono */}
            {conversacion && (
              <div className="space-y-2">
                <input ref={archivoRef} type="file" accept="audio/*,.ogg,.opus,.m4a,.mp3,.wav,.webm" className="sr-only" tabIndex={-1} aria-hidden
                  onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void abrirAudio(f); }} />
                {lectura ? (
                  <div role="status" className="space-y-1.5 rounded-lg border px-3 py-2.5 text-sm">
                    <div className="flex items-center gap-2">
                      <Loader2 className="size-4 shrink-0 animate-spin text-primary" aria-hidden />
                      <span className="min-w-0 flex-1 truncate">
                        {lectura.fase === "descarga" ? "Bajando el lector de voz (solo la primera vez)…" : `Leyendo «${lectura.nombre}»…`}
                      </span>
                      <span className="tabular-nums text-muted-foreground">{Math.round(lectura.avance * 100)} %</span>
                      <Button type="button" size="icon" variant="ghost" className="size-11 sm:size-7" aria-label="Cancelar lectura" onClick={cancelarLectura}><X /></Button>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary transition-all" style={{ width: `${Math.round(lectura.avance * 100)}%` }} /></div>
                    <p className="text-xs text-muted-foreground">El audio no sale de esta PC. Puedes seguir trabajando; el texto aparece por partes.</p>
                  </div>
                ) : (
                  <button type="button" onClick={() => archivoRef.current?.click()} disabled={grabando}
                    className="flex w-full items-center gap-3 rounded-lg border border-dashed px-3 py-2.5 text-left text-sm hover:bg-muted/40 disabled:opacity-50">
                    <FileAudio className="size-5 shrink-0 text-primary" aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="font-medium">Abrir audio</span>
                      <span className="block text-xs text-muted-foreground">Nota de voz o grabación de la consulta. Se lee en esta PC, sin internet: el audio no sale.</span>
                    </span>
                  </button>
                )}
                {errorAudio && <p role="alert" className="text-sm text-alerta-texto">{errorAudio}</p>}
              </div>
            )}

            {/* Lo que se escuchó: editable, y la propuesta se rehace al corregirlo */}
            {(texto || windows) && (
              <div>
                <button type="button" onClick={() => setVerTexto((v) => !v)} className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground">
                  <ChevronDown className={cn("size-3.5 transition", !verTexto && "-rotate-90")} /> Lo que escuché
                </button>
                {(verTexto || windows) && (
                  <textarea
                    id="escriba-texto"
                    value={texto}
                    onChange={(e) => { textoRef.current = e.target.value; setTexto(e.target.value); }}
                    className="mt-1.5 field-sizing-content min-h-20 w-full rounded-md border bg-transparent px-3 py-2 text-sm"
                  />
                )}
              </div>
            )}

            {falta.length > 0 && (
              <div className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
                <p className="font-medium text-foreground">Sin dictar: complétalos en la consulta</p>
                <p className="text-xs text-muted-foreground">{falta.join(" · ")}</p>
              </div>
            )}

            {motivoReconocido && (
              <label className="flex items-center gap-3 rounded-md border px-3 py-2 text-sm">
                <input type="checkbox" checked={!quitados.motivo} onChange={(e) => setQuitados((q) => ({ ...q, motivo: !e.target.checked }))} className="size-4 accent-primary" />
                <span>Motivo: <b>{motivoReconocido.nombre}</b> <span className="text-muted-foreground">(aplica su plantilla si tiene)</span></span>
              </label>
            )}

            {/* Así queda: cada campo con su casilla y su texto editable */}
            <div className="space-y-2">
              {propuestas.map((p, i) => {
                const titulo = i === 0 || propuestas[i - 1].grupo !== p.grupo ? p.grupo : null;
                return (
                  <div key={p.id}>
                    {titulo && <p className="mb-1 mt-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{titulo}</p>}
                    <div className={cn("flex items-start gap-3 rounded-md border px-3 py-2", !marcado(p) && p.id !== "sin" && "opacity-50", p.id === "sin" && "border-dashed", !marcado(p) && p.id === "sin" && "text-muted-foreground")}>
                      <input
                        type="checkbox"
                        aria-label={`Pasar ${p.etiqueta}`}
                        checked={marcado(p)}
                        onChange={(e) => setQuitados((q) => ({ ...q, [p.id]: !e.target.checked }))}
                        className="mt-1 size-4 shrink-0 accent-primary"
                      />
                      <div className={cn("min-w-0 flex-1", p.corto && "flex items-center gap-3")}>
                        <p className="flex shrink-0 items-center gap-1 text-xs font-medium text-muted-foreground">
                          {p.etiqueta} <Pencil aria-hidden className="size-3 opacity-60" />
                        </p>
                        <textarea
                          rows={1}
                          value={valor(p)}
                          aria-label={`Corregir ${p.etiqueta}`}
                          onChange={(e) => setEditados((x) => ({ ...x, [p.id]: e.target.value }))}
                          className={cn("field-sizing-content w-full resize-none rounded border-0 bg-transparent px-1 py-0.5 text-sm outline-none focus:bg-card focus:ring-1 focus:ring-primary", p.corto && "w-28 font-medium")}
                        />
                        {p.nota && <p className={cn("text-xs", p.nota.aviso ? "text-aviso-texto" : "text-muted-foreground")}>{p.nota.texto}</p>}
                      </div>
                    </div>
                  </div>
                );
              })}
              {texto && !propuestas.length && <p className="text-sm text-muted-foreground">{conversacion ? "Aún no ubico nada. Sigue conversando o corrige «Lo que escuché»." : "Aún no reconozco secciones. Di, por ejemplo, «examen físico»."}</p>}
            </div>
          </div>

          <SheetFooter className="flex-row justify-end gap-2 border-t">
            <Button variant="ghost" onClick={cerrar}>Cancelar</Button>
            <Button onClick={pasar} disabled={!elegidas.length && !motivoReconocido}>
              <Check /> Pasar a la consulta{elegidas.length ? ` (${elegidas.length})` : ""}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </>
  );
}
