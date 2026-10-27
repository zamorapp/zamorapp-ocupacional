"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, FileText, Link2Off, Loader2, Mail, MessageCircle, Send, ShieldCheck, XCircle } from "lucide-react";
import { confirmar } from "@/components/app/confirmar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { MARCA_FECHA, MENSAJE_ENVIO, mensajeSoloConstancias, type Canal, type ConsultaLote, type Contacto, type EnvioHistorial, type ResultadoEnvio } from "@/lib/envios-tipos";
import { ESTILO_APTITUD, ETIQUETA_APTITUD, type Aptitud } from "@/lib/pacientes";
import { cn } from "@/lib/utils";
import { anularEnlace, enviar } from "./acciones";
import { Contactos } from "./contactos";

type Props = {
  empresa: { id: string; nombre: string };
  fecha: string;
  consultas: ConsultaLote[];
  contactos: Contacto[];
  historial: EnvioHistorial[];
  correo: string | null; // remitente configurado
  puedeAutorizar: boolean;
};

const fechaHora = (iso: string) =>
  new Intl.DateTimeFormat("es-VE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "America/Caracas" }).format(new Date(iso));

export function EnvioLote({ empresa, fecha, consultas, contactos, historial, correo, puedeAutorizar }: Props) {
  // Por defecto: las firmadas que aún no salieron
  const [marcadas, setMarcadas] = useState(() => new Set(consultas.filter((c) => c.firmada && !c.enviada).map((c) => c.id)));
  const [canal, setCanal] = useState<Canal>("correo");
  const [para, setPara] = useState(() => new Set(contactos.filter((c) => c.correo).map((c) => c.id)));
  const [extra, setExtra] = useState("");
  const [conConsulta, setConConsulta] = useState(true);
  const [mensaje, setMensaje] = useState(MENSAJE_ENVIO);
  const [ignorarAviso, setIgnorarAviso] = useState(false);
  const [resultado, setResultado] = useState<ResultadoEnvio | null>(null);
  const [enviando, iniciar] = useTransition();

  const sinFirmar = consultas.filter((c) => !c.firmada).length;
  const elegidas = consultas.filter((c) => marcadas.has(c.id) && c.firmada);
  const disponibles = contactos.filter((c) => (canal === "correo" ? c.correo : c.telefono));
  const destinatarios = disponibles.filter((c) => para.has(c.id));
  const autorizados = canal === "correo" && conConsulta ? destinatarios.filter((c) => c.recibeConsulta) : [];
  const extras = extra.split(/[\s,;]+/).map((x) => x.trim()).filter(Boolean);
  const total = destinatarios.length + extras.length;
  const ejemplo = mensaje.replaceAll(MARCA_FECHA, "27/10/2026, 3:40 p. m.");
  const idsPdf = elegidas.map((c) => c.id).join(",");

  const todas = useMemo(() => consultas.filter((c) => c.firmada), [consultas]);
  const alternar = (set: Set<string>, id: string) => {
    const n = new Set(set);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  };
  const cambiarCanal = (c: Canal) => {
    setCanal(c);
    setPara(new Set(contactos.filter((x) => (c === "correo" ? x.correo : x.telefono)).map((x) => x.id)));
    setResultado(null);
  };

  const mandar = async () => {
    if (!elegidas.length || !total) return;
    const ok = await confirmar({
      titulo: canal === "correo" ? `¿Enviar ${elegidas.length} evaluación${elegidas.length === 1 ? "" : "es"} a ${total} destinatario${total === 1 ? "" : "s"}?` : `¿Crear ${total} enlace${total === 1 ? "" : "s"} para WhatsApp?`,
      texto: autorizados.length ? `La consulta médica va solo a: ${autorizados.map((c) => c.nombre).join(", ")}. El resto recibe las constancias.` : "Se envían solo las constancias de aptitud.",
      accion: canal === "correo" ? "Enviar" : "Crear enlaces",
    });
    if (!ok) return;
    iniciar(async () => {
      setResultado(
        await enviar({
          empresaId: empresa.id,
          fecha,
          consultaIds: elegidas.map((c) => c.id),
          contactoIds: destinatarios.map((c) => c.id),
          correosExtra: canal === "correo" ? extras : [],
          telefonosExtra: canal === "whatsapp" ? extras : [],
          canal,
          incluirConsulta: conConsulta,
          mensaje,
        }),
      );
    });
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <Card className="gap-0 py-0">
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 border-b py-4">
            <CardTitle className="text-base">Evaluaciones del día · {consultas.length}</CardTitle>
            {todas.length > 0 && (
              <Button variant="ghost" size="sm" onClick={() => setMarcadas(marcadas.size === todas.length ? new Set() : new Set(todas.map((c) => c.id)))}>
                {marcadas.size === todas.length ? "Desmarcar todas" : "Marcar todas las firmadas"}
              </Button>
            )}
          </CardHeader>
          <CardContent className="px-0">
            {sinFirmar > 0 && !ignorarAviso && (
              <div className="flex flex-wrap items-start gap-3 border-b bg-aviso/10 px-4 py-3 text-sm">
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-aviso-texto" />
                <p className="min-w-0 flex-1">{sinFirmar} sin firmar: no entran en el envío hasta que se firmen.</p>
                <Button variant="ghost" size="sm" onClick={() => setIgnorarAviso(true)}>Ignorar</Button>
              </div>
            )}
            {consultas.length === 0 ? (
              <p className="px-6 py-10 text-center text-sm text-muted-foreground">No hay evaluaciones de {empresa.nombre} este día.</p>
            ) : (
              <ul className="divide-y">
                {consultas.map((c) => (
                  <li key={c.id}>
                    <label className={cn("flex items-center gap-3 px-4 py-2.5 text-sm", c.firmada ? "cursor-pointer hover:bg-muted/50" : "opacity-60")}>
                      <input type="checkbox" className="size-4 accent-primary" disabled={!c.firmada} checked={marcadas.has(c.id) && c.firmada} onChange={() => setMarcadas((s) => alternar(s, c.id))} aria-label={`Incluir a ${c.paciente}`} />
                      <span className="w-12 shrink-0 font-mono text-xs text-muted-foreground">{c.hora}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{c.paciente}</span>
                        <span className="block truncate text-xs text-muted-foreground">{[c.cedula, c.motivo].filter(Boolean).join(" · ")}</span>
                      </span>
                      {c.aptitud && <span className={cn("hidden rounded-full px-2 py-0.5 text-xs font-medium sm:inline", ESTILO_APTITUD[c.aptitud as Aptitud])}>{ETIQUETA_APTITUD[c.aptitud as Aptitud]}</span>}
                      {!c.firmada ? <span className="rounded-full bg-aviso/20 px-2 py-0.5 text-xs font-medium text-aviso-texto">Sin firmar</span> : c.enviada ? <span className="text-xs text-ok-texto" title="Ya se envió en este lote">✓ Enviada</span> : null}
                    </label>
                  </li>
                ))}
              </ul>
            )}
            {elegidas.length > 0 && (
              <div className="flex flex-wrap gap-2 border-t px-4 py-3 text-sm">
                <Button variant="outline" size="sm" asChild><Link href={`/imprimir/lote?doc=constancia&ids=${idsPdf}`} target="_blank"><FileText /> Ver constancias</Link></Button>
                <Button variant="outline" size="sm" asChild><Link href={`/imprimir/lote?doc=consulta&ids=${idsPdf}`} target="_blank"><FileText /> Ver consultas</Link></Button>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-base">Enviar a {empresa.nombre}</CardTitle>
            <Contactos empresaId={empresa.id} contactos={contactos} puedeAutorizar={puedeAutorizar} />
          </CardHeader>
          <CardContent className="space-y-5">
            <div role="radiogroup" aria-label="Cómo enviar" className="grid grid-cols-2 gap-2">
              {([["correo", "Correo con PDF", Mail], ["whatsapp", "WhatsApp con enlace", MessageCircle]] as const).map(([v, t, Icono]) => (
                <button key={v} type="button" role="radio" aria-checked={canal === v} onClick={() => cambiarCanal(v)}
                  className={cn("flex items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-medium", canal === v ? "border-primary bg-primary/10 text-primary" : "hover:bg-muted")}>
                  <Icono className="size-4" /> {t}
                </button>
              ))}
            </div>
            {canal === "correo" && !correo && (
              <p className="flex items-start gap-2 rounded-md bg-aviso/10 px-3 py-2 text-sm text-aviso-texto"><AlertTriangle className="mt-0.5 size-4 shrink-0" /> Falta conectar el correo remitente. Mientras tanto puedes usar WhatsApp o «Ver constancias» para descargar el PDF.</p>
            )}

            <div>
              <Label className="mb-1.5">Para</Label>
              {disponibles.length === 0 ? (
                <p className="rounded-md border border-dashed px-3 py-3 text-sm text-muted-foreground">Sin contactos con {canal === "correo" ? "correo" : "teléfono"}. Agrégalos con «Contactos».</p>
              ) : (
                <ul className="divide-y rounded-md border">
                  {disponibles.map((c) => (
                    <li key={c.id}>
                      <label className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm hover:bg-muted/50">
                        <input type="checkbox" className="size-4 accent-primary" checked={para.has(c.id)} onChange={() => setPara((s) => alternar(s, c.id))} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium">{c.nombre}{c.cargo && <span className="font-normal text-muted-foreground"> · {c.cargo}</span>}</span>
                          <span className="block truncate text-xs text-muted-foreground">{canal === "correo" ? c.correo : c.telefono}</span>
                        </span>
                        {c.recibeConsulta && canal === "correo" && <span className="flex shrink-0 items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary" title="Personal de salud autorizado: recibe la consulta médica"><ShieldCheck className="size-3" /> Salud</span>}
                      </label>
                    </li>
                  ))}
                </ul>
              )}
              <input value={extra} onChange={(e) => setExtra(e.target.value)} placeholder={canal === "correo" ? "Otro correo (solo recibe constancias)" : "Otro teléfono, p. ej. 0414-1234567"} aria-label="Otro destinatario"
                className="mt-2 h-10 w-full rounded-md border bg-transparent px-3 text-sm" />
            </div>

            {canal === "correo" ? (
              <label className="flex items-start gap-3 rounded-md border px-3 py-2.5 text-sm">
                <input type="checkbox" className="mt-0.5 size-4 accent-primary" checked={conConsulta} onChange={(e) => setConConsulta(e.target.checked)} />
                <span>Incluir la consulta médica <span className="block text-xs text-muted-foreground">Solo a personal de salud autorizado ({autorizados.length ? autorizados.map((c) => c.nombre).join(", ") : "ninguno elegido"}). Los demás reciben solo las constancias.</span></span>
              </label>
            ) : (
              <p className="text-xs text-muted-foreground">Por WhatsApp va un enlace seguro a las constancias que vence en 7 días y se puede anular. La consulta médica nunca va por WhatsApp.</p>
            )}

            <div>
              <Label htmlFor="mensaje" className="mb-1.5">Mensaje</Label>
              <Textarea id="mensaje" rows={5} value={mensaje} onChange={(e) => setMensaje(e.target.value)} />
              <p className="mt-1 text-xs text-muted-foreground">{MARCA_FECHA} se cambia por la fecha y hora del envío. A quien no recibe la consulta le llega: «{mensajeSoloConstancias(ejemplo).slice(0, 110)}…»</p>
            </div>

            <Button className="w-full" size="lg" disabled={enviando || !elegidas.length || !total || (canal === "correo" && !correo)} onClick={mandar}>
              {enviando ? <Loader2 className="animate-spin" /> : <Send />}
              {enviando ? "Preparando PDF y enviando…" : `${canal === "correo" ? "Enviar" : "Crear enlaces"} · ${elegidas.length} evaluación${elegidas.length === 1 ? "" : "es"}`}
            </Button>

            {resultado && (
              <div className={cn("space-y-2 rounded-md px-3 py-3 text-sm", resultado.ok ? "bg-ok/10" : "bg-destructive/10")} role="status">
                <p className={cn("font-medium", resultado.ok ? "text-ok-texto" : "text-destructive")}>{resultado.mensaje}</p>
                {resultado.detalle?.filter((d) => d.estado === "fallido").map((d) => <p key={d.destinatario} className="flex gap-1.5 text-xs text-destructive"><XCircle className="size-3.5 shrink-0" /> {d.destinatario}: {d.error}</p>)}
                {resultado.enlaces?.map((l) => (
                  <Button key={l.whatsapp} variant="outline" size="sm" className="mr-2" asChild><a href={l.whatsapp} target="_blank" rel="noreferrer"><MessageCircle /> Abrir WhatsApp · {l.nombre}</a></Button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="gap-0 py-0">
        <CardHeader className="border-b py-4"><CardTitle className="text-base">Envíos a esta empresa</CardTitle></CardHeader>
        <CardContent className="px-0">
          {historial.length === 0 ? <p className="px-6 py-8 text-center text-sm text-muted-foreground">Aún no hay envíos.</p> : (
            <ul className="divide-y">
              {historial.map((h) => <FilaHistorial key={h.id} h={h} />)}
            </ul>
          )}
          <p className="px-6 py-2 text-[11px] text-muted-foreground">El registro no se puede editar ni borrar. Si una consulta enviada se reabre para corregirla, su enlace de WhatsApp se anula solo.</p>
        </CardContent>
      </Card>
    </div>
  );
}

function FilaHistorial({ h }: { h: EnvioHistorial }) {
  const [anulando, iniciar] = useTransition();
  const vigente = h.enlace && !h.enlace.revocado && new Date(h.enlace.vence) > new Date();
  const estado = h.estado === "fallido"
    ? { t: "Falló", c: "bg-destructive/10 text-destructive" }
    : h.enlace
      ? vigente ? { t: `Enlace · ${h.enlace.aperturas} apertura${h.enlace.aperturas === 1 ? "" : "s"}`, c: "bg-primary/10 text-primary" } : { t: h.enlace.revocado ? "Enlace anulado" : "Enlace vencido", c: "bg-muted text-muted-foreground" }
      : { t: "Enviado", c: "bg-ok/15 text-ok-texto" };
  return (
    <li className="flex flex-wrap items-center gap-3 px-6 py-2.5 text-sm">
      <span className="w-36 shrink-0 font-mono text-xs text-muted-foreground">{fechaHora(h.creadoEn)}</span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5 font-medium">{h.canal === "correo" ? <Mail className="size-3.5" /> : <MessageCircle className="size-3.5" />} {h.destinatario}</span>
        <span className="block text-xs text-muted-foreground">{h.cantidad} evaluación{h.cantidad === 1 ? "" : "es"} del {h.fechaLote.split("-").reverse().join("/")} · {h.documentos.map((d) => (d === "consulta" ? "consulta médica" : "constancias")).join(" y ")}{h.error && ` · ${h.error}`}</span>
      </span>
      <span className={cn("flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium", estado.c)}>{h.estado === "enviado" && <CheckCircle2 className="size-3" />}{estado.t}</span>
      {vigente && (
        <Button variant="ghost" size="sm" disabled={anulando} onClick={async () => {
          if (!(await confirmar({ titulo: "¿Anular este enlace?", texto: "La empresa ya no podrá abrir el PDF. No se puede deshacer.", accion: "Anular", peligro: true }))) return;
          iniciar(async () => { await anularEnlace(h.id); });
        }}><Link2Off /> Anular</Button>
      )}
    </li>
  );
}
