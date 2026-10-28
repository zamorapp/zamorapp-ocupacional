"use client";

import { ArrowRightLeft, BadgeCheck, ChevronDown, ClipboardList, Clock, ScanLine, FileCheck2, FileHeart, Files, FileText, FlaskConical, HeartPulse, UserRound, Loader2, NotebookPen, Pill, Printer, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { abrirEnVentana } from "@/lib/escritorio";
import { cn } from "@/lib/utils";

type Props = {
  consultaId: string;
  aptitud: boolean;
  reposo: boolean;
  tratamiento: boolean;
  examenes?: boolean;
  referencias?: boolean;
  reubicacion?: boolean;
  informeLibre?: boolean;
  preoperatoria?: boolean;
  // Personal clínico: puede anexar los exámenes escaneados
  anexos?: boolean;
  // Si hay cambios sin guardar: se guarda antes de abrir el documento (devuelve false si no se pudo)
  antes?: () => Promise<boolean>;
  ocupado?: boolean;
  variante?: "default" | "outline" | "ghost";
  compacto?: boolean;
  className?: string;
};

// Botón único «Imprimir» con los documentos que aplican a la consulta. Cada uno abre en otra pestaña lista para imprimir o guardar en PDF.
export function MenuImprimir({ consultaId, aptitud, reposo, tratamiento, examenes, referencias, reubicacion, informeLibre, preoperatoria, anexos, antes, ocupado, variante = "outline", compacto, className }: Props) {
  const docs = [
    { tipo: "paquete", texto: "Todo lo de esta consulta", nota: "uno por hoja", icono: Files },
    aptitud && { tipo: "constancia", texto: "Constancia de aptitud", icono: FileCheck2 },
    { tipo: "informe", texto: "Consulta médica (informe)", icono: FileText },
    { tipo: "informe-trabajador", texto: "Informe para el trabajador", nota: "corto", icono: UserRound },
    preoperatoria && { tipo: "preoperatoria", texto: "Evaluación preoperatoria", icono: HeartPulse },
    reposo && { tipo: "reposo", texto: "Reposo", nota: "original y copia", icono: FileHeart },
    tratamiento && { tipo: "recipe", texto: "Récipe e indicaciones", icono: Pill },
    examenes && { tipo: "orden", texto: "Orden de exámenes", icono: FlaskConical },
    referencias && { tipo: "referencia", texto: "Referencia a especialista", icono: Send },
    reubicacion && { tipo: "reubicacion", texto: "Reubicación laboral", icono: ArrowRightLeft },
    informeLibre && { tipo: "libre", texto: "Informe libre", icono: NotebookPen },
    { tipo: "certificado", texto: "Certificado de salud", icono: BadgeCheck },
    { tipo: "atencion", texto: "Constancia de atención", nota: "asistencia", icono: Clock },
    { tipo: "oam", texto: "Orden de atención ocupacional", nota: "OAM", icono: ClipboardList },
    anexos && { tipo: "anexos", texto: "Exámenes escaneados", icono: ScanLine },
  ].filter(Boolean) as { tipo: string; texto: string; nota?: string; icono: typeof FileText }[];

  const abrir = (tipo: string) => {
    const url = `/imprimir/${tipo}/${consultaId}`;
    // Con cambios sin guardar, se guarda primero y el documento abre al terminar (o no abre si falló)
    return abrirEnVentana(antes ? async () => ((await antes()) ? url : null) : url);
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
