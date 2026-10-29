"use client";

// Aviso «Hay cambios por revisar» en el programa de escritorio: aparece arriba cuando la nube no aceptó algo guardado
// en esta PC y quien mira puede resolverlo. No bloquea; se puede ignorar hasta la próxima apertura (vuelve si hay casos nuevos).
import { AlertTriangle, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { ESCRITORIO } from "@/lib/escritorio-actualizar";
import { EVENTO_BANDEJA, leerBandeja } from "@/lib/escritorio-bandeja";

const CLAVE = "zamorapp-aviso-conflictos";

// Casos que quien mira puede resolver; se repasa cada minuto y al resolver uno. La usan el aviso y el menú.
export function useCasosBandeja(): string[] {
  const [ids, setIds] = useState<string[]>([]);
  useEffect(() => {
    if (!ESCRITORIO) return;
    let vivo = true;
    const mirar = async () => {
      const l = await leerBandeja();
      if (vivo) setIds(l?.revisar.map((c) => c.id) ?? []);
    };
    mirar();
    const t = setInterval(mirar, 60e3);
    window.addEventListener(EVENTO_BANDEJA, mirar);
    return () => { vivo = false; clearInterval(t); window.removeEventListener(EVENTO_BANDEJA, mirar); };
  }, []);
  return ids;
}

const leerIgnorados = (): string[] => {
  try { return JSON.parse(sessionStorage.getItem(CLAVE) || "[]"); } catch { return []; }
};

export function AvisoConflictos() {
  const ids = useCasosBandeja();
  const [ignorados, setIgnorados] = useState<string[]>([]);
  const ruta = usePathname();
  useEffect(() => setIgnorados(leerIgnorados()), []);

  // Se ignoran los casos vistos, no la cantidad: uno nuevo vuelve a mostrar el aviso aunque otro se haya resuelto
  const nuevos = ids.filter((id) => !ignorados.includes(id));
  if (!nuevos.length || ruta === "/conflictos") return null;
  const n = ids.length;
  return (
    <div role="status" data-aviso="conflictos" className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b bg-aviso/10 px-4 py-2 text-sm sm:px-6">
      <span className="flex items-center gap-2 font-medium"><AlertTriangle className="size-4 text-aviso-texto" aria-hidden /> {n === 1 ? "1 cambio por revisar" : `${n} cambios por revisar`}</span>
      <span className="text-muted-foreground">La nube no aceptó algo guardado en esta PC. Nada se perdió.</span>
      <span className="flex flex-wrap items-center gap-2">
        <Button size="sm" asChild><Link href="/conflictos">Revisar</Link></Button>
        <Button size="sm" variant="ghost" aria-label="Ignorar por ahora" onClick={() => { try { sessionStorage.setItem(CLAVE, JSON.stringify(ids)); } catch { /* sin almacenamiento */ } setIgnorados(ids); }}><X aria-hidden /> Ignorar</Button>
      </span>
    </div>
  );
}
