"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AlertTriangle, CheckCircle2, Loader2, Trash2, Undo2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { restaurarDePapelera } from "@/app/(app)/configuracion/papelera/acciones";

// Franja que aparece después de eliminar algo (?papelera=<id>&eliminado=<texto>&volver=<ruta>): «Deshacer» lo restaura
// y lleva de vuelta a donde estaba. Si se cierra, sigue en Configuración › Papelera.
export function FranjaDeshacer() {
  const params = useSearchParams();
  const ruta = usePathname();
  const router = useRouter();
  const [cerrada, setCerrada] = useState(false);
  const [error, setError] = useState("");
  const [enCurso, iniciar] = useTransition();
  const id = params.get("papelera");
  if (!id || cerrada) return null;
  const texto = params.get("eliminado") ?? "Eliminado.";
  const volver = params.get("volver");

  const limpiar = () => router.replace(ruta, { scroll: false });
  const deshacer = () => iniciar(async () => {
    const r = await restaurarDePapelera(id);
    if (!r.ok) return setError(r.mensaje);
    // Solo rutas internas
    router.replace(volver?.startsWith("/") && !volver.startsWith("//") ? volver : ruta);
    router.refresh();
  });

  return (
    <div role="status" className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-primary/30 bg-primary/5 px-4 py-2.5 text-sm">
      {error
        ? <AlertTriangle className="size-4 shrink-0 text-alerta-texto" aria-hidden />
        : <CheckCircle2 className="size-4 shrink-0 text-primary" aria-hidden />}
      <span role={error ? "alert" : undefined} className={error ? "min-w-0 flex-1 basis-56 text-alerta-texto" : "min-w-0 flex-1 basis-56"}>{error || texto}</span>
      <Button size="sm" variant="outline" onClick={deshacer} disabled={enCurso}>
        {enCurso ? <Loader2 className="animate-spin" /> : <Undo2 />} Deshacer
      </Button>
      <Button size="sm" variant="ghost" asChild><Link href="/configuracion/papelera"><Trash2 /> Ver Papelera</Link></Button>
      <Button size="icon" variant="ghost" className="size-7" aria-label="Cerrar" onClick={() => { setCerrada(true); limpiar(); }}><X className="size-4" /></Button>
    </div>
  );
}

// Ruta con los datos de la franja
export function rutaConDeshacer(destino: string, papeleraId: string, mensaje: string, volver: string): string {
  const q = new URLSearchParams({ papelera: papeleraId, eliminado: mensaje, volver });
  return `${destino}${destino.includes("?") ? "&" : "?"}${q.toString()}`;
}
