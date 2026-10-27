"use client";

import { useRef, useState } from "react";
import { FileImage, FileText, Loader2, Paperclip, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { abrirEnVentana } from "@/lib/escritorio";
import { crearClienteNavegador } from "@/lib/supabase/client";
import { TIPOS_ADJUNTO, type Adjunto } from "@/lib/adjuntos-tipos";
import { subirAdjunto } from "@/lib/preparar-archivo";
import { confirmar } from "@/components/app/confirmar";

type Props = { orgId: string; trabajadorId: string; consultaId?: string; iniciales: Adjunto[] };

const tamano = (b: number) => (b > 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.ceil(b / 1024)} KB`);
const fecha = (iso: string) => iso.slice(0, 10).split("-").reverse().join("/");

/** Resultados de laboratorio, Rx o informes externos (PDF o fotos) guardados en la historia del trabajador. */
export function Adjuntos({ orgId, trabajadorId, consultaId, iniciales }: Props) {
  const [lista, setLista] = useState(iniciales);
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
        const fila = await subirAdjunto(supabase, { orgId, trabajadorId, consultaId }, archivo);
        setLista((l) => [fila, ...l]);
      } catch (e) {
        setError((e as Error).message);
      }
    }
    if (entrada.current) entrada.current.value = "";
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
        <Button type="button" variant="outline" size="sm" disabled={ocupado} onClick={() => entrada.current?.click()}>
          {ocupado ? <Loader2 className="animate-spin" /> : <Paperclip />} Adjuntar resultados
        </Button>
        <span className="text-xs text-muted-foreground">PDF o fotos, hasta 10 MB cada uno. Desde el celular puedes tomar la foto directamente.</span>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      {lista.length === 0 ? (
        <p className="text-sm text-muted-foreground">Sin resultados adjuntos.</p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {lista.map((a) => {
            const Icono = a.tipo_mime === "application/pdf" ? FileText : FileImage;
            return (
              <li key={a.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                <Icono className="size-4 shrink-0 text-primary" />
                <button type="button" className="min-w-0 flex-1 truncate text-left font-medium hover:text-primary hover:underline" onClick={() => abrir(a)}>{a.nombre}</button>
                <span className="shrink-0 text-xs text-muted-foreground">{fecha(a.creado_en)} · {tamano(a.tamano)}{a.consulta_id === consultaId && consultaId ? " · esta consulta" : ""}</span>
                <button type="button" aria-label="Borrar" className="text-muted-foreground hover:text-destructive" onClick={() => borrar(a)}><Trash2 className="size-4" /></button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
