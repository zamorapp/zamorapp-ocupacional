"use client";

import { useMemo, useRef, useState } from "react";
import { AudioLines, Check, ChevronDown, Mic, Pencil, RotateCcw, Square } from "lucide-react";
import { confirmar } from "@/components/app/confirmar";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import type { DatosConsulta, SignosVitales } from "@/lib/consultas-tipos";
import type { Aptitud } from "@/lib/pacientes";
import { aplicarDictado, faltantes, ordenarDictado, type Aceptado, type CampoTexto } from "@/lib/escriba";
import { AyudaMicrofono, useDictado } from "./dictado";

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

  // En el escritorio dicta Windows (Win + H) escribiendo en «Lo que escuché», que entonces queda siempre a la vista
  const { soportado, grabando, error, windows, alternar } = useDictado("escriba-consulta", (t) => {
    const nuevo = textoRef.current ? `${textoRef.current.trimEnd()} ${t.trim()}` : t.trim();
    textoRef.current = nuevo;
    setTexto(nuevo);
  }, true, "escriba-texto");

  const dictado = useMemo(
    () => ordenarDictado(texto, { funcional: d.examenFuncional, fisico: d.examenFisico, motivos }),
    [texto, d.examenFuncional, d.examenFisico, motivos],
  );
  const motivoReconocido = !d.motivoId && dictado.motivoId ? motivos.find((m) => m.id === dictado.motivoId) : undefined;

  const AGREGA = { texto: "Se agrega al final de lo escrito" };
  // Fila sin tocar (valor normal de la plantilla): se reemplaza; escrita a mano: se agrega al final
  const notaFila = (f: { valor: string; normal: string }) =>
    !f.valor.trim() ? undefined : f.valor.trim() === f.normal.trim() ? { texto: "Reemplaza el texto normal de la plantilla" } : AGREGA;
  const propuestas: Propuesta[] = [
    ...(dictado.sinUbicar ? [{ id: "sin", grupo: "Sin ubicar", etiqueta: "Antes de la primera sección (va a Enfermedad actual si lo marcas)", texto: dictado.sinUbicar }] : []),
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

  const cerrar = () => { if (grabando) alternar(); setAbierto(false); };
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
    if (grabando) alternar();
    setAbierto(false);
    empezarDeNuevo();
  };

  if (!soportado) return null;

  return (
    <>
      <Button variant="outline" onClick={() => { setAyuda(!yaUsado() || grande()); setAbierto(true); }} title="Dicta la consulta de corrido y se ordena en sus campos">
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
            <SheetTitle>Dictar la consulta</SheetTitle>
            <SheetDescription>
              Habla de corrido y di el nombre de cada parte al empezarla. El audio lo procesa Google o Microsoft: necesita internet.
            </SheetDescription>
            <details open={ayuda} onToggle={(e) => setAyuda(e.currentTarget.open)} className="group pt-1">
              <summary className="flex cursor-pointer list-none items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground [&::-webkit-details-marker]:hidden">
                <ChevronDown className="size-3.5 transition -rotate-90 group-open:rotate-0" /> Qué decir
              </summary>
              <div className="flex flex-wrap gap-1.5 pt-1.5">
                {FRASES.map((f) => <span key={f} className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">«{f}»</span>)}
              </div>
            </details>
          </SheetHeader>

          <div className="flex-1 space-y-4 overflow-y-auto p-4">
            {/* Micrófono */}
            <div className="flex items-center gap-4 rounded-xl border bg-muted/30 p-4">
              <button
                type="button"
                onClick={alternar}
                aria-label={grabando ? "Detener" : "Empezar a dictar"}
                className={cn(
                  "grid size-14 shrink-0 place-items-center rounded-full shadow-sm transition",
                  grabando ? "animate-pulse bg-alerta text-white motion-reduce:animate-none" : "bg-primary text-primary-foreground hover:bg-primary/90",
                )}
              >
                {grabando ? <Square className="size-5 fill-current" /> : <Mic className="size-6" />}
              </button>
              <div className="min-w-0 flex-1 text-sm">
                <p className="font-medium">
                  {windows ? "Toca y habla: Windows escribe abajo. Para pausar, pulsa Win + H"
                    : grabando ? "Escuchando… toca para pausar" : texto ? "En pausa. Toca para seguir dictando" : "Toca para empezar"}
                </p>
                <p className={cn("text-xs", error ? "text-destructive" : "text-muted-foreground")}>
                  {error || (texto ? `${texto.split(/\s+/).length} palabras` : "Ej.: «motivo evaluación preempleo… examen físico abdomen normal… aptitud apto»")}
                </p>
                <AyudaMicrofono error={error} />
              </div>
              {texto && !grabando && <Button type="button" size="sm" variant="ghost" className="text-alerta-texto hover:text-alerta-texto" onClick={borrar}>Borrar</Button>}
            </div>

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
                    <div className={cn("flex items-start gap-3 rounded-md border px-3 py-2", !marcado(p) && "opacity-50", p.id === "sin" && "border-dashed")}>
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
              {texto && !propuestas.length && <p className="text-sm text-muted-foreground">Aún no reconozco secciones. Di, por ejemplo, «examen físico».</p>}
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
