"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CalendarClock, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FranjaDeshacerLocal } from "@/components/app/franja-deshacer-local";
import { fechaLarga } from "@/lib/mensajes";
import { hoyCaracas, sumarDias } from "@/lib/fecha";
import { choquesAgenda, deshacerPosponer, posponerConsulta, type Pospuesta } from "./citas-acciones";

// «Posponer» (16-nov): la consulta que no se dio vuelve a «Citados» el día y la hora que elijas. El aviso con
// «Deshacer» vive fuera de la fila (AvisoPospuesta), porque la fila se va de la lista al cambiar de día.
const EVENTO = "zamorapp:pospuesta";
type Detalle = { pospuesta: Pospuesta; paciente: string };

// Siguiente día hábil (lunes a viernes)
function proximoHabil(hoy: string) {
  let d = sumarDias(hoy, 1);
  for (let i = 0; i < 3 && [0, 6].includes(new Date(d + "T12:00:00Z").getUTCDay()); i++) d = sumarDias(d, 1);
  return d;
}

export function BotonPosponer({ citaId, consultaId, paciente, hora, variante = "icono" }: {
  citaId?: string; consultaId?: string; paciente: string; hora?: string | null; variante?: "icono" | "texto";
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [fecha, setFecha] = useState("");
  const [horaNueva, setHoraNueva] = useState(hora?.slice(0, 5) || "08:00");
  const [choques, setChoques] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, iniciar] = useTransition();

  const abrir = () => { setFecha(proximoHabil(hoyCaracas())); setError(null); setAbierto(true); };
  // Choques (otras citas a esa hora, bloqueos, fuera del horario): solo informan, nunca impiden posponer
  useEffect(() => {
    if (!abierto || !fecha) return;
    let vigente = true;
    choquesAgenda(fecha, horaNueva || null, citaId ?? null).then((c) => { if (vigente) setChoques(c); }).catch(() => {});
    return () => { vigente = false; };
  }, [abierto, fecha, horaNueva, citaId]);

  const guardar = () => iniciar(async () => {
    const r = await posponerConsulta({ citaId, consultaId, fecha, hora: horaNueva || null });
    if (!r.ok || !r.pospuesta) { setError(r.mensaje); return; }
    setAbierto(false);
    window.dispatchEvent(new CustomEvent<Detalle>(EVENTO, { detail: { pospuesta: r.pospuesta, paciente } }));
    router.refresh();
  });

  return (
    <>
      {variante === "icono" ? (
        <Button size="icon" variant="ghost" className="size-8" title="Posponer: pasarla a otro día" aria-label={`Posponer la consulta de ${paciente}`} onClick={abrir}><CalendarClock /></Button>
      ) : (
        <Button size="sm" variant="outline" className="max-sm:min-h-11" onClick={abrir}><CalendarClock /> Posponer</Button>
      )}
      <Dialog open={abierto} onOpenChange={setAbierto}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Posponer la consulta</DialogTitle>
            <DialogDescription>{paciente} vuelve a «Citados» el día que elijas. Lo que ya escribiste se guarda y ese día lo retomas con «Atender».</DialogDescription>
          </DialogHeader>
          <form id="posponer" onSubmit={(e) => { e.preventDefault(); guardar(); }} className="grid grid-cols-2 gap-3">
            <label className="text-sm font-medium">Día
              <input type="date" required min={hoyCaracas()} value={fecha} onChange={(e) => setFecha(e.target.value)}
                className="mt-1 block h-10 w-full rounded-md border bg-transparent px-2 text-sm font-normal" />
            </label>
            <label className="text-sm font-medium">Hora
              <input type="time" value={horaNueva} onChange={(e) => setHoraNueva(e.target.value)}
                className="mt-1 block h-10 w-full rounded-md border bg-transparent px-2 text-sm font-normal" />
            </label>
            {fecha && <p className="col-span-2 text-sm text-muted-foreground first-letter:uppercase">{fechaLarga(fecha)}{horaNueva ? ` · ${horaNueva}` : ""}</p>}
            {choques.length > 0 && (
              <div className="col-span-2 flex gap-2 rounded-md border border-aviso/40 bg-aviso/10 px-3 py-2 text-sm">
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-aviso-texto" aria-hidden />
                <span>{choques.join(" · ")}. Puedes posponer igual.</span>
              </div>
            )}
            <p className="col-span-2 text-xs text-muted-foreground">Los recordatorios se mueven solos. RR. HH. recibe «Cita reprogramada».</p>
            {error && <p role="alert" className="col-span-2 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
          </form>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setAbierto(false)} className="max-sm:min-h-11">Cancelar</Button>
            <Button type="submit" form="posponer" disabled={ocupado || !fecha} className="max-sm:min-h-11">{ocupado ? <Loader2 className="animate-spin" /> : <CalendarClock />} Posponer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// Aviso «Pospuesta para … · Deshacer» (10 s; Diseño: mínimo 8 s). Va una vez por pantalla.
export function AvisoPospuesta() {
  const router = useRouter();
  const [d, setD] = useState<Detalle | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, iniciar] = useTransition();
  useEffect(() => {
    const oir = (e: Event) => { setError(null); setD((e as CustomEvent<Detalle>).detail); };
    window.addEventListener(EVENTO, oir);
    return () => window.removeEventListener(EVENTO, oir);
  }, []);
  useEffect(() => {
    if (!d) return;
    const t = setTimeout(() => setD(null), 10_000);
    return () => clearTimeout(t);
  }, [d]);
  if (!d) return null;
  const deshacer = () => iniciar(async () => {
    const r = await deshacerPosponer(d.pospuesta);
    if (!r.ok) { setError(r.mensaje); return; }
    setD(null);
    router.refresh();
  });
  return (
    <div aria-live="polite" className="fixed inset-x-4 bottom-4 z-50 mx-auto max-w-lg rounded-lg bg-background shadow-lg">
      <FranjaDeshacerLocal ocupado={ocupado} onDeshacer={deshacer} onCerrar={() => setD(null)}
        texto={error ?? `Consulta de ${d.paciente} pospuesta para el ${d.pospuesta.texto}.`} />
    </div>
  );
}
