"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowLeft, FileDown, Loader2, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { marcarDescarga } from "../../acciones";

// Barra del paciente.
// · Hojas firmadas (pdf): el servidor arma el PDF con la firma y el sello del médico incrustados y el teléfono lo baja.
//   Si falla: «Intentar de nuevo» o «Descargar igual» (impresión del navegador, con «Firmado digitalmente»). Un intento
//   fallido no abre la ventana de 30 minutos; si ya se cerró (410), se dice y se da el teléfono del servicio; pasado
//   el límite de PDF del enlace (429), solo «Descargar igual».
// · Sin firma: el navegador arma el PDF. En el iPhone no hay «Guardar como PDF»: se comparte y se guarda en Archivos.
type Falla = "error" | "cerrado" | "limite" | null;

export function BarraPaciente({ token, volver, titulo, pdf, telefono }: {
  token: string; volver: string; titulo: string; pdf?: { tipo: string; parte?: string } | null; telefono?: string | null;
}) {
  const [ios, setIos] = useState(false);
  const [bajando, setBajando] = useState(false);
  const [falla, setFalla] = useState<Falla>(null);
  useEffect(() => setIos(/iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)), []);

  const imprimir = async () => { await marcarDescarga(token).catch(() => undefined); window.print(); };
  const bajarPdf = async () => {
    if (!pdf) return imprimir();
    setBajando(true);
    setFalla(null);
    try {
      const q = new URLSearchParams({ registro: token, tipo: pdf.tipo, ...(pdf.parte ? { parte: pdf.parte } : {}) });
      const r = await fetch(`/api/pdf?${q}`, { cache: "no-store" });
      if (r.status === 410) return setFalla("cerrado");
      if (r.status === 429) return setFalla("limite");
      if (!r.ok) throw new Error();
      const nombre = /filename="([^"]+)"/.exec(r.headers.get("Content-Disposition") ?? "")?.[1] ?? "documento.pdf";
      const url = URL.createObjectURL(await r.blob());
      const a = Object.assign(document.createElement("a"), { href: url, download: nombre });
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch {
      setFalla("error");
    } finally {
      setBajando(false);
    }
  };

  return (
    <div className="sticky top-0 z-10 mb-4 border-b bg-background/95 px-4 py-2 backdrop-blur print:hidden">
      <div className="mx-auto flex max-w-[216mm] items-center gap-2">
        <Button variant="ghost" size="sm" asChild><Link href={volver}><ArrowLeft /> Volver</Link></Button>
        <span className="hidden min-w-0 flex-1 truncate font-medium sm:inline">{titulo}</span>
        <Button size="lg" className="ml-auto" disabled={bajando || falla === "cerrado" || falla === "limite"} onClick={bajarPdf}>
          {bajando ? <><Loader2 className="animate-spin" /> Preparando…</> : <><FileDown /> Descargar PDF</>}
        </Button>
      </div>
      {falla ? (
        <div role="alert" className="mx-auto mt-2 max-w-[216mm] rounded-lg border border-aviso/40 bg-aviso/10 p-3 text-sm text-aviso-texto">
          <p className="flex items-start gap-2 font-medium">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            {falla === "cerrado" ? (
              <span>
                Tus documentos ya fueron descargados. Si necesitas descargarlos de nuevo, pide un enlace nuevo al servicio
                {telefono && <> al <a className="underline underline-offset-2" href={`tel:${telefono}`}>{telefono}</a></>}.
              </span>
            ) : falla === "limite" ? "Ya preparamos este PDF varias veces en este enlace. Descárgalo igual desde aquí."
              : "No pudimos preparar tu PDF. Revisa tu conexión e inténtalo de nuevo."}
          </p>
          {falla !== "cerrado" && (
            <>
              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                {falla === "error" && <Button className="min-h-11" onClick={bajarPdf}><RotateCw /> Intentar de nuevo</Button>}
                <Button variant={falla === "error" ? "outline" : "default"} className="min-h-11" onClick={imprimir}><FileDown /> Descargar igual</Button>
              </div>
              <p className="mt-2 text-xs">Sale con «Firmado digitalmente» en vez de la imagen de la firma; es igual de válido.</p>
            </>
          )}
        </div>
      ) : (
        <p className="mx-auto mt-1 max-w-[216mm] text-xs text-muted-foreground">
          {pdf ? (bajando ? "Tarda unos segundos." : "El PDF sale con la firma y el sello del médico.")
            : ios ? "Toca Compartir (□↑) y elige «Guardar en Archivos»." : "Elige «Guardar como PDF» y luego «Descargar»."}
        </p>
      )}
    </div>
  );
}
