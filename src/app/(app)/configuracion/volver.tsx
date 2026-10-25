import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export function Volver() {
  return (
    <Link href="/configuracion" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
      <ArrowLeft className="size-4" /> Configuración
    </Link>
  );
}
