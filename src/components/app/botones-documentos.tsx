import Link from "next/link";
import { BadgeCheck, FileCheck2, FileHeart, FileText, FlaskConical, Pill } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = { consultaId: string; aptitud: boolean; reposo: boolean; tratamiento: boolean; examenes?: boolean; compacto?: boolean };

// Enlaces a los documentos imprimibles de una consulta; solo los que aplican
export function BotonesDocumentos({ consultaId, aptitud, reposo, tratamiento, examenes, compacto }: Props) {
  const docs = [
    aptitud && { tipo: "constancia", texto: "Constancia", icono: FileCheck2 },
    reposo && { tipo: "reposo", texto: "Reposo", icono: FileHeart },
    { tipo: "informe", texto: "Informe", icono: FileText },
    { tipo: "certificado", texto: "Certificado de salud", icono: BadgeCheck },
    tratamiento && { tipo: "recipe", texto: "Récipe", icono: Pill },
    examenes && { tipo: "orden", texto: "Orden de exámenes", icono: FlaskConical },
  ].filter(Boolean) as { tipo: string; texto: string; icono: typeof FileText }[];

  return (
    <div className="flex flex-wrap gap-1.5">
      {docs.map(({ tipo, texto, icono: Icono }) => (
        <Link
          key={tipo}
          href={`/imprimir/${tipo}/${consultaId}`}
          target="_blank"
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md border bg-card font-medium transition hover:border-primary/50 hover:text-primary",
            compacto ? "px-2 py-1 text-xs" : "px-3 py-1.5 text-sm",
          )}
        >
          <Icono className="size-3.5" /> {texto}
        </Link>
      ))}
    </div>
  );
}
