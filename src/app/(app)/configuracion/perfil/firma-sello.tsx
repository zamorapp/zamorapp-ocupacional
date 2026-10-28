"use client";

import { useRef, useState, useTransition } from "react";
import { ImageUp, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { guardarImagenFirma, mostrarFirmaSello } from "../acciones";
import { confirmar } from "@/components/app/confirmar";

// Reduce la imagen y vuelve transparente el fondo claro (papel) para que se vea bien sobre el documento
async function preparar(archivo: File, ancho: number): Promise<string> {
  const img = await createImageBitmap(archivo);
  const escala = Math.min(1, ancho / img.width);
  const lienzo = document.createElement("canvas");
  lienzo.width = Math.round(img.width * escala);
  lienzo.height = Math.round(img.height * escala);
  const ctx = lienzo.getContext("2d")!;
  ctx.drawImage(img, 0, 0, lienzo.width, lienzo.height);
  const px = ctx.getImageData(0, 0, lienzo.width, lienzo.height);
  for (let i = 0; i < px.data.length; i += 4) {
    const luz = (px.data[i] + px.data[i + 1] + px.data[i + 2]) / 3;
    px.data[i + 3] = luz > 200 ? 0 : luz > 150 ? Math.round((200 - luz) * 5) : 255;
  }
  ctx.putImageData(px, 0, 0);
  return lienzo.toDataURL("image/png");
}

function Imagen({ tipo, titulo, ayuda, inicial, mostrarInicial }: { tipo: "firma" | "sello"; titulo: string; ayuda: string; inicial: string | null; mostrarInicial: boolean }) {
  const [imagen, setImagen] = useState(inicial);
  const [mostrar, setMostrar] = useState(mostrarInicial);
  const [aviso, setAviso] = useState<string | null>(null);
  const [ocupado, iniciar] = useTransition();
  const entrada = useRef<HTMLInputElement>(null);
  const subir = (f: File | undefined) => f && iniciar(async () => {
    const datos = await preparar(f, tipo === "firma" ? 600 : 900);
    const r = await guardarImagenFirma(tipo, datos);
    setAviso(r.ok ? null : r.mensaje);
    if (r.ok) setImagen(datos);
  });
  return (
    <div className="space-y-2">
      <div className="text-sm font-medium">{titulo}</div>
      <div className="flex h-36 items-center justify-center overflow-hidden rounded-lg border border-dashed bg-white p-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {imagen ? <img src={imagen} alt={titulo} className="h-full w-full object-contain" /> : <span className="text-sm text-muted-foreground">Sin imagen</span>}
      </div>
      <p className="text-xs text-muted-foreground">{ayuda}</p>
      <input ref={entrada} type="file" accept="image/*" className="hidden" onChange={(e) => subir(e.target.files?.[0])} />
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" variant="outline" disabled={ocupado} onClick={() => entrada.current?.click()}>
          {ocupado ? <Loader2 className="animate-spin" /> : <ImageUp />} {imagen ? "Cambiar" : "Subir foto"}
        </Button>
        {imagen && (
          <Button type="button" size="sm" variant="ghost" disabled={ocupado} onClick={async () => (await confirmar({ titulo: `¿Quitar ${tipo === "firma" ? "la firma" : "el sello"}?`, texto: "Los documentos nuevos saldrán sin esta imagen hasta que cargues otra.", accion: "Quitar", peligro: true })) && iniciar(async () => { const r = await guardarImagenFirma(tipo, null); if (r.ok) setImagen(null); })}>
            <Trash2 /> Quitar
          </Button>
        )}
        <label className="ml-auto flex items-center gap-2 text-sm">
          <input type="checkbox" checked={mostrar} className="size-4 accent-[var(--primary)]"
            onChange={(e) => { const v = e.target.checked; setMostrar(v); iniciar(async () => { await mostrarFirmaSello(tipo === "firma" ? "mostrar_firma" : "mostrar_sello", v); }); }} />
          Imprimir en los documentos
        </label>
      </div>
      {aviso && <p className="text-sm text-destructive">{aviso}</p>}
    </div>
  );
}

/** Firma y sello del médico: se imprimen en sus casillas en constancias, reposos, informes, certificados, órdenes y récipes. */
export function FirmaSello({ firma, sello, mostrarFirma, mostrarSello }: { firma: string | null; sello: string | null; mostrarFirma: boolean; mostrarSello: boolean }) {
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Firma y sello</CardTitle></CardHeader>
      <CardContent className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        <Imagen tipo="firma" titulo="Firma" ayuda="Foto o escaneo de tu firma en papel blanco." inicial={firma} mostrarInicial={mostrarFirma} />
        <Imagen tipo="sello" titulo="Sello" ayuda="Foto o escaneo del sello húmedo en papel blanco." inicial={sello} mostrarInicial={mostrarSello} />
        <p className="text-xs text-muted-foreground sm:col-span-2">
          Si desmarcas «Imprimir en los documentos», queda la casilla vacía para firmar o sellar a mano. Si la firma y el sello van en casillas separadas o juntos se elige en Configuración › Organización.
        </p>
      </CardContent>
    </Card>
  );
}
