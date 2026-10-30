"use client";

import { AlertTriangle, CheckCircle2, CloudDownload, Laptop, Loader2, RefreshCw, Upload } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { confirmar } from "@/components/app/confirmar";
import { Button } from "@/components/ui/button";
import { ESCRITORIO } from "@/lib/escritorio-actualizar";
import {
  type CasoBandeja, comparar, internosDistintos, EVENTO_BANDEJA, explicarMotivo, leerBandeja, type ListaBandeja, nombreOperacion, nombreTabla, resolverCaso, textoValor,
} from "@/lib/escritorio-bandeja";
import { cn } from "@/lib/utils";

export function ListaConflictos() {
  const [lista, setLista] = useState<ListaBandeja | null | undefined>(undefined);
  const cargar = useCallback(async () => setLista(await leerBandeja()), []);

  useEffect(() => {
    if (!ESCRITORIO) return;
    cargar();
    const t = setInterval(cargar, 30e3);
    return () => clearInterval(t);
  }, [cargar]);

  if (!ESCRITORIO) return <Vacio texto="Esta pantalla es del programa de escritorio: en la web todo se guarda directo en la nube y no hay conflictos que revisar." />;
  if (lista === undefined) return <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" aria-hidden /> Cargando…</p>;
  if (lista === null) return <Vacio texto="No se pudo leer la lista de esta PC. Cierra y abre zamorApp; si sigue igual, entra de nuevo." />;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
        <span>{lista.pendientes > 0 ? `${lista.pendientes} cambio${lista.pendientes === 1 ? "" : "s"} más esperan subir a la nube (eso es normal sin internet).` : "No hay cambios esperando subir."}</span>
        <Button size="sm" variant="outline" onClick={cargar}><RefreshCw aria-hidden /> Actualizar</Button>
      </div>
      {lista.revisar.length === 0 ? (
        <Vacio ok texto="Todo en orden: no hay conflictos ni rechazos por revisar." />
      ) : (
        <ul className="space-y-4">{lista.revisar.map((c) => <Caso key={c.id} c={c} alResolver={cargar} />)}</ul>
      )}
    </div>
  );
}

function Vacio({ texto, ok = false }: { texto: string; ok?: boolean }) {
  return (
    <p className={cn("flex items-center justify-center gap-2 rounded-xl border bg-card p-10 text-center text-sm", ok ? "text-ok-texto" : "text-muted-foreground")}>
      {ok && <CheckCircle2 className="size-4 shrink-0 text-ok-texto" aria-hidden />} {texto}
    </p>
  );
}

