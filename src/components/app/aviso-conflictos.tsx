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

export function AvisoConflictos() {
  const [n, setN] = useState(0);
  const [ignorados, setIgnorados] = useState(0);
  const ruta = usePathname();

  useEffect(() => {
    if (!ESCRITORIO) return;
    try { setIgnorados(Number(sessionStorage.getItem(CLAVE) || 0)); } catch { /* sin almacenamiento */ }
    let vivo = true;
    const mirar = async () => {
      const l = await leerBandeja();
      if (vivo) setN(l?.revisar.length ?? 0);
    };
    mirar();
    const t = setInterval(mirar, 60e3);
    window.addEventListener(EVENTO_BANDEJA, mirar);
    return () => { vivo = false; clearInterval(t); window.removeEventListener(EVENTO_BANDEJA, mirar); };
  }, []);

  if (!n || n <= ignorados || ruta === "/conflictos") return null;
  return (
    <div role="status" data-aviso="conflictos" className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b bg-aviso/10 px-4 py-2 text-sm sm:px-6">
      <span className="flex items-center gap-2 font-medium"><AlertTriangle className="size-4 text-aviso-texto" aria-hidden /> {n === 1 ? "1 cambio por revisar" : `${n} cambios por revisar`}</span>
      <span className="text-muted-foreground">La nube no aceptó algo guardado en esta PC. Nada se perdió.</span>
      <span className="flex flex-wrap items-center gap-2">
        <Button size="sm" asChild><Link href="/conflictos">Revisar</Link></Button>
        <Button size="sm" variant="ghost" aria-label="Ignorar por ahora" onClick={() => { try { sessionStorage.setItem(CLAVE, String(n)); } catch { /* sin almacenamiento */ } setIgnorados(n); }}><X aria-hidden /> Ignorar</Button>
      </span>
    </div>
  );
}
