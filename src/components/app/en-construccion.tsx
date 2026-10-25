import { Construction } from "lucide-react";
import { SECCIONES } from "@/lib/navegacion";

export function EnConstruccion({ href }: { href: string }) {
  const seccion = SECCIONES.find((s) => s.href === href)!;
  const Icono = seccion.icono;
  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex items-center gap-3">
        <span className="grid size-11 place-items-center rounded-xl bg-primary/10 text-primary">
          <Icono className="size-6" />
        </span>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{seccion.titulo}</h1>
          <p className="text-muted-foreground">{seccion.descripcion}</p>
        </div>
      </div>
      <div className="grid place-items-center rounded-2xl border border-dashed bg-card py-20 text-center">
        <Construction className="mb-3 size-8 text-muted-foreground" />
        <p className="font-medium">Módulo en construcción</p>
        <p className="text-sm text-muted-foreground">La estructura de datos ya está lista en Supabase.</p>
      </div>
    </div>
  );
}
