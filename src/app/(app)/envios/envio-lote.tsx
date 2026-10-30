"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, FileText, Link2Off, Mail, MessageCircle } from "lucide-react";
import { confirmar } from "@/components/app/confirmar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { describirEnvio, type ConsultaLote, type Contacto, type EnvioHistorial, type Plantilla } from "@/lib/envios-tipos";
import { ESTILO_APTITUD, ETIQUETA_APTITUD, type Aptitud } from "@/lib/pacientes";
import { cn } from "@/lib/utils";
import { anularEnlace } from "./acciones";
import { PanelEnvio } from "./panel-envio";
import { ahora } from "@/lib/fecha";

type Props = {
  empresa: { id: string; nombre: string };
  fecha: string;
  consultas: ConsultaLote[];
  contactos: Contacto[];
  historial: EnvioHistorial[];
  plantillas: Plantilla[];
  correo: string | null; // remitente configurado
  puedeAutorizar: boolean;
};

const fechaHora = (iso: string) =>
  new Intl.DateTimeFormat("es-VE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "America/Caracas" }).format(new Date(iso));

export function EnvioLote({ empresa, fecha, consultas, contactos, historial, plantillas, correo, puedeAutorizar }: Props) {
  // Por defecto: las firmadas que aún no salieron
  const [marcadas, setMarcadas] = useState(() => new Set(consultas.filter((c) => c.firmada && !c.enviada).map((c) => c.id)));
  const [ignorarAviso, setIgnorarAviso] = useState(false);

  const sinFirmar = consultas.filter((c) => !c.firmada).length;
  const elegidas = consultas.filter((c) => marcadas.has(c.id) && c.firmada);
  const idsPdf = elegidas.map((c) => c.id).join(",");

  const todas = useMemo(() => consultas.filter((c) => c.firmada), [consultas]);
  const alternar = (set: Set<string>, id: string) => {
    const n = new Set(set);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
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

        <PanelEnvio empresa={empresa} fecha={fecha} consultaIds={elegidas.map((c) => c.id)} contactos={contactos} plantillas={plantillas} correo={correo} puedeAutorizar={puedeAutorizar} />
      </div>

      <Card className="gap-0 py-0">
        <CardHeader className="border-b py-4"><CardTitle className="flex items-center justify-between gap-2 text-base">Envíos a esta empresa <Link href={`/envios/bitacora?empresa=${empresa.id}`} className="text-sm font-normal text-primary hover:underline">Bitácora completa</Link></CardTitle></CardHeader>
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
  const vigente = h.enlace && !h.enlace.revocado && new Date(h.enlace.vence) > new Date(ahora());
  const estado = h.estado === "fallido"
    ? { t: "Falló", c: "bg-destructive/10 text-destructive" }
    : h.estado === "en_cola"
    ? { t: "En cola · sale al volver el internet", c: "bg-info/10 text-info-texto" }
    : h.estado === "enviando"
    ? { t: "Sin confirmar", c: "bg-aviso/20 text-aviso-texto" }
    : h.enlace
      ? vigente ? { t: `Enlace · ${h.enlace.aperturas} apertura${h.enlace.aperturas === 1 ? "" : "s"}`, c: "bg-primary/10 text-primary" } : { t: h.enlace.revocado ? "Enlace anulado" : "Enlace vencido", c: "bg-muted text-muted-foreground" }
      : { t: "Enviado", c: "bg-ok/15 text-ok-texto" };
  return (
    <li className="flex flex-wrap items-center gap-3 px-6 py-2.5 text-sm">
      <span className="w-36 shrink-0 font-mono text-xs text-muted-foreground">{fechaHora(h.creadoEn)}</span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5 font-medium">{h.canal === "correo" ? <Mail className="size-3.5" /> : <MessageCircle className="size-3.5" />} {h.destinatario}</span>
        <span className="block text-xs text-muted-foreground">{describirEnvio(h.documentos, h.cantidad, h.fechaLote)}{h.error && ` · ${h.error}`}</span>
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
