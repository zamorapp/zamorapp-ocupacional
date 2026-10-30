"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { FileImage, FileText, Loader2, Paperclip, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { abrirEnVentana } from "@/lib/escritorio";
import { crearClienteNavegador } from "@/lib/supabase/client";
import { TIPOS_ADJUNTO, type Adjunto } from "@/lib/adjuntos-tipos";
import { subirAdjunto } from "@/lib/preparar-archivo";
import { confirmar } from "@/components/app/confirmar";
import { CLASES, clasificarAdjunto, familiaDe, NOMBRE_FAMILIA, type Familia } from "@/lib/estudios";
import type { Item } from "@/lib/listas";
import { cn } from "@/lib/utils";

// Con catálogo (expediente): historial de estudios por familia y elección del estudio al digitalizar
type Props = { orgId: string; trabajadorId: string; consultaId?: string; iniciales: Adjunto[]; catalogo?: Item[]; consultas?: { id: string; fecha: string }[] };
const FAMILIAS: Familia[] = ["imagen", "funcional", "laboratorio"];

const tamano = (b: number) => (b > 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.ceil(b / 1024)} KB`);
const fecha = (iso: string) => iso.slice(0, 10).split("-").reverse().join("/");

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

  const borrar = async (a: Adjunto) => {
    if (!(await confirmar({ titulo: `¿Borrar «${a.nombre}»?`, texto: "El archivo se elimina y no se puede recuperar.", accion: "Borrar", peligro: true }))) return;
    const supabase = crearClienteNavegador();
    const { error: e } = await supabase.from("adjuntos").delete().eq("id", a.id);
    if (e) { setError(e.message); return; }
    await supabase.storage.from("adjuntos").remove([a.ruta]);
    setLista((l) => l.filter((x) => x.id !== a.id));
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
      {error && <p className="text-sm text-destructive">{error}</p>}
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
    </div>
  );
}
