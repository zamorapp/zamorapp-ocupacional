"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, FileDown, FolderOpen, Loader2, Printer, SquareArrowOutUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { enEscritorio, guardarPdf, imprimirPagina, mostrarPdf } from "@/lib/escritorio";
import { ANEXOS_LISTOS } from "./anexos";
import { EnviarInforme, type EnvioInforme } from "./enviar-informe";

const hoy = () => new Date().toLocaleDateString("es-VE", { day: "2-digit", month: "2-digit", year: "numeric" }).replaceAll("/", "-");

// En la web: el diálogo del navegador (imprimir o «Guardar como PDF»). En zamorApp Escritorio: «Imprimir» abre
// el diálogo de impresoras de Windows y «Guardar PDF» pregunta dónde guardar (Documentos\zamorApp\Informes).
// esperarAnexos: los botones se habilitan cuando los exámenes escaneados terminan de dibujarse (si no, saldrían en blanco).
export function BarraImpresion({ volver, titulo, bloqueado, esperarAnexos, envio, siguiente }: { volver: string; titulo: string; bloqueado?: boolean; esperarAnexos?: boolean; envio?: EnvioInforme | null; siguiente?: React.ReactNode }) {
  const [escritorio, setEscritorio] = useState(false);
  const [ocupado, setOcupado] = useState<"imprimir" | "pdf" | null>(null);
  const [guardado, setGuardado] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [preparando, setPreparando] = useState(Boolean(esperarAnexos));
  useEffect(() => setEscritorio(enEscritorio()), []);
  useEffect(() => {
    if (!esperarAnexos) return;
    const listo = () => setPreparando(false);
    window.addEventListener(ANEXOS_LISTOS, listo);
    return () => window.removeEventListener(ANEXOS_LISTOS, listo);
  }, [esperarAnexos]);

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
  const inactivo = bloqueado || preparando || !!ocupado;

  return (
    <div className="sticky top-0 z-10 mb-6 border-b bg-background/90 px-4 py-3 backdrop-blur print:hidden">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" asChild><Link href={volver}><ArrowLeft /> Volver</Link></Button>
        <span className="min-w-0 flex-1 truncate font-medium">{titulo}</span>
        {envio && <EnviarInforme {...envio} />}
        {siguiente}
        {escritorio ? (
          <div className="flex gap-2">
            <Button variant="outline" disabled={inactivo} onClick={() => hacer("pdf")} data-accion="guardar-pdf">
              {ocupado === "pdf" ? <Loader2 className="animate-spin" /> : <FileDown />} Guardar PDF
            </Button>
            <Button disabled={inactivo} onClick={() => hacer("imprimir")} data-accion="imprimir">
              {ocupado === "imprimir" || preparando ? <Loader2 className="animate-spin" /> : <Printer />} {preparando ? "Preparando anexos…" : "Imprimir"}
            </Button>
          </div>
        ) : (
          <>
            <span className="hidden text-xs text-muted-foreground lg:inline">Para guardarlo como archivo, en «Destino» elige «Guardar como PDF». Desmarca «Encabezados y pies de página».</span>
            <Button disabled={inactivo} onClick={() => hacer("imprimir")}>
              {preparando ? <Loader2 className="animate-spin" /> : <Printer />} {preparando ? "Preparando anexos…" : "Imprimir o guardar PDF"}
            </Button>
          </>
        )}
      </div>
      {guardado && (
        <div className="mt-2 flex flex-wrap items-center gap-2 rounded-md bg-ok/10 px-3 py-1.5 text-sm" role="status" data-estado="pdf-guardado">
          <span className="min-w-0 flex-1 break-all">PDF guardado en <span className="font-mono text-xs">{guardado}</span></span>
          <Button size="sm" variant="ghost" onClick={() => ver(true)}><SquareArrowOutUpRight /> Abrir</Button>
          <Button size="sm" variant="ghost" onClick={() => ver(false)}><FolderOpen /> Ver en la carpeta</Button>
        </div>
      )}
      {error && <p className="mt-2 text-sm text-destructive" role="alert" data-estado="error">{error}</p>}
    </div>
  );
}
