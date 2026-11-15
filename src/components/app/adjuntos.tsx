"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ChevronDown, FileImage, FileText, Loader2, Paperclip, RotateCcw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { abrirEnVentana } from "@/lib/escritorio";
import { crearClienteNavegador } from "@/lib/supabase/client";
import { TIPOS_ADJUNTO, type Adjunto } from "@/lib/adjuntos-tipos";
import { subirAdjunto } from "@/lib/preparar-archivo";
import { confirmar } from "@/components/app/confirmar";
import { FranjaDeshacerLocal } from "@/components/app/franja-deshacer-local";
import { borrarAdjunto, papeleraDe, purgarVencidos, restaurarAdjunto, TEXTO_BORRAR, type EnPapelera } from "@/lib/papelera-adjuntos";
import { CLASES, clasificarAdjunto, familiaDe, NOMBRE_FAMILIA, type Familia } from "@/lib/estudios";
import type { Item } from "@/lib/listas";
import { hoyCaracas } from "@/lib/fecha";
import { cn } from "@/lib/utils";

// Con catálogo (expediente): historial de estudios por familia y elección del estudio al digitalizar
type Props = { orgId: string; trabajadorId: string; consultaId?: string; iniciales: Adjunto[]; catalogo?: Item[]; consultas?: { id: string; fecha: string }[] };
const FAMILIAS: Familia[] = ["imagen", "funcional", "laboratorio"];

