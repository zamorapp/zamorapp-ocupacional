"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, FileDown, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { marcarDescarga } from "../../acciones";

// Barra del paciente.
// · Hojas firmadas (pdf): el servidor arma el PDF con la firma y el sello del médico incrustados y el teléfono lo baja.
//   Si el servidor falla, se ofrece la impresión del navegador (sale sin la imagen, con «Firmado digitalmente»).
// · Sin firma: el navegador arma el PDF. En el iPhone no hay «Guardar como PDF»: se comparte y se guarda en Archivos.
export function BarraPaciente({ token, volver, titulo, pdf }: { token: string; volver: string; titulo: string; pdf?: { tipo: string; parte?: string } | null }) {
  const [ios, setIos] = useState(false);
  const [bajando, setBajando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => setIos(/iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)), []);

  const imprimir = async () => { await marcarDescarga(token).catch(() => undefined); window.print(); };
  const bajarPdf = async () => {
    if (!pdf) return imprimir();
    setBajando(true);
    setError(null);
    try {
      const q = new URLSearchParams({ registro: token, tipo: pdf.tipo, ...(pdf.parte ? { parte: pdf.parte } : {}) });
      const r = await fetch(`/api/pdf?${q}`, { cache: "no-store" });
      if (!r.ok) {
        const { error: e } = await r.json().catch(() => ({ error: "" }));
        throw new Error(r.status === 410 ? e : "No se pudo preparar el PDF con la firma.");
      }
      const nombre = /filename="([^"]+)"/.exec(r.headers.get("Content-Disposition") ?? "")?.[1] ?? "documento.pdf";
      const url = URL.createObjectURL(await r.blob());
      const a = Object.assign(document.createElement("a"), { href: url, download: nombre });
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : "No se pudo preparar el PDF con la firma.");
    } finally {
      setBajando(false);
    }
  };

  return (
    <div className="sticky top-0 z-10 mb-4 border-b bg-background/95 px-4 py-2 backdrop-blur print:hidden">
      <div className="mx-auto flex max-w-[216mm] items-center gap-2">
        <Button variant="ghost" size="sm" asChild><Link href={volver}><ArrowLeft /> Volver</Link></Button>
        <span className="hidden min-w-0 flex-1 truncate font-medium sm:inline">{titulo}</span>
        <Button size="lg" className="ml-auto" disabled={bajando} onClick={bajarPdf}>
          {bajando ? <><Loader2 className="animate-spin" /> Preparando…</> : <><FileDown /> Descargar PDF</>}
        </Button>
      </div>
      {error ? (
        <p role="alert" className="mx-auto mt-1 max-w-[216mm] text-xs text-destructive">
          {error}{" "}
          <button type="button" className="font-medium underline underline-offset-2" onClick={() => { setError(null); void bajarPdf(); }}>Reintentar</button>
          {" · "}
          <button type="button" className="font-medium underline underline-offset-2" onClick={imprimir}>Guardar sin la imagen de la firma</button>
        </p>
      ) : (
        <p className="mx-auto mt-1 max-w-[216mm] truncate text-xs text-muted-foreground">
          {pdf ? (bajando ? "Tarda unos segundos: el PDF sale con la firma y el sello del médico." : "El PDF sale con la firma y el sello del médico.")
            : ios ? "Toca Compartir (□↑) y elige «Guardar en Archivos»." : "Elige «Guardar como PDF» y luego «Descargar»."}
        </p>
      )}
    </div>
  );
}
