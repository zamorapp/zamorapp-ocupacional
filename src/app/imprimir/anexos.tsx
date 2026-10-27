"use client";

import { useEffect, useState } from "react";
import { FileWarning, Loader2 } from "lucide-react";
import type { Anexo } from "@/lib/documentos";

// Evento que avisa a la barra de impresión que los anexos ya están dibujados
export const ANEXOS_LISTOS = "zamorapp:anexos-listos";

type Pagina = { anexo: Anexo; src: string | null; n: number; de: number; error?: string };

// Las imágenes van tal cual; cada página de un PDF se dibuja como imagen con pdf.js para que salga en la misma impresión.
async function paginasDe(a: Anexo): Promise<Pagina[]> {
  if (!a.url) return [{ anexo: a, src: null, n: 1, de: 1, error: "No se pudo abrir el archivo." }];
  if (a.tipo === "image/heic") return [{ anexo: a, src: null, n: 1, de: 1, error: "Foto HEIC del iPhone: el navegador no la puede imprimir. Ábrela desde la consulta." }];
  if (a.tipo.startsWith("image/")) return [{ anexo: a, src: a.url, n: 1, de: 1 }];
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
  const doc = await pdfjs.getDocument({ url: a.url }).promise;
  const paginas: Pagina[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const pagina = await doc.getPage(i);
    const vista = pagina.getViewport({ scale: 2 });
    const lienzo = document.createElement("canvas");
    lienzo.width = vista.width;
    lienzo.height = vista.height;
    await pagina.render({ canvasContext: lienzo.getContext("2d")!, viewport: vista }).promise;
    paginas.push({ anexo: a, src: lienzo.toDataURL("image/jpeg", 0.85), n: i, de: doc.numPages });
  }
  return paginas;
}

/** Exámenes escaneados al final de la impresión, una página por hoja con una línea de identificación. */
export function Anexos({ anexos, trabajador, cedula }: { anexos: Anexo[]; trabajador: string; cedula: string }) {
  const [paginas, setPaginas] = useState<Pagina[] | null>(null);

  useEffect(() => {
    let vivo = true;
    (async () => {
      const todas: Pagina[] = [];
      for (const a of anexos) {
        try { todas.push(...(await paginasDe(a))); }
        catch { todas.push({ anexo: a, src: null, n: 1, de: 1, error: "No se pudo leer el PDF. Ábrelo desde la consulta." }); }
      }
      if (!vivo) return;
      setPaginas(todas);
      // Espera a que las imágenes terminen de cargar antes de habilitar «Imprimir»
      await Promise.all(todas.filter((p) => p.src).map((p) => new Promise((ok) => { const img = new Image(); img.onload = img.onerror = ok; img.src = p.src!; })));
      if (vivo) window.dispatchEvent(new Event(ANEXOS_LISTOS));
    })();
    return () => { vivo = false; };
  }, [anexos]);

  if (!paginas) {
    return (
      <p className="mx-auto mb-8 flex max-w-[216mm] items-center justify-center gap-2 rounded-lg bg-white p-6 text-sm text-neutral-600 print:hidden">
        <Loader2 className="size-4 animate-spin" /> Preparando {anexos.length} examen{anexos.length === 1 ? "" : "es"} escaneado{anexos.length === 1 ? "" : "s"}…
      </p>
    );
  }

  return (
    <>
      {paginas.map((p, i) => (
        <section
          key={`${p.anexo.id}-${p.n}`}
          className="hoja mx-auto mb-8 flex h-[279mm] w-full max-w-[216mm] flex-col bg-white px-[10mm] pt-[8mm] pb-[6mm] font-doc text-[#15201e] shadow-[0_1px_2px_rgba(0,0,0,.08),0_12px_40px_rgba(16,40,36,.14)] print:mb-0 print:h-[247mm] print:max-w-none print:p-0 print:shadow-none"
        >
          <div className="mb-2 flex items-baseline justify-between gap-3 border-b border-doc-linea pb-1.5 text-[10px]">
            <span className="min-w-0 truncate">
              <b className="text-doc-acento uppercase tracking-[.1em]">Anexo {i + 1}</b> · {p.anexo.descripcion || p.anexo.nombre}{p.de > 1 ? ` · pág. ${p.n} de ${p.de}` : ""}
            </span>
            <span className="shrink-0 font-cifra text-doc-tenue">{trabajador} · C.I. {cedula}</span>
          </div>
          {/* La imagen va en posición absoluta: así max-h-full sí se resuelve contra la hoja y no se desborda a la siguiente al imprimir */}
          <div className="relative grid min-h-0 flex-1 place-items-center overflow-hidden">
            {p.src ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={p.src} alt={p.anexo.nombre} className="absolute inset-0 m-auto max-h-full max-w-full object-contain" />
            ) : (
              <p className="flex items-center gap-2 text-sm text-neutral-600"><FileWarning className="size-5 text-[#9a6a00]" /> {p.anexo.nombre}: {p.error}</p>
            )}
          </div>
        </section>
      ))}
    </>
  );
}