const tamano = (b: number) => (b > 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.ceil(b / 1024)} KB`);
const fecha = (iso: string) => iso.slice(0, 10).split("-").reverse().join("/");
// Días que faltan para una fecha AAAA-MM-DD (fecha de Caracas que da la base), contra el día de hoy en Caracas
const diasPara = (iso: string) => (Date.parse(iso.slice(0, 10)) - Date.parse(hoyCaracas())) / 86_400_000;

/** Resultados de laboratorio, Rx o informes externos (PDF o fotos) guardados en la historia del trabajador. */
export function Adjuntos({ orgId, trabajadorId, consultaId, iniciales, catalogo, consultas }: Props) {
  const [lista, setLista] = useState(iniciales);
  const [estudio, setEstudio] = useState("");
  const [filtro, setFiltro] = useState<Familia | "sin" | "">("");
  const clasificados = useMemo(() => new Map(lista.map((a) => [a.id, clasificarAdjunto(a, catalogo ?? [])])), [lista, catalogo]);
  const fechaConsulta = useMemo(() => new Map((consultas ?? []).map((c) => [c.id, c.fecha])), [consultas]);
  const cuenta = (f: Familia | "sin") => lista.filter((a) => (clasificados.get(a.id)?.familia ?? "sin") === f).length;
  // Si el filtro se queda sin archivos (se borró el último de esa clase), vuelve a «Todos»
  const filtroVivo = filtro && cuenta(filtro) > 0 ? filtro : "";
  const visibles = filtroVivo ? lista.filter((a) => (clasificados.get(a.id)?.familia ?? "sin") === filtroVivo) : lista;
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const entrada = useRef<HTMLInputElement>(null);

  const subir = async (archivos: FileList | null) => {
    if (!archivos?.length) return;
    setOcupado(true);
    setError(null);
    const supabase = crearClienteNavegador();
    for (const archivo of Array.from(archivos)) {
      try {
        const fila = await subirAdjunto(supabase, { orgId, trabajadorId, consultaId, examenes: estudio ? [estudio] : [] }, archivo);
        setLista((l) => [fila, ...l]);
      } catch (e) {
        setError((e as Error).message);
      }
    }
    if (entrada.current) entrada.current.value = "";
    setEstudio("");
    setOcupado(false);
  };

  const abrir = (a: Adjunto) =>
    abrirEnVentana(async () => {
      const { data, error: e } = await crearClienteNavegador().storage.from("adjuntos").createSignedUrl(a.ruta, 300);
      if (e || !data) { setError("No se pudo abrir el archivo."); return null; }
      return data.signedUrl;
    });

  // Papelera de 30 días: borrar no pierde el archivo; «Deshacer» al momento y «Restaurar» desde la ficha
  const [borrado, setBorrado] = useState<{ adjunto: Adjunto; papeleraId: string } | null>(null);
  const [papelera, setPapelera] = useState<EnPapelera[]>([]);
  const [verPapelera, setVerPapelera] = useState(false);
  const leerPapelera = useCallback(async () => {
    if (!catalogo) return; // solo en la ficha del paciente
    try { setPapelera(await papeleraDe(crearClienteNavegador(), trabajadorId)); } catch (e) { setError((e as Error).message); }
  }, [catalogo, trabajadorId]);
  useEffect(() => {
    void leerPapelera();
    if (catalogo) void purgarVencidos(crearClienteNavegador());
  }, [leerPapelera, catalogo]);

  const borrar = async (a: Adjunto) => {
    if (!(await confirmar({ titulo: `¿Borrar «${a.nombre}»?`, texto: TEXTO_BORRAR, accion: "Borrar", peligro: true }))) return;
    setError(null);
    try {
      const papeleraId = await borrarAdjunto(crearClienteNavegador(), a);
      setLista((l) => l.filter((x) => x.id !== a.id));
      setBorrado({ adjunto: a, papeleraId });
      void leerPapelera();
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const restaurar = async (papeleraId: string, adjuntoId?: string) => {
    setOcupado(true);
    setError(null);
    try {
      const fila = await restaurarAdjunto(crearClienteNavegador(), papeleraId, adjuntoId);
      if (fila) setLista((l) => [fila, ...l.filter((x) => x.id !== fila.id)].sort((x, y) => y.creado_en.localeCompare(x.creado_en)));
      setBorrado(null);
      await leerPapelera();
    } catch (e) {
      setError((e as Error).message);
    }
    setOcupado(false);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <input ref={entrada} type="file" multiple accept={TIPOS_ADJUNTO} className="hidden" onChange={(e) => subir(e.target.files)} />
        {catalogo && (
          <select aria-label="Estudio que se digitaliza" value={estudio} onChange={(e) => setEstudio(e.target.value)} className="h-9 w-full rounded-md border bg-transparent px-2 text-sm sm:w-auto sm:max-w-64">
            <option value="">Estudio: sin especificar</option>
            {FAMILIAS.map((f) => (
              <optgroup key={f} label={NOMBRE_FAMILIA[f]}>
                {catalogo.filter((c) => familiaDe(c) === f).map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </optgroup>
            ))}
          </select>
        )}
        <Button type="button" variant="outline" size="sm" disabled={ocupado} onClick={() => entrada.current?.click()}>
          {ocupado ? <Loader2 className="animate-spin" /> : <Paperclip />} {catalogo ? "Digitalizar estudio" : "Adjuntar resultados"}
        </Button>
        <span className="text-xs text-muted-foreground">PDF o fotos, hasta 10 MB cada uno. Desde el celular puedes tomar la foto directamente.</span>
      </div>
      {catalogo && lista.length > 0 && (
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filtrar por tipo de estudio">
          {([["", "Todos", lista.length], ...FAMILIAS.map((f) => [f, NOMBRE_FAMILIA[f], cuenta(f)]), ["sin", "Sin clasificar", cuenta("sin")]] as [Familia | "sin" | "", string, number][])
            .filter(([, , n], i) => i === 0 || n > 0)
            .map(([f, etiqueta, n]) => (
              <button key={f || "todos"} type="button" aria-pressed={filtroVivo === f} onClick={() => setFiltro(f)}
                className={cn("whitespace-nowrap rounded-full border px-3 py-1 text-xs transition hover:border-primary", filtroVivo === f && "border-primary bg-primary/10 font-medium text-primary")}>
                {etiqueta} <span className="text-muted-foreground">({n})</span>
              </button>
            ))}
        </div>
      )}
      {borrado && (
        <FranjaDeshacerLocal texto={`Se borró «${borrado.adjunto.nombre}». Queda 30 días en la papelera de archivos, aquí abajo.`} ocupado={ocupado}
          onDeshacer={() => restaurar(borrado.papeleraId, borrado.adjunto.id)} onCerrar={() => setBorrado(null)} />
      )}
      {error && <p role="alert" className="text-sm text-alerta-texto">{error}</p>}
      {lista.length === 0 ? (
        <p className="text-sm text-muted-foreground">Sin resultados adjuntos.</p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {visibles.map((a) => {
            const Icono = a.tipo_mime === "application/pdf" ? FileText : FileImage;
            const c = catalogo ? clasificados.get(a.id) : undefined;
            const deConsulta = a.consulta_id ? fechaConsulta.get(a.consulta_id) : undefined;
            return (
              <li key={a.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm">
                <Icono className="size-4 shrink-0 text-primary" />
                <div className="min-w-0 flex-1">
                  <button type="button" className="block max-w-full truncate text-left font-medium hover:text-primary hover:underline" onClick={() => abrir(a)}>
                    {c?.estudios.length ? c.estudios.join(", ") : a.nombre}
                  </button>
                  {c && (
                    <span className="block truncate text-xs text-muted-foreground">
                      {c.clase ? CLASES[c.clase] : "Sin clasificar"}{c.estudios.length ? ` · ${a.nombre}` : ""}
                    </span>
                  )}
                </div>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {fecha(a.creado_en)} · {tamano(a.tamano)}
                  {a.consulta_id === consultaId && consultaId ? " · esta consulta" : ""}
                  {catalogo && a.consulta_id && a.consulta_id !== consultaId && (
                    <> · <Link href={`/atencion/${a.consulta_id}`} className="hover:text-primary hover:underline">{deConsulta ? `consulta del ${fecha(deConsulta)}` : "ver consulta"}</Link></>
                  )}
                </span>
                <button type="button" aria-label="Borrar" className="text-muted-foreground hover:text-destructive" onClick={() => borrar(a)}><Trash2 className="size-4" /></button>
              </li>
            );
          })}
        </ul>
      )}
      {catalogo && <PapeleraArchivos papelera={papelera} ocupado={ocupado} abierta={verPapelera} onAlternar={() => setVerPapelera((v) => !v)} onRestaurar={restaurar} />}
    </div>
  );
}

/** Papelera de archivos de la ficha: lo borrado en los últimos 30 días, con «Restaurar». Vacía no se muestra. */
export function PapeleraArchivos({ papelera, ocupado, abierta, onAlternar, onRestaurar }: {
  papelera: EnPapelera[]; ocupado: boolean; abierta: boolean; onAlternar: () => void; onRestaurar: (papeleraId: string, adjuntoId: string) => void;
}) {
  if (!papelera.length) return null;
  return (
    <div className="rounded-lg border border-dashed">
      <button type="button" aria-expanded={abierta} onClick={onAlternar}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-muted-foreground hover:text-foreground">
        <Trash2 className="size-4" />
        <span className="flex-1">Papelera de archivos ({papelera.length}) · se guardan 30 días</span>
        <ChevronDown className={cn("size-4 transition", abierta && "rotate-180")} />
      </button>
      {abierta && (
        <ul className="divide-y border-t">
          {papelera.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm">
              <div className="min-w-0 flex-1">
                <span className="block truncate font-medium">{p.nombre}</span>
                <span className="block text-xs text-muted-foreground">
                  Borrado el {fecha(hoyCaracas(p.eliminado_en))}{p.eliminado_por ? ` por ${p.eliminado_por}` : ""} ·{" "}
                  <span className={cn(diasPara(p.vence) <= 3 && "font-medium text-aviso-texto")}>se elimina para siempre el {fecha(p.vence)}</span>
                </span>
              </div>
              <Button size="sm" variant="outline" disabled={ocupado} onClick={() => onRestaurar(p.id, p.adjunto_id)} aria-label={`Restaurar ${p.nombre}`}><RotateCcw /> Restaurar</Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