function Caso({ c, alResolver }: { c: CasoBandeja; alResolver: () => void }) {
  const [ocupado, setOcupado] = useState<"" | "descartar" | "reintentar">("");
  const [aviso, setAviso] = useState<{ ok: boolean; mensaje: string } | null>(null);
  const motivo = explicarMotivo(c.motivo, c.estado);
  const filas = comparar(c.datos, c.nube);
  const borrado = c.op === "D";
  // Si la nube tiene el registro, los campos iguales se pliegan: el médico ve primero solo lo que cambió
  const distintos = c.nube ? filas.filter((f) => f.distinto) : filas;
  const iguales = c.nube ? filas.filter((f) => !f.distinto) : [];
  const internos = internosDistintos(c.datos, c.nube);
  const etiquetaDescartar = c.nube ? "Quedarme con la nube" : "Descartar lo de esta PC";

  const resolver = async (accion: "descartar" | "reintentar") => {
    const si = await confirmar(accion === "descartar"
      ? { titulo: c.nube ? "¿Quedarte con la versión de la nube?" : "¿Descartar lo de esta PC?", texto: "Lo escrito en esta PC para este registro se descarta. No se puede deshacer.", accion: etiquetaDescartar, peligro: true }
      : { titulo: "¿Volver a subir la versión de esta PC?", texto: "Se sube sobre lo que hay ahora en la nube y reemplaza esos campos.", accion: "Volver a subir" });
    if (!si) return;
    setOcupado(accion);
    const r = await resolverCaso(c.id, accion);
    setOcupado("");
    setAviso(r);
    if (r.ok) {
      window.dispatchEvent(new Event(EVENTO_BANDEJA));
      setTimeout(alResolver, 1200);
    }
  };

  return (
    <li className="overflow-hidden rounded-xl border bg-card" data-caso={c.estado}>
      <div className="flex flex-wrap items-start justify-between gap-3 border-b p-4">
        <div className="min-w-0 space-y-1">
          <p className="flex flex-wrap items-center gap-2">
            <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", c.estado === "conflicto" ? "bg-aviso/15 text-aviso-texto" : "bg-alerta/10 text-alerta-texto")}>
              {c.estado === "conflicto" ? "Conflicto" : "Rechazado"}
            </span>
            <span className="font-medium">{nombreTabla(c.tabla)}</span>
          </p>
          <p className="text-xs text-muted-foreground">
            {c.autorNombre ?? "Alguien"} lo {nombreOperacion(c.op)} en esta PC el {textoValor(c.creado)}
          </p>
        </div>
      </div>
      <div className="space-y-3 p-4">
        <div className={cn("flex gap-2 rounded-lg border p-3 text-sm", c.estado === "conflicto" ? "border-aviso/40 bg-aviso/10" : "border-alerta/40 bg-alerta/10")}>
          <AlertTriangle className={cn("mt-0.5 size-4 shrink-0", c.estado === "conflicto" ? "text-aviso-texto" : "text-alerta-texto")} aria-hidden />
          <div className="min-w-0">
            <p className="font-medium">{motivo.titulo}</p>
            <p className="text-muted-foreground">{motivo.texto}</p>
            {c.motivo && (
              <details className="mt-1 text-xs text-muted-foreground">
                <summary className="cursor-pointer">Detalle técnico</summary>
                <p className="mt-1 break-words">{c.motivo}</p>
              </details>
            )}
          </div>
        </div>
        {borrado ? (
          <p className="text-sm text-muted-foreground">En esta PC se borró este registro. En la nube sigue existiendo.</p>
        ) : filas.length > 0 && (
          <>
          {/* Celular: un bloque por campo */}
          <dl className="space-y-2 sm:hidden">
            {distintos.map((f) => (
              <div key={f.campo} className={cn("rounded-lg border p-3 text-sm", f.distinto && "border-aviso/50 bg-aviso/10")}>
                <dt className="font-medium">{f.etiqueta}{f.distinto && <span className="sr-only"> (distinto)</span>}</dt>
                <dd className="mt-1.5 grid gap-1.5">
                  <span><span className="flex items-center gap-1 text-xs text-muted-foreground"><Laptop className="size-3.5" aria-hidden /> En esta PC</span><span className={cn("block whitespace-pre-wrap break-words", f.distinto && "font-medium")}>{f.pc}</span></span>
                  <span><span className="flex items-center gap-1 text-xs text-muted-foreground"><CloudDownload className="size-3.5" aria-hidden /> En la nube ahora</span><span className="block whitespace-pre-wrap break-words">{c.nube ? f.nube : <span className="text-muted-foreground">No está en la nube</span>}</span></span>
                </dd>
              </div>
            ))}
          </dl>
          <div className={cn("hidden overflow-x-auto rounded-lg border", distintos.length > 0 && "sm:block")}>
            <table className="w-full text-sm">
              <thead className="bg-muted/60 text-left text-xs text-muted-foreground">
                <tr>
                  <th scope="col" className="w-1/4 p-2 font-medium">Campo</th>
                  <th scope="col" className="p-2 font-medium"><span className="inline-flex items-center gap-1"><Laptop className="size-3.5" aria-hidden /> En esta PC</span></th>
                  <th scope="col" className="p-2 font-medium"><span className="inline-flex items-center gap-1"><CloudDownload className="size-3.5" aria-hidden /> En la nube ahora</span></th>
                </tr>
              </thead>
              <tbody>
                {distintos.map((f) => (
                  <tr key={f.campo} className={cn("border-t align-top", f.distinto && "bg-aviso/10")}>
                    <th scope="row" className="p-2 text-left font-medium">
                      {f.etiqueta}
                      {f.distinto && c.nube && <span className="ml-2 rounded-full bg-aviso/20 px-1.5 py-0.5 text-[11px] font-medium text-aviso-texto">Distinto</span>}
                    </th>
                    <td className={cn("whitespace-pre-wrap break-words p-2", f.distinto && "font-medium")}>{f.pc}</td>
                    <td className="whitespace-pre-wrap break-words p-2">{c.nube ? f.nube : <span className="text-muted-foreground">No está en la nube</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {distintos.length === 0 && internos.length === 0 && <p className="text-sm text-muted-foreground">Lo que se ve es igual en las dos versiones.</p>}
          {internos.length > 0 && (
            <details className="text-sm" open={distintos.length === 0}>
              <summary className="cursor-pointer text-muted-foreground hover:text-foreground">Datos internos que también cambian ({internos.length})</summary>
              <dl className="mt-2 grid grid-cols-1 gap-x-6 gap-y-1.5 rounded-lg border border-aviso/40 p-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)_minmax(0,1.5fr)]">
                {internos.map((f) => (
                  <div key={f.campo} className="contents">
                    <dt className="font-medium text-muted-foreground">{f.etiqueta}</dt>
                    <dd className="break-words"><span className="text-xs text-muted-foreground sm:sr-only">En esta PC: </span>{f.pc}</dd>
                    <dd className="break-words"><span className="text-xs text-muted-foreground sm:sr-only">En la nube: </span>{f.nube}</dd>
                  </div>
                ))}
              </dl>
            </details>
          )}
          {iguales.length > 0 && (
            <details className="text-sm">
              <summary className="cursor-pointer text-muted-foreground hover:text-foreground">Ver {iguales.length === 1 ? "1 campo igual" : `${iguales.length} campos iguales`}</summary>
              <dl className="mt-2 grid grid-cols-1 gap-x-6 gap-y-1.5 rounded-lg border p-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,3fr)]">
                {iguales.map((f) => (
                  <div key={f.campo} className="contents">
                    <dt className="font-medium text-muted-foreground">{f.etiqueta}</dt>
                    <dd className="whitespace-pre-wrap break-words">{f.pc}</dd>
                  </div>
                ))}
              </dl>
            </details>
          )}
          </>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" disabled={Boolean(ocupado)} onClick={() => resolver("descartar")}>
            {ocupado === "descartar" ? <Loader2 className="animate-spin" aria-hidden /> : <CloudDownload aria-hidden />} {etiquetaDescartar}
          </Button>
          <Button size="sm" disabled={Boolean(ocupado)} onClick={() => resolver("reintentar")}>
            {ocupado === "reintentar" ? <Loader2 className="animate-spin" aria-hidden /> : <Upload aria-hidden />} Volver a subir la de esta PC
          </Button>
          {aviso && <span role="status" className={cn("text-sm", aviso.ok ? "text-ok-texto" : "text-alerta-texto")}>{aviso.mensaje}</span>}
        </div>
      </div>
    </li>
  );
}
