"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Download, Loader2, Mail, MessageCircle, RotateCw, XCircle } from "lucide-react";
import { Campo, CampoSelect } from "@/components/app/campo";
import { confirmar } from "@/components/app/confirmar";
import { Button } from "@/components/ui/button";
import type { FilaBitacora, ResultadoEnvio } from "@/lib/envios-tipos";
import { cn } from "@/lib/utils";
import { reintentar } from "../acciones";

type Filtros = { empresa: string; estado: string; canal: string; desde: string; hasta: string };

const fechaHora = (iso: string) =>
  new Intl.DateTimeFormat("es-VE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "America/Caracas" }).format(new Date(iso));
const dia = (iso: string) => iso.split("-").reverse().join("/");

function estadoDe(h: FilaBitacora) {
  if (h.estado === "fallido") return h.reintentado ? { t: "Falló · reintentado", c: "bg-muted text-muted-foreground" } : { t: "Falló", c: "bg-destructive/10 text-destructive" };
  if (h.estado === "enviando") return h.reintentado ? { t: "Sin confirmar · reintentado", c: "bg-muted text-muted-foreground" } : { t: "Sin confirmar", c: "bg-aviso/20 text-aviso-texto" };
  if (h.enlace) {
    const vigente = !h.enlace.revocado && new Date(h.enlace.vence) > new Date();
    return vigente
      ? { t: `Enlace · ${h.enlace.aperturas} apertura${h.enlace.aperturas === 1 ? "" : "s"}`, c: "bg-primary/10 text-primary" }
      : { t: h.enlace.revocado ? "Enlace anulado" : "Enlace vencido", c: "bg-muted text-muted-foreground" };
  }
  return { t: h.reintentoDe ? "Enviado (reintento)" : "Enviado", c: "bg-ok/15 text-ok-texto" };
}

// Valores que empiezan por = + - @ se protegen para que Excel no los ejecute como fórmula
const celda = (v: string) => `"${(/^[=+\-@\t\r]/.test(v) ? "'" + v : v).replaceAll('"', '""')}"`;

function exportar(filas: FilaBitacora[]) {
  const cab = "FECHA;EMPRESA;CANAL;DESTINATARIO;DOCUMENTOS;EVALUACIONES;DIA DEL LOTE;ESTADO;ERROR;ENVIADO POR";
  const lineas = filas.map((h) =>
    [fechaHora(h.creadoEn), h.empresa, h.canal, h.destinatario, h.documentos.join(" y "), String(h.cantidad), dia(h.fechaLote), estadoDe(h).t, h.error ?? "", h.enviadoPor ?? ""].map(celda).join(";"),
  );
  const url = URL.createObjectURL(new Blob(["﻿" + [cab, ...lineas].join("\r\n")], { type: "text/csv;charset=utf-8" }));
  Object.assign(document.createElement("a"), { href: url, download: "bitacora-envios.csv" }).click();
  URL.revokeObjectURL(url);
}

export function TablaBitacora({ filas, filtros, empresas }: { filas: FilaBitacora[]; filtros: Filtros; empresas: { id: string; nombre: string }[] }) {
  const router = useRouter();
  const [resultado, setResultado] = useState<ResultadoEnvio | null>(null);
  const [trabajando, iniciar] = useTransition();
  const [enCurso, setEnCurso] = useState<string | null>(null);
  const pendientes = filas.filter((h) => h.reintentable);

  const ir = (cambios: Partial<Filtros>) => {
    const p = new URLSearchParams(Object.entries({ ...filtros, ...cambios }).filter(([, v]) => v));
    router.replace(`/envios/bitacora${p.size ? `?${p}` : ""}`);
  };

  const reenviar = async (ids: string[], clave: string) => {
    const sinConfirmar = filas.filter((h) => ids.includes(h.id) && h.estado === "enviando").length;
    const ok = await confirmar({
      titulo: ids.length === 1 ? "¿Reintentar este correo?" : `¿Reintentar ${ids.length} correos?`,
      texto: `Se vuelve a generar el PDF y se manda el mismo correo al mismo destinatario.${sinConfirmar ? " Los «sin confirmar» pudieron haber llegado: la empresa podría recibirlos dos veces." : ""}${ids.length > 10 ? " Van de 10 en 10." : ""}`,
      accion: "Reintentar",
    });
    if (!ok) return;
    setEnCurso(clave);
    iniciar(async () => {
      setResultado(await reintentar(ids));
      setEnCurso(null);
    });
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 rounded-xl border bg-card p-4 md:grid-cols-5">
        <CampoSelect id="empresa" etiqueta="Empresa" value={filtros.empresa} onChange={(e) => ir({ empresa: e.target.value })} className="col-span-2 md:col-span-1">
          <option value="">Todas</option>
          {empresas.map((e) => <option key={e.id} value={e.id}>{e.nombre}</option>)}
        </CampoSelect>
        <CampoSelect id="estado" etiqueta="Estado" value={filtros.estado} onChange={(e) => ir({ estado: e.target.value })}>
          <option value="">Todos</option>
          <option value="pendiente">Por reintentar</option>
          <option value="fallido">Fallidos</option>
          <option value="enviando">Sin confirmar</option>
          <option value="enviado">Enviados</option>
          <option value="enlace">Enlaces de WhatsApp</option>
        </CampoSelect>
        <CampoSelect id="canal" etiqueta="Canal" value={filtros.canal} onChange={(e) => ir({ canal: e.target.value })}>
          <option value="">Correo y WhatsApp</option>
          <option value="correo">Correo</option>
          <option value="whatsapp">WhatsApp</option>
        </CampoSelect>
        <Campo id="desde" etiqueta="Desde" type="date" value={filtros.desde} onChange={(e) => ir({ desde: e.target.value })} />
        <Campo id="hasta" etiqueta="Hasta" type="date" value={filtros.hasta} onChange={(e) => ir({ hasta: e.target.value })} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {pendientes.length > 0 && (
          <Button disabled={trabajando} onClick={() => reenviar(pendientes.map((h) => h.id), "todos")}>
            {enCurso === "todos" ? <Loader2 className="animate-spin" /> : <RotateCw />} Reintentar {pendientes.length} pendiente{pendientes.length === 1 ? "" : "s"}
          </Button>
        )}
        <Button variant="outline" disabled={!filas.length} onClick={() => exportar(filas)}><Download /> Exportar a Excel</Button>
        <span className="text-sm text-muted-foreground">{filas.length} envío{filas.length === 1 ? "" : "s"}{filas.length >= 300 ? " (los 300 más recientes: usa los filtros)" : ""}</span>
      </div>

      {resultado && (
        <div className={cn("space-y-1 rounded-md px-3 py-3 text-sm", resultado.ok ? "bg-ok/10" : "bg-destructive/10")} role="status">
          <p className={cn("font-medium", resultado.ok ? "text-ok-texto" : "text-destructive")}>{resultado.mensaje}</p>
          {resultado.detalle?.filter((d) => d.estado === "fallido").map((d, i) => <p key={i} className="flex gap-1.5 text-xs text-destructive"><XCircle className="size-3.5 shrink-0" /> {d.destinatario}: {d.error}</p>)}
        </div>
      )}

      {filas.length === 0 ? (
        <p className="rounded-lg border bg-card p-8 text-center text-sm text-muted-foreground">No hay envíos con esos filtros.</p>
      ) : (
        <ul className="divide-y rounded-xl border bg-card">
          {filas.map((h) => {
            const e = estadoDe(h);
            return (
              <li key={h.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-sm">
                <span className="w-36 shrink-0 font-mono text-xs text-muted-foreground">{fechaHora(h.creadoEn)}</span>
                <span className="min-w-0 flex-1 basis-60">
                  <span className="flex min-w-0 items-center gap-1.5 font-medium">
                    {h.canal === "correo" ? <Mail className="size-3.5 shrink-0" /> : <MessageCircle className="size-3.5 shrink-0" />}
                    <span className="truncate">{h.destinatario}</span>
                    <span className="shrink-0 font-normal text-muted-foreground">· {h.empresa}</span>
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {h.cantidad} evaluación{h.cantidad === 1 ? "" : "es"} del {dia(h.fechaLote)} · {h.documentos.map((d) => (d === "consulta" ? "consulta médica" : "constancias")).join(" y ")}
                    {h.enviadoPor && ` · por ${h.enviadoPor}`}
                  </span>
                  {h.error && <span className="block break-words text-xs text-destructive">{h.error}</span>}
                </span>
                <span className={cn("flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium", e.c)}>{h.estado === "enviado" && <CheckCircle2 className="size-3" />}{e.t}</span>
                {h.reintentable && (
                  <Button variant="outline" size="sm" disabled={trabajando} onClick={() => reenviar([h.id], h.id)}>
                    {enCurso === h.id ? <Loader2 className="animate-spin" /> : <RotateCw />} Reintentar
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <p className="text-[11px] text-muted-foreground">La bitácora no se edita ni se borra. Un reintento queda como un envío nuevo enlazado al que falló.</p>
    </div>
  );
}
