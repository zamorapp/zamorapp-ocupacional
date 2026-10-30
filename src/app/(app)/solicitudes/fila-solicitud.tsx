"use client";

import { startTransition, useActionState, useState } from "react";
import { ChevronDown, Download, Paperclip } from "lucide-react";
import { Aviso, CampoSelect, CampoTexto } from "@/components/app/campo";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Pasos, pasosSolicitud } from "@/components/app/pasos";
import { ETIQUETA_SOLICITUD, type Solicitud } from "@/lib/solicitudes-tipos";
import { crearClienteNavegador } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { atenderSolicitud } from "./acciones";
import { ahora } from "@/lib/fecha";

const fechaHora = (iso: string) =>
  new Intl.DateTimeFormat("es-VE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "America/Caracas" }).format(new Date(iso));

const DOCUMENTOS = [
  ["informe", "Informe médico"],
  ["informe-trabajador", "Informe para el trabajador"],
  ["atencion", "Constancia de atención (sin diagnóstico)"],
  ["constancia", "Constancia de aptitud"],
  ["referencia", "Referencia médica"],
  ["reposo", "Reposo médico"],
] as const;

export function FilaSolicitud({ s, orgId, consultas, clinico }: { s: Solicitud; orgId: string; consultas: { id: string; fecha: string; motivo: string | null }[]; clinico: boolean }) {
  const abierta = s.estado === "pendiente" || s.estado === "en_proceso";
  const [abrir, setAbrir] = useState(false);
  const [origen, setOrigen] = useState<"archivo" | "consulta">(consultas.length && clinico ? "consulta" : "archivo");
  const [estado, accion, guardando] = useActionState(atenderSolicitud, null);
  const [subiendo, setSubiendo] = useState<string | null>(null);
  // Un archivo propio queda solo para el personal de salud salvo que se desmarque (puede llevar diagnósticos)
  const [soloSalud, setSoloSalud] = useState(s.soloSalud);
  const e = ETIQUETA_SOLICITUD[s.estado];

  // El archivo va directo del navegador a Storage (sin pasar por el servidor, que tiene límite de tamaño)
  const guardar = async (ev: React.FormEvent<HTMLFormElement>) => {
    ev.preventDefault();
    const datos = new FormData(ev.currentTarget);
    const archivo = datos.get("archivo");
    datos.delete("archivo");
    if (archivo instanceof File && archivo.size > 0) {
      if (!["application/pdf", "image/jpeg", "image/png"].includes(archivo.type)) return setSubiendo("Solo PDF, JPG o PNG.");
      if (archivo.size > 10 * 1024 * 1024) return setSubiendo("El archivo pasa de 10 MB.");
      setSubiendo("Subiendo…");
      const limpio = archivo.name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\w.-]+/g, "_").slice(-80);
      const ruta = `${orgId}/${s.empresaId}/${s.id}/${ahora()}-${limpio}`;
      const { error } = await crearClienteNavegador().storage.from("solicitudes").upload(ruta, archivo, { contentType: archivo.type });
      if (error) return setSubiendo(`No se pudo subir: ${error.message}`);
      datos.set("subido_ruta", ruta);
      datos.set("subido_nombre", archivo.name);
    }
    setSubiendo(null);
    startTransition(() => accion(datos));
  };

  return (
    <li className="rounded-xl border bg-card">
      <button type="button" onClick={() => setAbrir(!abrir)} aria-expanded={abrir} className="flex w-full flex-wrap items-start gap-3 px-4 py-3 text-left">
        <span className="min-w-0 flex-1">
          <span className="block font-medium">{s.tipo}{s.trabajador && <span className="font-normal text-muted-foreground"> · {s.trabajador}</span>}</span>
          <span className="block text-xs text-muted-foreground">{s.empresa} · {fechaHora(s.creadoEn)}</span>
          <span className="mt-1 line-clamp-2 block text-sm">{s.detalle}</span>
          {s.estado !== "pendiente" && <Pasos pasos={pasosSolicitud(s)} className="mt-1" />}
        </span>
        <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium", e.clase)}>{e.texto}</span>
        <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition-transform", abrir && "rotate-180")} />
      </button>
      {abrir && (
        <div className="space-y-4 border-t px-4 py-4">
          <p className="whitespace-pre-line text-sm">{s.detalle}</p>
          {s.documento && (
            <Button variant="outline" size="sm" asChild><a href={`/api/solicitudes/${s.id}`} target="_blank" rel="noreferrer"><Download /> {s.documento}</a></Button>
          )}
          <form onSubmit={guardar} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <input type="hidden" name="id" value={s.id} />
            <CampoSelect id={`estado-${s.id}`} name="estado" etiqueta="Estado" defaultValue={abierta ? "respondida" : s.estado}>
              <option value="pendiente">Pendiente</option>
              <option value="en_proceso">En proceso</option>
              <option value="respondida">Respondida</option>
              <option value="rechazada">Rechazada</option>
            </CampoSelect>
            <div>
              <Label className="mb-1.5">Documento de respuesta {s.documento && <span className="font-normal text-muted-foreground">(reemplaza el actual)</span>}</Label>
              {clinico && consultas.length > 0 && (
                <div className="mb-2 flex gap-1 text-xs">
                  {(["consulta", "archivo"] as const).map((o) => (
                    <button key={o} type="button" onClick={() => setOrigen(o)} className={cn("rounded-full border px-2.5 py-1", origen === o ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground")}>
                      {o === "consulta" ? "De una consulta" : "Subir archivo"}
                    </button>
                  ))}
                </div>
              )}
              {origen === "consulta" && clinico && consultas.length > 0 ? (
                <div className="grid grid-cols-1 gap-2">
                  <select name="consulta_id" aria-label="Consulta" className="h-10 w-full rounded-md border bg-transparent px-3 text-sm" defaultValue={consultas[0].id}>
                    {consultas.map((c) => <option key={c.id} value={c.id}>{c.fecha.split("-").reverse().join("/")} · {c.motivo ?? "Consulta"}</option>)}
                  </select>
                  <select name="documento" aria-label="Documento" className="h-10 w-full rounded-md border bg-transparent px-3 text-sm" defaultValue="informe">
                    {DOCUMENTOS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
                  </select>
                </div>
              ) : (
                <label className="flex h-10 cursor-pointer items-center gap-2 rounded-md border px-3 text-sm text-muted-foreground">
                  <Paperclip className="size-4" />
                  <input type="file" name="archivo" accept="application/pdf,image/jpeg,image/png" onChange={(e) => { if (e.target.files?.length) setSoloSalud(true); }} className="min-w-0 flex-1 text-sm file:hidden" />
                </label>
              )}
            </div>
            <CampoTexto id={`respuesta-${s.id}`} name="respuesta" etiqueta="Respuesta para la empresa" rows={3} defaultValue={s.respuesta ?? ""} className="sm:col-span-2" placeholder="Opcional. La ve la empresa en su portal." />
            {origen === "consulta" && clinico && consultas.length > 0 ? (
              <p className="text-xs text-muted-foreground sm:col-span-2">Las constancias de aptitud y de atención las ve RR. HH. Los demás documentos llevan diagnósticos: RR. HH. solo verá «Respondida» y la respuesta queda para el personal de salud.</p>
            ) : (
              <label className="flex items-start gap-2 text-sm sm:col-span-2">
                <input type="checkbox" name="solo_salud" value="1" checked={soloSalud} onChange={(e) => setSoloSalud(e.target.checked)} className="mt-0.5 size-4 accent-primary" />
                <span>Solo para el personal de salud <span className="block text-xs text-muted-foreground">Márcalo si la respuesta o el archivo lleva diagnósticos. RR. HH. solo verá «Respondida».</span></span>
              </label>
            )}
            <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
              <Button type="submit" disabled={guardando || subiendo === "Subiendo…"}>{guardando ? "Guardando…" : "Guardar y avisar"}</Button>
              {subiendo ? <span className="text-sm text-muted-foreground">{subiendo}</span> : <Aviso resultado={estado} />}
            </div>
          </form>
        </div>
      )}
    </li>
  );
}
