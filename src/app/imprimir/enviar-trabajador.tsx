"use client";

import { useEffect, useState, useTransition } from "react";
import { CheckCircle2, Eye, KeyRound, Loader2, MessageCircle, Smartphone, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ahora } from "@/lib/fecha";
import { cn } from "@/lib/utils";
import { confirmar } from "@/components/app/confirmar";
import {
  claveOpciones,
  DIAS_ENLACE_TRABAJADOR,
  DOCS_TRABAJADOR,
  mensajeTrabajador,
  mostrarTelefono,
  telefonoTrabajador,
  type DocTrabajador,
  type EnvioTrabajador,
} from "@/lib/whatsapp-trabajador";
import { anularEnvioTrabajador, datosWhatsAppTrabajador, enviarAlTrabajador, type DatosWhatsAppTrabajador, type ResultadoWhatsAppTrabajador } from "./trabajador-acciones";

const fechaCorta = (iso: string) =>
  new Intl.DateTimeFormat("es-VE", { day: "2-digit", month: "2-digit", hour: "numeric", minute: "2-digit", timeZone: "America/Caracas" }).format(new Date(iso));
const TODOS = Object.keys(DOCS_TRABAJADOR) as DocTrabajador[];
const leer = (k: string) => { try { return localStorage.getItem(k) ?? ""; } catch { return ""; } };
const guardarLocal = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* sin almacenamiento: sale con lo predeterminado */ } };

