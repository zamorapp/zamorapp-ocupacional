"use client";

import { useRef, useState, useTransition } from "react";
import { ImageUp, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";

// Reduce el logo a un tamaño de membrete (máx. 600 × 240 px) conservando la transparencia
async function preparar(archivo: File): Promise<string> {
  const img = await createImageBitmap(archivo);
  const escala = Math.min(1, 600 / img.width, 240 / img.height);
  const lienzo = document.createElement("canvas");
  lienzo.width = Math.round(img.width * escala);
  lienzo.height = Math.round(img.height * escala);
  lienzo.getContext("2d")!.drawImage(img, 0, 0, lienzo.width, lienzo.height);
  return lienzo.toDataURL("image/png");
}

type Props = {
  inicial: string | null;
  editable: boolean;
  guardar: (logo: string | null) => Promise<{ ok: boolean; mensaje: string }>;
  ayuda?: string;
};

/** Vista previa y carga del logo que sale en el membrete de los informes impresos. */
export function CargarLogo({ inicial, editable, guardar, ayuda }: Props) {
  const [logo, setLogo] = useState(inicial);
  const [aviso, setAviso] = useState<{ ok: boolean; mensaje: string } | null>(null);
  const [ocupado, iniciar] = useTransition();
  const entrada = useRef<HTMLInputElement>(null);

  const cambiar = (nuevo: string | null) =>
    iniciar(async () => {
      const r = await guardar(nuevo);
      setAviso(r);
      if (r.ok) setLogo(nuevo);
    });

  const subir = (f: File | undefined) =>
    f &&
    iniciar(async () => {
      const nuevo = await preparar(f).catch(() => null);
      if (!nuevo) return setAviso({ ok: false, mensaje: "No se pudo leer la imagen. Usa PNG o JPG." });
      const r = await guardar(nuevo);
      setAviso(r);
      if (r.ok) setLogo(nuevo);
    });

  return (
    <div className="space-y-3">
      {/* flex con alto fijo: en grid el max-h-full del img no tiene alto de referencia y se desborda */}
      <div className="flex h-28 items-center justify-center overflow-hidden rounded-lg border border-dashed bg-white p-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {logo ? <img src={logo} alt="Logo" className="max-h-full max-w-full object-contain" /> : <span className="text-sm text-neutral-500">Sin logo</span>}
      </div>
      {ayuda && <p className="text-xs text-muted-foreground">{ayuda}</p>}
      {editable && (
        <div className="flex flex-wrap gap-2">
          <input ref={entrada} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => subir(e.target.files?.[0])} />
          <Button type="button" size="sm" variant="outline" disabled={ocupado} onClick={() => entrada.current?.click()}>
            {ocupado ? <Loader2 className="animate-spin" /> : <ImageUp />} {logo ? "Cambiar logo" : "Subir logo"}
          </Button>
          {logo && (
            <Button type="button" size="sm" variant="ghost" disabled={ocupado} onClick={() => cambiar(null)}>
              <Trash2 /> Quitar
            </Button>
          )}
        </div>
      )}
      {aviso?.mensaje && <p className={aviso.ok ? "text-sm text-ok-texto" : "text-sm text-destructive"}>{aviso.mensaje}</p>}
    </div>
  );
}
