"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FileText, Loader2, PenLine, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { confirmar } from "@/components/app/confirmar";
import type { Contacto, Plantilla } from "@/lib/envios-tipos";
import { MAX_LOTE } from "@/lib/envios-tipos";
import type { EstadoLote } from "@/lib/lote-aptitud";
import { PanelEnvio } from "../../envios/panel-envio";
import { ESTILO_APTITUD } from "@/lib/pacientes";
import { cn } from "@/lib/utils";
import { firmarMiasDelLote } from "../acciones";

type Fila = Record<string, string | number | null>;
type Filtro = "" | "firmada" | "pendiente";
const POR_PAGINA = 100;
const fecha = (iso: unknown) => (typeof iso === "string" && iso ? iso.slice(0, 10).split("-").reverse().join("/") : "—");

/** Reportes › Aptitud emitida con una empresa elegida: marcar trabajadores y sacar sus constancias en un solo PDF. */
export function LoteAptitud({ filas, estados, empresa, usuarioId, puedeFirmar, envio }: {
  filas: Fila[]; estados: Record<string, EstadoLote>; empresa: { id: string; nombre: string }; usuarioId: string; puedeFirmar: boolean;
  // Envío a la empresa (correo con PDF o enlace por WhatsApp): mismo módulo que la pantalla Envíos
  envio: { fecha: string; contactos: Contacto[]; plantillas: Plantilla[]; correo: string | null; puedeAutorizar: boolean } | null;
}) {
  const router = useRouter();
  const firmada = (id: unknown) => estados[String(id)]?.estado === "firmada";
  const [sel, setSel] = useState<Set<string>>(() => new Set(filas.filter((f) => firmada(f.id)).slice(0, MAX_LOTE).map((f) => String(f.id))));
  const [filtro, setFiltro] = useState<Filtro>("");
  const [visibles, setVisibles] = useState(POR_PAGINA);
  const [ignorar, setIgnorar] = useState(false);
  const [aviso, setAviso] = useState<{ ok: boolean; mensaje: string } | null>(null);
  const [ocupado, iniciar] = useTransition();
  const [enviando, setEnviando] = useState(false);

  const vista = useMemo(() => filas.filter((f) => !filtro || (filtro === "firmada") === firmada(f.id)), [filas, filtro, estados]); // eslint-disable-line react-hooks/exhaustive-deps
  const sinFirmar = filas.filter((f) => !firmada(f.id));
  const mias = sinFirmar.filter((f) => estados[String(f.id)]?.estado === "cerrada" && estados[String(f.id)]?.medicoId === usuarioId);
  const marcadas = filas.filter((f) => sel.has(String(f.id)));
  const listas = marcadas.filter((f) => firmada(f.id));
  const todas = vista.length > 0 && vista.every((f) => sel.has(String(f.id)));

  const alternar = (id: string) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const alternarTodas = () => setSel((s) => { const n = new Set(s); vista.forEach((f) => (todas ? n.delete(String(f.id)) : n.add(String(f.id)))); return n; });

  const firmarMias = async () => {
    if (!(await confirmar({ titulo: `¿Firmar ${mias.length} constancia${mias.length === 1 ? "" : "s"} tuya${mias.length === 1 ? "" : "s"}?`, texto: "Quedan bloqueadas como al firmar desde la consulta. Las que están en curso no se tocan: se cierran desde su consulta.", accion: "Firmar" }))) return;
    iniciar(async () => {
      const r = await firmarMiasDelLote(mias.map((f) => String(f.id)));
      setAviso(r);
      router.refresh();
    });
  };

  const ids = listas.slice(0, MAX_LOTE).map((f) => String(f.id));
  const pdf = `/imprimir/lote?doc=constancia&ids=${ids.join(",")}`;

  return (
    <div className="space-y-3">
      {sinFirmar.length > 0 && !ignorar && (
        <div className="flex flex-wrap items-start gap-2.5 rounded-xl bg-aviso/15 px-3 py-2.5 text-sm">
          <PenLine className="mt-0.5 size-4 text-aviso-texto" />
          <p className="min-w-0 flex-[1_1_15rem]">{sinFirmar.length} constancia{sinFirmar.length === 1 ? "" : "s"} del período {sinFirmar.length === 1 ? "está" : "están"} sin firmar. No entran en el PDF hasta que se firmen.</p>
          {puedeFirmar && mias.length > 0 && (
            <Button size="sm" variant="outline" className="h-7" onClick={firmarMias} disabled={ocupado}>
              {ocupado && <Loader2 className="animate-spin" />} Firmar las mías ({mias.length})
            </Button>
          )}
          <Button size="sm" variant="ghost" className="h-7" onClick={() => setIgnorar(true)}>Ignorar</Button>
        </div>
      )}
      {aviso && <p className={cn("text-sm", aviso.ok ? "text-ok-texto" : "text-destructive")}>{aviso.mensaje}</p>}

      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-lg bg-muted p-0.5 text-sm" role="group" aria-label="Firma">
          {([["", "Todas"], ["firmada", "Firmadas"], ["pendiente", "Sin firmar"]] as const).map(([v, t]) => (
            <button key={v} type="button" aria-pressed={filtro === v} onClick={() => setFiltro(v)} className={cn("rounded-md px-3 py-1", filtro === v ? "bg-card font-medium shadow-sm" : "text-muted-foreground")}>{t}</button>
          ))}
        </div>
        <span className="text-xs text-muted-foreground">Marcadas de entrada: las firmadas. Una constancia por hoja, solo el original para la empresa, sin diagnósticos.</span>
      </div>

      {/* Celular: tarjetas con lo esencial; desde tableta, la tabla completa */}
      <ul className="divide-y rounded-xl border bg-card md:hidden">
        {vista.slice(0, visibles).map((f) => {
          const id = String(f.id);
          const e = estados[id];
          return (
            <li key={id}>
              <label className={cn("flex items-start gap-3 px-3 py-2.5", sel.has(id) && "bg-accent/60")}>
                <input type="checkbox" checked={sel.has(id)} onChange={() => alternar(id)} aria-label={`Marcar a ${f.paciente}`} className="mt-1 size-4 accent-primary" />
                <span className="min-w-0 flex-1">
                  <b className="block font-medium">{f.paciente}</b>
                  <span className="block text-xs text-muted-foreground">{[f.cedula, f.motivo, fecha(f.fecha)].filter(Boolean).join(" · ")}</span>
                  <span className="mt-1 flex flex-wrap gap-1.5">
                    <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", e?.aptitud ? ESTILO_APTITUD[e.aptitud] : "bg-muted")}>{f.aptitud ?? "—"}</span>
                    {e?.estado === "firmada"
                      ? <span className="rounded-full bg-ok/15 px-2 py-0.5 text-xs font-semibold text-ok-texto">{e.same ? "Firmada en el SAME" : "Firmada"}</span>
                      : <span className="rounded-full bg-aviso/20 px-2 py-0.5 text-xs font-semibold text-aviso-texto">{e?.estado === "borrador" ? "En curso" : "Sin firmar"}</span>}
                  </span>
                </span>
              </label>
            </li>
          );
        })}
        {!vista.length && <li className="py-10 text-center text-sm text-muted-foreground">Sin constancias con este filtro.</li>}
      </ul>
      <div className="hidden overflow-x-auto rounded-xl border bg-card md:block">
        <table className="w-full min-w-[52rem] text-sm">
          <thead className="bg-muted/60 text-left text-xs text-muted-foreground">
            <tr>
              <th className="w-10 px-3 py-2"><input type="checkbox" checked={todas} onChange={alternarTodas} aria-label="Marcar todas" className="size-4 accent-primary" /></th>
              <th className="px-3 py-2 font-medium">Trabajador</th>
              <th className="px-3 py-2 font-medium">Cargo</th>
              <th className="px-3 py-2 font-medium">Motivo</th>
              <th className="px-3 py-2 font-medium">Fecha</th>
              <th className="px-3 py-2 font-medium">Resultado</th>
              <th className="px-3 py-2 font-medium">Vigente hasta</th>
              <th className="px-3 py-2 font-medium">Firma</th>
            </tr>
          </thead>
          <tbody>
            {vista.slice(0, visibles).map((f) => {
              const id = String(f.id);
              const e = estados[id];
              return (
                <tr key={id} className={cn("border-t hover:bg-muted/30", sel.has(id) && "bg-accent/60")}>
                  <td className="px-3 py-2"><input type="checkbox" checked={sel.has(id)} onChange={() => alternar(id)} aria-label={`Marcar a ${f.paciente}`} className="size-4 accent-primary" /></td>
                  <td className="px-3 py-2"><b className="block font-medium">{f.paciente}</b><span className="text-xs text-muted-foreground">{f.cedula}</span></td>
                  <td className="px-3 py-2">{f.cargo ?? "—"}</td>
                  <td className="px-3 py-2">{f.motivo ?? "—"}</td>
                  <td className="px-3 py-2 font-mono whitespace-nowrap tabular-nums">{fecha(f.fecha)}</td>
                  <td className="px-3 py-2"><span className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap", e?.aptitud ? ESTILO_APTITUD[e.aptitud] : "bg-muted")}>{f.aptitud ?? "—"}</span></td>
                  <td className="px-3 py-2 font-mono whitespace-nowrap tabular-nums">{fecha(f.vigente_hasta)}</td>
                  <td className="px-3 py-2">
                    {e?.estado === "firmada"
                      ? <span className="rounded-full bg-ok/15 px-2 py-0.5 text-xs font-semibold text-ok-texto">{e.same ? "Firmada en el SAME" : "Firmada"}{e.revision > 1 ? ` · rev. ${e.revision}` : ""}</span>
                      : <span className="rounded-full bg-aviso/20 px-2 py-0.5 text-xs font-semibold whitespace-nowrap text-aviso-texto">{e?.estado === "borrador" ? "En curso" : "Sin firmar"}</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!vista.length && <p className="py-10 text-center text-sm text-muted-foreground">Sin constancias con este filtro.</p>}
      </div>
      {visibles < vista.length && (
        <Button type="button" size="sm" variant="outline" onClick={() => setVisibles((v) => v + POR_PAGINA * 5)}>Ver más ({vista.length - visibles})</Button>
      )}

      {/* Barra de acciones del lote */}
      <div className="sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-10 flex flex-wrap items-center gap-2.5 rounded-2xl bg-foreground px-4 py-2.5 text-background shadow-lg lg:bottom-3">
        <span className="min-w-0 flex-[1_1_12rem] font-semibold">
          {marcadas.length ? `${marcadas.length} marcada${marcadas.length === 1 ? "" : "s"}` : "Marca trabajadores para armar el lote"}
          {marcadas.length > listas.length && <span className="font-normal opacity-80"> · {marcadas.length - listas.length} sin firmar no entran</span>}
          {listas.length > MAX_LOTE && <span className="font-normal opacity-80"> · máximo {MAX_LOTE} por PDF</span>}
        </span>
        <span className="hidden text-xs opacity-70 md:inline">{empresa.nombre}</span>
        {listas.length ? (
          <Button asChild className="bg-primary text-primary-foreground hover:bg-primary/90">
            <a href={pdf} target="_blank" rel="noreferrer"><FileText /> Constancias en un PDF ({Math.min(listas.length, MAX_LOTE)})</a>
          </Button>
        ) : (
          <Button disabled className="bg-primary text-primary-foreground"><FileText /> Constancias en un PDF</Button>
        )}
        {envio && (
          <Button variant="outline" className="border-background/30 bg-transparent text-background hover:bg-background/10 hover:text-background" disabled={!listas.length} onClick={() => setEnviando((v) => !v)}>
            {enviando ? <X /> : <Send />} {enviando ? "Cerrar envío" : "Enviar a la empresa"}
          </Button>
        )}
      </div>
      {envio && enviando && listas.length > 0 && (
        <PanelEnvio key={ids.join(",")} empresa={empresa} fecha={envio.fecha} consultaIds={ids} contactos={envio.contactos} plantillas={envio.plantillas} correo={envio.correo} puedeAutorizar={envio.puedeAutorizar} historial={`/envios?empresa=${empresa.id}`} />
      )}
    </div>
  );
}