// «WhatsApp al trabajador» en la barra de un documento personal: el médico marca qué documentos de la consulta puede
// descargar el trabajador y le llega UN enlace de 7 días con esos documentos. Cada hoja sale como la dejó en pantalla.
export function EnviarTrabajador({ consultaId, tipo, servicio }: { consultaId: string; tipo: DocTrabajador; servicio: string }) {
  const [abierto, setAbierto] = useState(false);
  const [datos, setDatos] = useState<DatosWhatsAppTrabajador | null>(null);
  const [marcados, setMarcados] = useState<Set<DocTrabajador>>(new Set([tipo]));
  const [telefono, setTelefono] = useState("");
  const [guardar, setGuardar] = useState(false);
  const [revisar, setRevisar] = useState(false); // el aviso del celular sale al salir del campo o al enviar, no mientras escribe
  const [mensaje, setMensaje] = useState("");
  const [editado, setEditado] = useState(false);
  const [resultado, setResultado] = useState<ResultadoWhatsAppTrabajador | null>(null);
  const [cargando, iniciarCarga] = useTransition();
  const [enviando, iniciar] = useTransition();

  // Esta hoja recuerda sus opciones (esquemas, temas, cambios) para cuando se envíe junto con otras
  useEffect(() => {
    const guardarAhora = () => guardarLocal(claveOpciones(consultaId, tipo), window.location.search);
    guardarAhora();
    window.addEventListener("popstate", guardarAhora);
    const t = setInterval(guardarAhora, 2000); // las opciones cambian la URL con router.replace (sin popstate)
    return () => { window.removeEventListener("popstate", guardarAhora); clearInterval(t); };
  }, [consultaId, tipo]);

  const listo = datos && !("error" in datos) ? datos : null;
  const lista = [...marcados].filter((d) => !listo?.noDisponibles[d]);
  useEffect(() => {
    if (listo && !editado) setMensaje(mensajeTrabajador(listo.nombre, servicio, TODOS.filter((d) => lista.includes(d))));
  }, [listo, editado, servicio, lista.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps

  const recargar = () =>
    iniciarCarga(async () => {
      const d = await datosWhatsAppTrabajador(consultaId);
      setDatos(d);
      if ("error" in d) return;
      setTelefono((t) => t || (d.telefono ? mostrarTelefono(d.telefono) : ""));
      setGuardar((g) => g || !d.telefono);
    });
  const abrir = (v: boolean) => {
    setAbierto(v);
    if (v) { setResultado(null); recargar(); }
  };
  const alternar = (d: DocTrabajador) => setMarcados((s) => { const n = new Set(s); if (n.has(d)) n.delete(d); else n.add(d); return n; });

  const valido = telefonoTrabajador(telefono);
  const sinFirma = Boolean(listo && !listo.firmada && lista.some((d) => DOCS_TRABAJADOR[d].clinico));
  const distinto = Boolean(listo && valido && valido !== listo.telefono);
  const conCedula = lista.some((d) => DOCS_TRABAJADOR[d].clinico);

  const mandar = () => {
    setRevisar(true);
    if (!valido || !lista.length) return;
    iniciar(async () => {
      const documentos = lista.map((d) => ({ tipo: d, busqueda: d === tipo ? window.location.search : leer(claveOpciones(consultaId, d)) }));
      const r = await enviarAlTrabajador({ consultaId, documentos, telefono, guardarTelefono: guardar && distinto, mensaje });
      setResultado(r);
      if (r.ok) {
        window.open(r.whatsapp, "_blank", "noopener,noreferrer");
        recargar();
      }
    });
  };

  const anular = async (e: EnvioTrabajador) => {
    if (!(await confirmar({ titulo: "¿Anular el enlace?", texto: "El trabajador ya no podrá abrir ninguno de los documentos de este envío.", accion: "Anular enlace", peligro: true }))) return;
    iniciar(async () => {
      const r = await anularEnvioTrabajador(e.paquete);
      if (!r.ok) setResultado({ ok: false, mensaje: r.mensaje ?? "No se pudo anular." });
      recargar();
    });
  };

  return (
    <Dialog open={abierto} onOpenChange={abrir}>
      <DialogTrigger asChild>
        <Button variant="outline" data-accion="whatsapp-trabajador" aria-label="WhatsApp al trabajador" title="WhatsApp al trabajador"><MessageCircle /> <span className="hidden sm:inline">WhatsApp al trabajador</span></Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Enviar al trabajador por WhatsApp</DialogTitle>
          <DialogDescription>
            {listo ? <>A {listo.nombre}. Marca lo que puede descargar: le llega un solo enlace que dura {DIAS_ENLACE_TRABAJADOR} días y solo abre esos documentos.</> : "Preparando…"}
          </DialogDescription>
        </DialogHeader>
        {!datos && cargando ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status"><Loader2 className="size-4 animate-spin" /> Cargando…</p>
        ) : datos && "error" in datos ? (
          <p className="rounded-md bg-alerta/10 px-3 py-2 text-sm text-alerta-texto" role="alert">{datos.error}</p>
        ) : listo ? (
          <div className="grid gap-4">
            <fieldset>
              <legend className="mb-1.5 text-sm font-medium">Documentos que puede descargar</legend>
              <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                {TODOS.map((d) => {
                  const motivo = listo.noDisponibles[d];
                  const bloqueado = Boolean(motivo) || (DOCS_TRABAJADOR[d].clinico && !listo.firmada);
                  const activo = marcados.has(d) && !motivo;
                  return (
                    <label key={d} className={cn("flex items-center gap-2 rounded-lg border px-3 py-2 text-sm", bloqueado ? "cursor-not-allowed opacity-60" : "cursor-pointer hover:bg-muted/50", activo && !bloqueado && "border-primary bg-primary/5")}>
                      <input type="checkbox" className="size-4 accent-primary" checked={activo && !bloqueado} disabled={bloqueado} onChange={() => alternar(d)} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate">{DOCS_TRABAJADOR[d].corto}</span>
                        {(motivo || (DOCS_TRABAJADOR[d].clinico && !listo.firmada)) && (
                          <span className="block text-xs text-muted-foreground">{motivo ?? "firma la consulta"}</span>
                        )}
                      </span>
                      {DOCS_TRABAJADOR[d].clinico && !bloqueado && <KeyRound className="size-3.5 shrink-0 text-muted-foreground" aria-label="pide cédula" />}
                    </label>
                  );
                })}
              </div>
              <p className="mt-1.5 text-xs text-muted-foreground">
                <KeyRound className="inline size-3" /> Los documentos médicos piden los 4 últimos dígitos de su cédula para abrirse. Cada hoja sale como la dejaste en pantalla.
              </p>
            </fieldset>
            {sinFirma && <p className="rounded-md bg-aviso/10 px-3 py-2 text-sm text-aviso-texto" role="status">Firma la consulta para enviar los documentos médicos.</p>}
            <div>
              <Label htmlFor="tel-trabajador" className="mb-1.5">Celular del trabajador</Label>
              <div className="relative">
                <Smartphone className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                <input id="tel-trabajador" inputMode="tel" autoComplete="off" value={telefono} onChange={(e) => setTelefono(e.target.value)} onBlur={() => setRevisar(true)} placeholder="0414-1234567"
                  className={cn("h-11 w-full rounded-md border bg-transparent pr-3 pl-9 text-base", revisar && telefono && !valido && "border-alerta")} />
              </div>
              {revisar && !valido && <p className="mt-1 text-xs text-alerta-texto">Revisa el número. Ejemplos: 0414-1234567 o +57 300 1234567.</p>}
              {!listo.telefono && !telefono && <p className="mt-1 text-xs text-muted-foreground">La ficha no tiene celular: escríbelo aquí.</p>}
              {distinto && (
                <label className="mt-2 flex cursor-pointer items-center gap-2 text-sm">
                  <input type="checkbox" className="size-4 accent-primary" checked={guardar} onChange={(e) => setGuardar(e.target.checked)} />
                  {listo.telefono ? `Cambiar en la ficha (hoy ${mostrarTelefono(listo.telefono)})` : "Guardar este celular en la ficha"}
                </label>
              )}
            </div>
            <div>
              <Label htmlFor="msg-trabajador" className="mb-1.5">Mensaje</Label>
              <Textarea id="msg-trabajador" rows={4} maxLength={600} value={mensaje} onChange={(e) => { setMensaje(e.target.value); setEditado(true); }} />
              <p className="mt-1 text-xs text-muted-foreground">El enlace se agrega al final.{editado && <> <button type="button" className="text-primary hover:underline" onClick={() => setEditado(false)}>Volver al mensaje sugerido</button></>}</p>
            </div>
            <Button size="lg" className="bg-[#1a7f45] text-white hover:bg-[#166b3a]" disabled={enviando || !lista.length || sinFirma} onClick={mandar}>
              {enviando ? <Loader2 className="animate-spin" /> : <MessageCircle />}{" "}
              {enviando ? "Preparando los PDF…" : lista.length ? `Enviar ${lista.length} documento${lista.length === 1 ? "" : "s"} por WhatsApp` : "Marca al menos un documento"}
            </Button>
            {conCedula && !enviando && <p className="-mt-2 text-center text-xs text-muted-foreground">Al abrirlos le pedirá los 4 últimos dígitos de su cédula.</p>}
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
            {listo.envios.length > 0 && (
              <div>
                <p className="mb-1.5 text-sm font-medium">Enviados de esta consulta</p>
                <ul className="divide-y rounded-md border text-sm">
                  {listo.envios.map((e) => {
                    const anulado = e.docs.every((x) => x.anulado);
                    const vencido = new Date(e.vence).getTime() < ahora();
                    const abiertos = e.docs.reduce((n, x) => n + x.aperturas, 0);
                    const fallos = e.docs.reduce((n, x) => n + x.fallos, 0);
                    return (
                      <li key={e.paquete} className="flex items-start gap-2 px-3 py-2">
                        <span className="min-w-0 flex-1">
                          <span className={cn("block", anulado && "text-muted-foreground line-through")}>
                            {e.docs.map((x) => DOCS_TRABAJADOR[x.documento]?.corto ?? x.documento).join(" · ")}
                            {e.docs.some((x) => x.conCambios) && <span className="text-xs text-muted-foreground"> · con cambios</span>}
                          </span>
                          <span className="block text-xs text-muted-foreground">
                            {mostrarTelefono(e.telefono)} · {fechaCorta(e.creado)} ·{" "}
                            {anulado ? "anulado" : vencido ? "vencido" : abiertos ? <span className="inline-flex items-center gap-1 text-ok-texto"><Eye className="size-3" /> abierto {abiertos} {abiertos === 1 ? "vez" : "veces"}</span> : "sin abrir"}
                            {fallos > 0 && <span className="text-aviso-texto"> · {fallos} cédula{fallos === 1 ? "" : "s"} errada{fallos === 1 ? "" : "s"}{fallos >= 5 ? " (bloqueado: reenvíalo)" : ""}</span>}
                          </span>
                        </span>
                        {!anulado && !vencido && <Button size="sm" variant="ghost" disabled={enviando} onClick={() => anular(e)}>Anular</Button>}
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
