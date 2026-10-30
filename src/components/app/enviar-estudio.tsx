"use client";

import { useRef, useState } from "react";
import { CheckCircle2, Loader2, ScanLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { crearClienteNavegador } from "@/lib/supabase/client";
import { MAX_ADJUNTO, TIPOS_ADJUNTO } from "@/lib/adjuntos-tipos";
import { prepararArchivo } from "@/lib/preparar-archivo";
import { familiaDe, NOMBRE_FAMILIA, type Familia } from "@/lib/estudios";

type Estudio = { id: string; nombre: string; grupo?: string | null; datos?: Record<string, unknown> | null };
const FAMILIAS: Familia[] = ["imagen", "funcional", "laboratorio"];

/**
 * RR. HH. envía al servicio médico un estudio que se hizo el trabajador (Rx, eco, espirometría, audiometría, ECG…).
 * Va directo al expediente y solo lo ve el personal de salud: después de enviarlo, RR. HH. no puede verlo ni bajarlo.
 */
export function EnviarEstudio({ orgId, trabajadorId, nombre, catalogo }: { orgId: string; trabajadorId: string; nombre: string; catalogo: Estudio[] }) {
  const [abierto, setAbierto] = useState(false);
  const [estudio, setEstudio] = useState("");
  const [nota, setNota] = useState("");
  const [archivos, setArchivos] = useState<File[]>([]);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enviados, setEnviados] = useState(0);
  const entrada = useRef<HTMLInputElement>(null);

  const reiniciar = () => { setEstudio(""); setNota(""); setArchivos([]); setError(null); if (entrada.current) entrada.current.value = ""; };

  const enviar = async () => {
    if (!archivos.length) { setError("Elige el archivo o toma la foto del estudio."); return; }
    setEnviando(true);
    setError(null);
    const supabase = crearClienteNavegador();
    let n = 0;
    for (const original of archivos) {
      try {
        const archivo = await prepararArchivo(original);
        if (archivo.size > MAX_ADJUNTO) throw new Error(`${original.name} pesa más de 10 MB.`);
        const limpio = archivo.name.normalize("NFD").replace(/[^\w.-]+/g, "_").slice(-80);
        const ruta = `${orgId}/${trabajadorId}/rrhh-${crypto.randomUUID()}-${limpio}`;
        const { error: e1 } = await supabase.storage.from("adjuntos").upload(ruta, archivo, { contentType: archivo.type, upsert: false });
        if (e1) throw new Error(`No se pudo subir ${original.name}.`);
        const { error: e2 } = await supabase.rpc("entregar_estudio", {
          p_trabajador: trabajadorId, p_ruta: ruta, p_nombre: archivo.name, p_tipo_mime: archivo.type, p_tamano: archivo.size,
          p_examen: estudio || null, p_nota: nota.trim() || null,
        });
        if (e2) throw new Error(e2.message);
        n++;
      } catch (e) {
        setError((e as Error).message);
        break;
      }
    }
    setEnviando(false);
    if (n) { setEnviados(n); reiniciar(); }
  };

  return (
    <Dialog open={abierto} onOpenChange={(v) => { setAbierto(v); if (!v) { reiniciar(); setEnviados(0); } }}>
      <DialogTrigger asChild>
        <Button variant="outline" className="flex-1 xl:flex-none"><ScanLine /> Enviar estudio</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Enviar estudio al servicio médico</DialogTitle>
          <DialogDescription>
            Rx, eco, espirometría, audiometría, electrocardiograma o laboratorio de {nombre}. Es confidencial: lo verá solo el personal de salud y no quedará visible para la empresa.
          </DialogDescription>
        </DialogHeader>
        {enviados > 0 ? (
          <div className="space-y-4">
            <p className="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-3 text-sm">
              <CheckCircle2 className="size-5 shrink-0 text-primary" />
              {enviados === 1 ? "Estudio enviado." : `${enviados} archivos enviados.`} El servicio médico ya recibió el aviso.
            </p>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setEnviados(0)}>Enviar otro</Button>
              <Button onClick={() => setAbierto(false)}>Listo</Button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            <div>
              <Label htmlFor="estudio-rrhh" className="mb-1.5">¿Qué estudio es?</Label>
              <select id="estudio-rrhh" value={estudio} onChange={(e) => setEstudio(e.target.value)} className="h-10 w-full rounded-md border bg-transparent px-2 text-sm">
                <option value="">No sé / otro</option>
                {FAMILIAS.map((f) => (
                  <optgroup key={f} label={NOMBRE_FAMILIA[f]}>
                    {catalogo.filter((c) => familiaDe(c) === f).map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                  </optgroup>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="archivo-rrhh" className="mb-1.5">Archivo o foto *</Label>
              <input id="archivo-rrhh" ref={entrada} type="file" multiple accept={TIPOS_ADJUNTO} onChange={(e) => setArchivos(Array.from(e.target.files ?? []))}
                className="block w-full text-sm file:mr-3 file:rounded-md file:border file:bg-muted file:px-3 file:py-1.5 file:text-sm" />
              <p className="mt-1 text-xs text-muted-foreground">PDF o fotos, hasta 10 MB cada uno. Desde el celular puedes tomar la foto directamente.</p>
            </div>
            <div>
              <Label htmlFor="nota-rrhh" className="mb-1.5">Nota (opcional)</Label>
              <input id="nota-rrhh" value={nota} onChange={(e) => setNota(e.target.value)} maxLength={300} placeholder="Fecha del estudio, centro donde se hizo…" className="h-10 w-full rounded-md border bg-transparent px-3 text-sm" />
            </div>
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
            <Button onClick={enviar} disabled={enviando}>{enviando ? <><Loader2 className="animate-spin" /> Enviando…</> : "Enviar al servicio médico"}</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
