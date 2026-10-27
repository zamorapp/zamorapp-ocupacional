"use client";

import { useState, useTransition } from "react";
import { AlertTriangle, Loader2, Mail, MessageCircle, Send, ShieldCheck, XCircle } from "lucide-react";
import { confirmar } from "@/components/app/confirmar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { MARCA_FECHA, MENSAJE_ENVIO, mensajeSoloConstancias, type Canal, type Contacto, type ResultadoEnvio } from "@/lib/envios-tipos";
import { cn } from "@/lib/utils";
import { enviar } from "./acciones";
import { Contactos } from "./contactos";

type Props = {
  empresa: { id: string; nombre: string };
  fecha: string; // fecha del lote que queda en el registro de envíos
  consultaIds: string[]; // solo firmadas
  contactos: Contacto[];
  correo: string | null; // remitente configurado
  puedeAutorizar: boolean;
};

const alternar = (set: Set<string>, id: string) => {
  const n = new Set(set);
  if (n.has(id)) n.delete(id); else n.add(id);
  return n;
};

/** Destinatarios, canal y mensaje del envío a la empresa. Lo usan Envíos (lote del día) y Reportes › Aptitud emitida (lote del período). */
export function PanelEnvio({ empresa, fecha, consultaIds, contactos, correo, puedeAutorizar }: Props) {
  const [canal, setCanal] = useState<Canal>("correo");
  const [para, setPara] = useState(() => new Set(contactos.filter((c) => c.correo).map((c) => c.id)));
  const [extra, setExtra] = useState("");
  const [conConsulta, setConConsulta] = useState(true);
  const [mensaje, setMensaje] = useState(MENSAJE_ENVIO);
  const [resultado, setResultado] = useState<ResultadoEnvio | null>(null);
  const [enviando, iniciar] = useTransition();

  const disponibles = contactos.filter((c) => (canal === "correo" ? c.correo : c.telefono));
  const destinatarios = disponibles.filter((c) => para.has(c.id));
  const autorizados = canal === "correo" && conConsulta ? destinatarios.filter((c) => c.recibeConsulta) : [];
  const extras = extra.split(/[\s,;]+/).map((x) => x.trim()).filter(Boolean);
  const total = destinatarios.length + extras.length;
  const ejemplo = mensaje.replaceAll(MARCA_FECHA, "27/10/2026, 3:40 p. m.");
  const cambiarCanal = (c: Canal) => {
    setCanal(c);
    setPara(new Set(contactos.filter((x) => (c === "correo" ? x.correo : x.telefono)).map((x) => x.id)));
    setResultado(null);
  };

  const mandar = async () => {
    if (!consultaIds.length || !total) return;
    const ok = await confirmar({
      titulo: canal === "correo" ? `¿Enviar ${consultaIds.length} evaluación${consultaIds.length === 1 ? "" : "es"} a ${total} destinatario${total === 1 ? "" : "s"}?` : `¿Crear ${total} enlace${total === 1 ? "" : "s"} para WhatsApp?`,
      texto: autorizados.length ? `La consulta médica va solo a: ${autorizados.map((c) => c.nombre).join(", ")}. El resto recibe las constancias.` : "Se envían solo las constancias de aptitud.",
      accion: canal === "correo" ? "Enviar" : "Crear enlaces",
    });
    if (!ok) return;
    iniciar(async () => {
      setResultado(
        await enviar({
          empresaId: empresa.id,
          fecha,
          consultaIds,
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

        <Button className="w-full" size="lg" disabled={enviando || !consultaIds.length || !total || (canal === "correo" && !correo)} onClick={mandar}>
          {enviando ? <Loader2 className="animate-spin" /> : <Send />}
          {enviando ? "Preparando PDF y enviando…" : `${canal === "correo" ? "Enviar" : "Crear enlaces"} · ${consultaIds.length} evaluación${consultaIds.length === 1 ? "" : "es"}`}
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
  );
}
