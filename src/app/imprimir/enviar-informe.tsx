"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Loader2, Mail, MessageCircle, Send, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ASUNTO_INFORME, MENSAJE_INFORME, NOMBRE_DOCUMENTO, type Canal, type Contacto, type DocInforme, type ResultadoEnvio } from "@/lib/envios-tipos";
import { cn } from "@/lib/utils";
import { datosEnvioInforme, enviarInformeEmpresa } from "./enviar-acciones";

export type EnvioInforme = { documento: DocInforme; empresaId: string; empresa: string };

// «Enviar a la empresa» en la barra de un informe (puesto, vigilancia, pacientes atendidos): el PDF de esta misma página
// sale a los contactos de la empresa por correo o por enlace de WhatsApp, con registro en la Bitácora de Envíos.
export function EnviarInforme({ documento, empresaId, empresa }: EnvioInforme) {
  const [abierto, setAbierto] = useState(false);
  const [datos, setDatos] = useState<{ contactos: Contacto[]; correo: string | null } | null>(null);
  const [canal, setCanal] = useState<Canal>("correo");
  const [para, setPara] = useState<Set<string>>(new Set());
  const [extra, setExtra] = useState("");
  const [asunto, setAsunto] = useState(ASUNTO_INFORME);
  const [mensaje, setMensaje] = useState(MENSAJE_INFORME);
  const [resultado, setResultado] = useState<ResultadoEnvio | null>(null);
  const [cargando, iniciarCarga] = useTransition();
  const [enviando, iniciar] = useTransition();
  const nombre = NOMBRE_DOCUMENTO[documento];

  const elegir = (lista: Contacto[], c: Canal) => setPara(new Set(lista.filter((x) => (c === "correo" ? x.correo : x.telefono)).map((x) => x.id)));
  const abrir = (v: boolean) => {
    setAbierto(v);
    if (!v || datos) return;
    iniciarCarga(async () => {
      const d = await datosEnvioInforme(empresaId);
      setDatos(d ?? { contactos: [], correo: null });
      elegir(d?.contactos ?? [], canal);
    });
  };
  const cambiarCanal = (c: Canal) => {
    setCanal(c);
    elegir(datos?.contactos ?? [], c);
    setResultado(null);
  };
  const disponibles = (datos?.contactos ?? []).filter((c) => (canal === "correo" ? c.correo : c.telefono));
  const extras = extra.split(/[\s,;]+/).map((x) => x.trim()).filter(Boolean);
  const total = disponibles.filter((c) => para.has(c.id)).length + extras.length;

  const mandar = () =>
    iniciar(async () => {
      setResultado(
        await enviarInformeEmpresa({
          empresaId,
          documento,
          ruta: `${window.location.pathname}${window.location.search}`,
          contactoIds: disponibles.filter((c) => para.has(c.id)).map((c) => c.id),
          correosExtra: canal === "correo" ? extras : [],
          telefonosExtra: canal === "whatsapp" ? extras : [],
          canal,
          asunto,
          mensaje,
        }),
      );
    });

  return (
    <Dialog open={abierto} onOpenChange={abrir}>
      <DialogTrigger asChild>
        <Button variant="outline"><Send /> Enviar a la empresa</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Enviar {nombre.toLowerCase()}</DialogTitle>
          <DialogDescription>A {empresa}. Sale el PDF de esta página y queda en la Bitácora de Envíos.</DialogDescription>
        </DialogHeader>
        {cargando || !datos ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status"><Loader2 className="size-4 animate-spin" /> Cargando contactos…</p>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            <div role="radiogroup" aria-label="Cómo enviar" className="grid grid-cols-2 gap-2">
              {([["correo", "Correo con PDF", Mail], ["whatsapp", "WhatsApp con enlace", MessageCircle]] as const).map(([v, t, Icono]) => (
                <button key={v} type="button" role="radio" aria-checked={canal === v} onClick={() => cambiarCanal(v)}
                  className={cn("flex items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-medium", canal === v ? "border-primary bg-primary/10 text-primary" : "hover:bg-muted")}>
                  <Icono className="size-4" /> {t}
                </button>
              ))}
            </div>
            {canal === "correo" && !datos.correo && <p className="rounded-md bg-aviso/10 px-3 py-2 text-sm text-aviso-texto">Falta conectar el correo remitente. Mientras tanto usa WhatsApp.</p>}
            <div>
              <Label className="mb-1.5">Para</Label>
              {disponibles.length === 0 ? (
                <p className="rounded-md border border-dashed px-3 py-3 text-sm text-muted-foreground">Sin contactos con {canal === "correo" ? "correo" : "teléfono"}. Agrégalos en <Link href="/envios" className="text-primary hover:underline">Envíos › Contactos</Link>.</p>
              ) : (
                <ul className="max-h-48 divide-y overflow-y-auto rounded-md border">
                  {disponibles.map((c) => (
                    <li key={c.id}>
                      <label className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm hover:bg-muted/50">
                        <input type="checkbox" className="size-4 accent-primary" checked={para.has(c.id)}
                          onChange={() => setPara((s) => { const n = new Set(s); if (n.has(c.id)) n.delete(c.id); else n.add(c.id); return n; })} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium">{c.nombre}{c.cargo && <span className="font-normal text-muted-foreground"> · {c.cargo}</span>}</span>
                          <span className="block truncate text-xs text-muted-foreground">{canal === "correo" ? c.correo : c.telefono}</span>
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              )}
              <input value={extra} onChange={(e) => setExtra(e.target.value)} aria-label="Otro destinatario" placeholder={canal === "correo" ? "Otro correo" : "Otro teléfono, p. ej. 0414-1234567"}
                className="mt-2 h-10 w-full rounded-md border bg-transparent px-3 text-sm" />
            </div>
            {canal === "correo" && (
              <div>
                <Label htmlFor="asunto-informe" className="mb-1.5">Asunto</Label>
                <input id="asunto-informe" value={asunto} onChange={(e) => setAsunto(e.target.value)} maxLength={200} className="h-10 w-full rounded-md border bg-transparent px-3 text-sm" />
              </div>
            )}
            <div>
              <Label htmlFor="mensaje-informe" className="mb-1.5">Mensaje</Label>
              <Textarea id="mensaje-informe" rows={4} value={mensaje} onChange={(e) => setMensaje(e.target.value)} />
              <p className="mt-1 text-xs text-muted-foreground">Se cambian al enviar: [documento], [empresa], [fecha y hora].</p>
            </div>
            <Button size="lg" disabled={enviando || !total || (canal === "correo" && !datos.correo)} onClick={mandar}>
              {enviando ? <Loader2 className="animate-spin" /> : <Send />} {enviando ? "Preparando PDF y enviando…" : canal === "correo" ? `Enviar a ${total} destinatario${total === 1 ? "" : "s"}` : `Crear ${total} enlace${total === 1 ? "" : "s"}`}
            </Button>
            {resultado && (
              <div className={cn("space-y-2 rounded-md px-3 py-3 text-sm", resultado.ok ? "bg-ok/10" : "bg-destructive/10")} role="status">
                <p className={cn("font-medium", resultado.ok ? "text-ok-texto" : "text-destructive")}>{resultado.mensaje}</p>
                {resultado.detalle?.filter((d) => d.estado === "fallido").map((d) => <p key={d.destinatario} className="flex gap-1.5 text-xs text-destructive"><XCircle className="size-3.5 shrink-0" /> {d.destinatario}: {d.error}</p>)}
                {resultado.enlaces?.map((l) => (
                  <Button key={l.whatsapp} variant="outline" size="sm" className="mr-2 max-w-full" asChild><a href={l.whatsapp} target="_blank" rel="noreferrer"><MessageCircle /> <span className="truncate">Abrir WhatsApp · {l.nombre}</span></a></Button>
                ))}
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
