"use client";

import { useEffect, useState, useTransition } from "react";
import { Loader2, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NOMBRE_MEDIO, type Seguimiento } from "@/lib/telemedicina-tipos";
import { abrirControl } from "../../atencion/telemedicina-acciones";

const fechaCorta = (iso: string) => iso.split("-").reverse().join("/");
const clave = (id: string) => `zamorapp:ignorar-distancia:${id}`;

// El paciente vuelve después de que su consulta a distancia se archivó: una sola vez, «Abrir control» o «Ignorar»
export function AvisoDistancia({ seguimiento: s }: { seguimiento: Seguimiento }) {
  const [visible, setVisible] = useState(false);
  const [abriendo, iniciar] = useTransition();
  const [error, setError] = useState("");
  useEffect(() => {
    try { setVisible(localStorage.getItem(clave(s.alertaId)) !== "1"); } catch { setVisible(true); }
  }, [s.alertaId]);
  if (!visible) return null;
  const ignorar = () => {
    try { localStorage.setItem(clave(s.alertaId), "1"); } catch { /* sin almacenamiento: se oculta igual */ }
    setVisible(false);
  };
  return (
    <section aria-label="Seguimiento a distancia" className="flex flex-wrap items-center gap-3 rounded-lg border border-primary/30 bg-primary/5 px-4 py-3 text-sm">
      <Phone className="size-5 shrink-0 text-primary" aria-hidden />
      <p className="min-w-0 flex-[1_1_16rem]">
        <b>Tuvo una consulta a distancia el {fechaCorta(s.fecha)}</b> ({NOMBRE_MEDIO[s.medio].toLowerCase()}){s.pedidos.length > 0 && <>; se le pidió {s.pedidos.join(", ")}</>}.
        {" "}No volvió en el plazo y quedó archivada. ¿Abrir una consulta de control enlazada?
      </p>
      <div className="flex gap-2">
        <Button size="sm" className="max-sm:h-11" disabled={abriendo} onClick={() => iniciar(async () => { const r = await abrirControl(s.consultaId); if (r && !r.ok) setError(r.mensaje); })}>
          {abriendo ? <Loader2 className="animate-spin" /> : <Phone />} Abrir control
        </Button>
        <Button size="sm" variant="ghost" className="max-sm:h-11" onClick={ignorar}>Ignorar</Button>
      </div>
      {error && <p role="alert" className="w-full text-xs text-destructive">{error}</p>}
    </section>
  );
}
