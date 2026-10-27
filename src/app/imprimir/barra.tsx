"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, FileDown, FolderOpen, Loader2, Printer, SquareArrowOutUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { enEscritorio, guardarPdf, imprimirPagina, mostrarPdf } from "@/lib/escritorio";

const hoy = () => new Date().toLocaleDateString("es-VE", { day: "2-digit", month: "2-digit", year: "numeric" }).replaceAll("/", "-");

// En la web: el diálogo del navegador (imprimir o «Guardar como PDF»). En zamorApp Escritorio: «Imprimir» abre
// el diálogo de impresoras de Windows y «Guardar PDF» pregunta dónde guardar (Documentos\zamorApp\Informes).
export function BarraImpresion({ volver, titulo, bloqueado }: { volver: string; titulo: string; bloqueado?: boolean }) {
  const [escritorio, setEscritorio] = useState(false);
  const [ocupado, setOcupado] = useState<"imprimir" | "pdf" | null>(null);
  const [guardado, setGuardado] = useState<string | null>(null);
  const [error, setError] = useState("");
  useEffect(() => setEscritorio(enEscritorio()), []);

  const hacer = async (que: "imprimir" | "pdf") => {
    setError("");
    setOcupado(que);
    try {
      if (que === "imprimir") await imprimirPagina();
      else {
        const ruta = await guardarPdf(`${titulo} ${hoy()}`);
        if (ruta) setGuardado(ruta);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setOcupado(null);
    }
  };
  const ver = (abrir: boolean) => guardado && mostrarPdf(guardado, abrir).catch((e: Error) => setError(e.message));

  return (
    <div className="sticky top-0 z-10 mb-6 border-b bg-background/90 px-4 py-3 backdrop-blur print:hidden">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" asChild><Link href={volver}><ArrowLeft /> Volver</Link></Button>
        <span className="min-w-0 flex-1 truncate font-medium">{titulo}</span>
        {escritorio ? (
          <div className="flex gap-2">
            <Button variant="outline" disabled={bloqueado || !!ocupado} onClick={() => hacer("pdf")} data-accion="guardar-pdf">
              {ocupado === "pdf" ? <Loader2 className="animate-spin" /> : <FileDown />} Guardar PDF
            </Button>
            <Button disabled={bloqueado || !!ocupado} onClick={() => hacer("imprimir")} data-accion="imprimir">
              {ocupado === "imprimir" ? <Loader2 className="animate-spin" /> : <Printer />} Imprimir
            </Button>
          </div>
        ) : (
          <>
            <span className="hidden text-xs text-muted-foreground lg:inline">Para guardarlo como archivo, en «Destino» elige «Guardar como PDF». Desmarca «Encabezados y pies de página».</span>
            <Button disabled={bloqueado} onClick={() => hacer("imprimir")}>
              <Printer /> Imprimir o guardar PDF
            </Button>
          </>
        )}
      </div>
      {guardado && (
        <div className="mt-2 flex flex-wrap items-center gap-2 rounded-md bg-ok/10 px-3 py-1.5 text-sm" role="status">
          <span className="min-w-0 flex-1 break-all">PDF guardado en <span className="font-mono text-xs">{guardado}</span></span>
          <Button size="sm" variant="ghost" onClick={() => ver(true)}><SquareArrowOutUpRight /> Abrir</Button>
          <Button size="sm" variant="ghost" onClick={() => ver(false)}><FolderOpen /> Ver en la carpeta</Button>
        </div>
      )}
      {error && <p className="mt-2 text-sm text-destructive" role="alert">{error}</p>}
    </div>
  );
}
