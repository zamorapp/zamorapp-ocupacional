"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

// Con muchas columnas, la tabla solo cabe a 9 pt partiendo palabras dentro de las celdas. La letra nunca se achica:
// se mide si, sin partir palabras, la tabla se saldría del ancho de la hoja y, si es así, se avisa en pantalla (no se imprime).
// extras: hay columnas adicionales encendidas (solo entonces se ofrece quitarlas)
export function AvisoColumnas({ volver, extras }: { volver: string; extras: boolean }) {
  const [partidas, setPartidas] = useState(false);
  const [ignorado, setIgnorado] = useState(false);
  useEffect(() => {
    const medir = () => {
      const t = document.querySelector<HTMLTableElement>("table[data-tabla-reporte]");
      if (!t?.parentElement) return;
      // Se mide sin partir palabras; si así se sale de la hoja, se permite partirlas (data-partir) y se avisa
      delete t.dataset.partir;
      const caja = getComputedStyle(t.parentElement);
      const ancho = t.parentElement.clientWidth - parseFloat(caja.paddingLeft) - parseFloat(caja.paddingRight);
      const pasa = t.scrollWidth > ancho + 1;
      if (pasa) t.dataset.partir = "1";
      setPartidas(pasa);
    };
    medir();
    document.fonts?.ready.then(medir).catch(() => {});
    // Al imprimir cambia el ancho (papel): se vuelve a medir antes
    window.addEventListener("resize", medir);
    window.addEventListener("beforeprint", medir);
    return () => { window.removeEventListener("resize", medir); window.removeEventListener("beforeprint", medir); };
  }, []);
  if (!partidas || ignorado) return null;
  return (
    <div role="status" className="mx-auto mb-3 flex max-w-[279mm] flex-wrap items-center gap-3 rounded-lg border border-aviso/40 bg-aviso/10 px-4 py-3 text-sm text-aviso-texto print:hidden">
      <TriangleAlert className="size-5 shrink-0" aria-hidden />
      <span className="min-w-[14rem] flex-1">Con tantas columnas, algunas palabras se cortan dentro de su celda para que la tabla quepa a lo ancho sin achicar la letra (9 pt).{extras ? " Para que se lean enteras, quita columnas adicionales." : ""}</span>
      <Button variant="ghost" size="sm" onClick={() => setIgnorado(true)}>Ignorar</Button>
      {extras && <Button size="sm" asChild><Link href={volver}>Quitar columnas</Link></Button>}
    </div>
  );
}
