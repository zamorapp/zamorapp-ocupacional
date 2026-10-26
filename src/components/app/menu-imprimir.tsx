"use client";

import { BadgeCheck, ChevronDown, FileCheck2, FileHeart, Files, FileText, FlaskConical, Loader2, Pill, Printer, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

type Props = {
  consultaId: string;
  aptitud: boolean;
  reposo: boolean;
  tratamiento: boolean;
  examenes?: boolean;
  referencias?: boolean;
  // Si hay cambios sin guardar: se guarda antes de abrir el documento (devuelve false si no se pudo)
  antes?: () => Promise<boolean>;
  ocupado?: boolean;
  variante?: "default" | "outline" | "ghost";
  compacto?: boolean;
  className?: string;
};

// Botón único «Imprimir» con los documentos que aplican a la consulta. Cada uno abre en otra pestaña lista para imprimir o guardar en PDF.
export function MenuImprimir({ consultaId, aptitud, reposo, tratamiento, examenes, referencias, antes, ocupado, variante = "outline", compacto, className }: Props) {
  const docs = [
    { tipo: "paquete", texto: "Todo lo de esta consulta", nota: "uno por hoja", icono: Files },
    aptitud && { tipo: "constancia", texto: "Constancia de aptitud", icono: FileCheck2 },
    { tipo: "informe", texto: "Consulta médica (informe)", icono: FileText },
    reposo && { tipo: "reposo", texto: "Reposo", nota: "original y copia", icono: FileHeart },
    tratamiento && { tipo: "recipe", texto: "Récipe e indicaciones", icono: Pill },
    examenes && { tipo: "orden", texto: "Orden de exámenes", icono: FlaskConical },
    referencias && { tipo: "referencia", texto: "Referencia a especialista", icono: Send },
    { tipo: "certificado", texto: "Certificado de salud", icono: BadgeCheck },
  ].filter(Boolean) as { tipo: string; texto: string; nota?: string; icono: typeof FileText }[];

  const abrir = async (tipo: string) => {
    const url = `/imprimir/${tipo}/${consultaId}`;
    if (!antes) return void window.open(url, "_blank");
    // La pestaña se abre ya (si se abre después de esperar, el navegador la bloquea) y se dirige al documento al terminar de guardar
    const pestana = window.open("about:blank", "_blank");
    if (await antes()) {
      if (pestana) pestana.location.href = url;
      else window.location.href = url;
    } else pestana?.close();
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant={variante} size={compacto ? "sm" : "default"} disabled={ocupado} className={cn("relative z-[1]", className)} aria-label="Imprimir documentos">
          {ocupado ? <Loader2 className="animate-spin" /> : <Printer />}
          {!compacto && "Imprimir"}
          <ChevronDown className="opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="text-xs text-muted-foreground">{antes ? "Se guardan los cambios antes de imprimir" : "Abrir para imprimir o guardar PDF"}</DropdownMenuLabel>
        {docs.map(({ tipo, texto, nota, icono: Icono }, i) => (
          <div key={tipo}>
            {i === 1 && <DropdownMenuSeparator />}
            <DropdownMenuItem onSelect={() => void abrir(tipo)} className={i === 0 ? "font-medium" : undefined}>
              <Icono /> <span className="flex-1">{texto}</span>
              {nota && <span className="text-xs text-muted-foreground">{nota}</span>}
            </DropdownMenuItem>
          </div>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
