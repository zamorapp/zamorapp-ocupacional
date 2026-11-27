"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import type { CambioCitaAgente } from "@/lib/agentes/cambios-citas";
import { avisosCambioCita, decidirCambioCita } from "./acciones";

const cuando = (fecha: string, hora: string | null) =>
  `${fecha.split("-").reverse().join("/")} · ${hora?.slice(0, 5) ?? "Sin hora"}`;

export function ListaCambiosCitas({ items }: { items: CambioCitaAgente[] | null }) {
  const router = useRouter();
  const [mensaje, setMensaje] = useState("");
  return (
    <section aria-labelledby="cambios-agenda" className="space-y-3">
      <h2 id="cambios-agenda" className="text-lg font-semibold">Cambios de agenda por aprobar</h2>
      <p role="status" className="text-sm text-muted-foreground">
        {mensaje || (items === null ? "No se pudo consultar la agenda. Comprueba la conexión a internet."
          : items.length ? "Revisa cada cambio por separado. La aprobación requiere internet." : "No hay cambios de agenda por aprobar.")}
      </p>
      {!!items?.length && <ul className="space-y-3">{items.map((c) => <Cambio key={c.id} c={c} terminado={(texto) => {
        setMensaje(texto);
        router.refresh();
      }} />)}</ul>}
    </section>
  );
}

function Cambio({ c, terminado }: { c: CambioCitaAgente; terminado: (mensaje: string) => void }) {
  const [revisando, setRevisando] = useState(false);
  const [resuelto, setResuelto] = useState(false);
  const [avisos, setAvisos] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [ocupado, iniciar] = useTransition();
  const cancelar = c.operacion === "cancelar";
  function revisar() {
    if (cancelar) { setRevisando(true); return; }
    iniciar(async () => {
      setError("");
      const avisos = await avisosCambioCita(c.id).catch(() => null);
      if (avisos === null) { setError("No se pudo comprobar el horario. Revisa la conexión y vuelve a intentar."); return; }
      setAvisos(avisos);
      setRevisando(true);
    });
  }
  function decidir(aprobar: boolean) {
    iniciar(async () => {
      setError("");
      const r = await decidirCambioCita(c.id, aprobar);
      if (!r.ok) { setError(r.mensaje); return; }
      setResuelto(true);
      terminado(r.mensaje);
    });
  }
  if (resuelto) return null;
  return (
    <li className="space-y-3 rounded-xl border bg-card p-4" data-cambio-cita={c.operacion}>
      <div>
        <h3 className="font-semibold">{cancelar ? "Cancelar cita" : "Reprogramar cita"} · {c.trabajador}</h3>
        <p className="text-sm text-muted-foreground">{c.empresa} · Preparó {c.agente}</p>
      </div>
      <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
        <div><dt className="font-medium">Cita actual</dt><dd>{cuando(c.fecha_anterior, c.hora_anterior)} · {c.estado_anterior === "solicitada" ? "Solicitada" : "Citada"}</dd></div>
        <div><dt className="font-medium">Cambio propuesto</dt><dd>{c.fecha_nueva ? cuando(c.fecha_nueva, c.hora_nueva) : "Cancelar esta cita"}</dd></div>
      </dl>
      {revisando && <p className="text-sm">{cancelar ? "Al aprobar, la cita quedará cancelada en el historial de la agenda."
        : "Al aprobar, la agenda usará la nueva fecha y hora mostradas arriba."}</p>}
      {revisando && avisos.length > 0 && (
        <ul aria-label="Avisos del horario" className="list-disc space-y-1 rounded-lg bg-aviso/10 py-2 pl-8 pr-3 text-sm text-aviso-texto">
          {avisos.map((aviso, i) => <li key={i}>{aviso}</li>)}
        </ul>
      )}
      <div className="flex flex-wrap gap-2">
        {revisando
          ? <Button className="min-h-11" variant={cancelar ? "destructive" : "default"} disabled={ocupado} onClick={() => decidir(true)}>{cancelar ? "Aprobar cancelación" : "Aprobar reprogramación"}</Button>
          : <Button className="min-h-11" disabled={ocupado} onClick={revisar}>Revisar cambio</Button>}
        {revisando && <Button className="min-h-11" variant="outline" disabled={ocupado} onClick={() => { setRevisando(false); setError(""); }}>Volver</Button>}
        <Button className="min-h-11" variant="ghost" disabled={ocupado} onClick={() => decidir(false)}>Descartar propuesta</Button>
      </div>
      {error && <p role="alert" className="text-sm text-alerta-texto">{error}</p>}
    </li>
  );
}
