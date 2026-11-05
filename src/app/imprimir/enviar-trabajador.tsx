"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, Eye, Loader2, MessageCircle, RefreshCw, Smartphone, Sparkles, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ahora } from "@/lib/fecha";
import { cn } from "@/lib/utils";
import { confirmar } from "@/components/app/confirmar";
import { DIAS_ENLACE_TRABAJADOR, DOCS_TRABAJADOR, MAX_FRASE, mensajeTrabajador, mostrarTelefono, telefonoTrabajador, textoFrase, type DocTrabajador } from "@/lib/whatsapp-trabajador";
import { anularEnlaceTrabajador, datosWhatsAppTrabajador, enviarAlTrabajador, type DatosWhatsAppTrabajador, type ResultadoWhatsAppTrabajador } from "./trabajador-acciones";

const fechaCorta = (iso: string) =>
  new Intl.DateTimeFormat("es-VE", { day: "2-digit", month: "2-digit", hour: "numeric", minute: "2-digit", timeZone: "America/Caracas" }).format(new Date(iso));

// «WhatsApp al trabajador» en la barra de un documento personal (récipe, orden, referencia, informe, constancia de atención,
// tensión, dieta, bienestar). Sale el PDF de esta misma página, con las opciones elegidas, tras un enlace de 7 días.
export function EnviarTrabajador({ consultaId, tipo, servicio }: { consultaId: string; tipo: DocTrabajador; servicio: string }) {
  const [abierto, setAbierto] = useState(false);
  const [datos, setDatos] = useState<DatosWhatsAppTrabajador | null>(null);
  const [telefono, setTelefono] = useState("");
  const [guardar, setGuardar] = useState(false);
  const [revisar, setRevisar] = useState(false); // el aviso del celular sale al salir del campo o al enviar, no mientras escribe
  const [mensaje, setMensaje] = useState("");
  const [frase, setFrase] = useState<string | null>(null); // null = aún no se eligió; "" = sin frase
  const [iFrase, setIFrase] = useState(0);
  const [resultado, setResultado] = useState<ResultadoWhatsAppTrabajador | null>(null);
  const [cargando, iniciarCarga] = useTransition();
  const [enviando, iniciar] = useTransition();
  const doc = DOCS_TRABAJADOR[tipo];

  const recargar = () =>
    iniciarCarga(async () => {
      const d = await datosWhatsAppTrabajador(consultaId);
      setDatos(d);
      if ("error" in d) return;
      setTelefono((t) => t || (d.telefono ? mostrarTelefono(d.telefono) : ""));
      setGuardar((g) => g || !d.telefono);
      setMensaje((m) => m || mensajeTrabajador(d.nombre, servicio, tipo));
      setFrase((f) => (f === null ? (d.frases[0] ? textoFrase(d.frases[0]) : "") : f));
    });
  const otraFrase = () => {
    if (!listo || !datos.frases.length) return;
    const i = (iFrase + 1) % datos.frases.length;
    setIFrase(i);
    setFrase(textoFrase(datos.frases[i]));
  };
  const abrir = (v: boolean) => {
    setAbierto(v);
    if (v) { setResultado(null); recargar(); }
  };

  const valido = telefonoTrabajador(telefono);
  const listo = datos && !("error" in datos);
  const falta = listo && doc.firmada && !datos.firmada;
  const distinto = listo && valido && valido !== datos.telefono;

  const mandar = () => {
    setRevisar(true);
    if (!valido) return;
    iniciar(async () => {
      const r = await enviarAlTrabajador({ consultaId, tipo, busqueda: window.location.search, telefono, guardarTelefono: guardar && Boolean(distinto), mensaje, frase: frase ?? "" });
      setResultado(r);
      if (r.ok) {
        // El próximo envío trae la frase siguiente
        setFrase(null);
        setIFrase(0);
        window.open(r.whatsapp, "_blank", "noopener,noreferrer");
        recargar();
      }
    });
  };

  const anular = async (id: string) => {
    if (!(await confirmar({ titulo: "¿Anular el enlace?", texto: "El trabajador ya no podrá abrir el documento.", accion: "Anular enlace", peligro: true }))) return;
    iniciar(async () => {
      const r = await anularEnlaceTrabajador(id);
      if (!r.ok) setResultado({ ok: false, mensaje: r.mensaje ?? "No se pudo anular." });
      recargar();
    });
  };

  return (
    <Dialog open={abierto} onOpenChange={abrir}>
      <DialogTrigger asChild>
        <Button variant="outline" data-accion="whatsapp-trabajador" aria-label="WhatsApp al trabajador" title="WhatsApp al trabajador"><MessageCircle /> <span className="hidden sm:inline">WhatsApp al trabajador</span></Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Enviar al trabajador por WhatsApp</DialogTitle>
          <DialogDescription>
            {listo ? <>A {datos.nombre}: su {doc.nombre} tal como se ve en esta página. El enlace dura {DIAS_ENLACE_TRABAJADOR} días y solo abre este documento.</> : "Preparando…"}
          </DialogDescription>
        </DialogHeader>
        {!datos && cargando ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status"><Loader2 className="size-4 animate-spin" /> Cargando…</p>
        ) : datos && "error" in datos ? (
          <p className="rounded-md bg-alerta/10 px-3 py-2 text-sm text-alerta-texto" role="alert">{datos.error}</p>
        ) : listo ? (
          <div className="grid gap-4">
            {falta && (
              <p className="rounded-md bg-aviso/10 px-3 py-2 text-sm text-aviso-texto" role="status">
                Firma la consulta antes de enviar este documento. Las hojas de tensión, dieta y bienestar sí salen sin firmar.
              </p>
            )}
            <div>
              <Label htmlFor="tel-trabajador" className="mb-1.5">Celular del trabajador</Label>
              <div className="relative">
                <Smartphone className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                <input id="tel-trabajador" inputMode="tel" autoComplete="off" value={telefono} onChange={(e) => setTelefono(e.target.value)} onBlur={() => setRevisar(true)} placeholder="0414-1234567"
                  className={cn("h-11 w-full rounded-md border bg-transparent pr-3 pl-9 text-base", revisar && telefono && !valido && "border-alerta")} />
              </div>
              {revisar && !valido && <p className="mt-1 text-xs text-alerta-texto">Revisa el número. Ejemplos: 0414-1234567 o +57 300 1234567.</p>}
              {!datos.telefono && !telefono && <p className="mt-1 text-xs text-muted-foreground">La ficha no tiene celular: escríbelo aquí.</p>}
              {distinto && (
                <label className="mt-2 flex cursor-pointer items-center gap-2 text-sm">
                  <input type="checkbox" className="size-4 accent-primary" checked={guardar} onChange={(e) => setGuardar(e.target.checked)} />
                  {datos.telefono ? `Cambiar en la ficha (hoy ${mostrarTelefono(datos.telefono)})` : "Guardar este celular en la ficha"}
                </label>
              )}
            </div>
            <div>
              <Label htmlFor="msg-trabajador" className="mb-1.5">Mensaje</Label>
              <Textarea id="msg-trabajador" rows={3} maxLength={500} value={mensaje} onChange={(e) => setMensaje(e.target.value)} />
              <p className="mt-1 text-xs text-muted-foreground">El enlace se agrega al final.</p>
            </div>
            {(datos.frases.length > 0 || frase) && (
              <div>
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <Label htmlFor="frase-trabajador" className="flex items-center gap-1.5"><Sparkles className="size-4 text-primary" /> Frase del mensaje</Label>
                  {datos.frases.length > 1 && (
                    <Button type="button" variant="ghost" size="sm" className="h-8 px-2" onClick={otraFrase}><RefreshCw /> Otra frase</Button>
                  )}
                </div>
                <Textarea id="frase-trabajador" rows={2} maxLength={MAX_FRASE} value={frase ?? ""} onChange={(e) => setFrase(e.target.value)} placeholder="Sin frase" />
                <p className="mt-1 text-xs text-muted-foreground">Va después del enlace. Cámbiala, edítala o bórrala; cada envío trae otra distinta.</p>
              </div>
            )}
            <Button size="lg" className="bg-[#1a7f45] text-white hover:bg-[#166b3a]" disabled={enviando || Boolean(falta)} onClick={mandar}>
              {enviando ? <Loader2 className="animate-spin" /> : <MessageCircle />} {enviando ? "Preparando el PDF…" : "Preparar y abrir WhatsApp"}
            </Button>
            {resultado && (
              <div className={cn("space-y-2 rounded-md px-3 py-3 text-sm", resultado.ok ? "bg-ok/10" : "bg-alerta/10")} role="status">
                {resultado.ok ? (
                  <>
                    <p className="flex items-center gap-1.5 font-medium text-ok-texto"><CheckCircle2 className="size-4" /> Enlace listo. Si WhatsApp no se abrió, tócalo aquí:</p>
                    <Button variant="outline" size="sm" asChild><a href={resultado.whatsapp} target="_blank" rel="noreferrer"><MessageCircle /> Abrir WhatsApp</a></Button>
                    {resultado.aviso && <p className="text-xs text-aviso-texto">{resultado.aviso}</p>}
                  </>
                ) : (
                  <p className="flex gap-1.5 text-alerta-texto"><XCircle className="mt-0.5 size-4 shrink-0" /> {resultado.mensaje}</p>
                )}
              </div>
            )}
            {datos.enviados.length > 0 && (
              <div>
                <p className="mb-1.5 text-sm font-medium">Enviados de esta consulta</p>
                <ul className="divide-y rounded-md border text-sm">
                  {datos.enviados.map((e) => (
                    <li key={e.id} className="flex items-center gap-2 px-3 py-2">
                      <span className="min-w-0 flex-1">
                        <span className={cn("block truncate", e.anulado && "text-muted-foreground line-through")}>{DOCS_TRABAJADOR[e.documento]?.nombre ?? e.documento}{e.conCambios && <span className="text-xs text-muted-foreground"> · con cambios</span>}</span>
                        <span className="block text-xs text-muted-foreground">
                          {mostrarTelefono(e.telefono)} · {fechaCorta(e.creado)} · {e.anulado ? "anulado" : new Date(e.vence).getTime() < ahora() ? "vencido" : e.aperturas ? <span className="inline-flex items-center gap-1 text-ok-texto"><Eye className="size-3" /> abierto {e.aperturas} {e.aperturas === 1 ? "vez" : "veces"}</span> : "sin abrir"}
                        </span>
                      </span>
                      {!e.anulado && <Button size="sm" variant="ghost" disabled={enviando} onClick={() => anular(e.id)}>Anular</Button>}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
