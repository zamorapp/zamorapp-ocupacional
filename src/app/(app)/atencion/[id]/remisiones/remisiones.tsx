"use client";

import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ZONA } from "@/lib/fecha";
import { anotarRemision, enviarOrden, prepararRemision } from "./acciones";

type Examen = { id: string; nombre: string };
type PrestadorElegible = { id: string; nombre: string; correo: string };
export type CorreoRemision = { id: string; destino: string; estado: "enviando" | "por_confirmar" | "enviado" | null };
export type Remision = {
  id: string;
  prestador: string;
  creada_en: string;
  enviada_en: string | null;
  examenes: (Examen & { recibido_en: string | null })[];
};

const fechaHora = new Intl.DateTimeFormat("es-VE", { dateStyle: "short", timeStyle: "short", timeZone: ZONA });

export function AltaRemision({ consulta, examenes, prestadores }: { consulta: string; examenes: Examen[]; prestadores: PrestadorElegible[] }) {
  const [prestador, setPrestador] = useState("");
  const [prestadorId, setPrestadorId] = useState("");
  const [elegidos, setElegidos] = useState<string[]>([]);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [guardando, iniciar] = useTransition();
  const intento = useRef<{ id: string; datos: string } | null>(null);

  function guardar() {
    const datos = JSON.stringify([prestadorId, prestador.trim(), elegidos]);
    const id = intento.current?.datos === datos ? intento.current.id : crypto.randomUUID();
    intento.current = { id, datos };
    iniciar(async () => {
      setMensaje(null);
      const error = await prepararRemision(id, consulta, prestador, elegidos, prestadorId || undefined)
        .catch(() => "No se pudo guardar. Revisa la conexión y vuelve a intentar.");
      if (error) return setMensaje(error);
      intento.current = null;
      setPrestador("");
      setPrestadorId("");
      setElegidos([]);
    });
  }

  return (
    <Card>
      <CardContent>
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); guardar(); }}>
          {!!prestadores.length && <label className="block space-y-1.5 text-sm font-medium">
            Prestador del directorio
            <select className="block w-full min-w-0 max-w-full rounded-md border bg-card p-2" value={prestadorId} disabled={guardando} onChange={(e) => setPrestadorId(e.target.value)}>
              <option value="">Escribir otro prestador</option>
              {prestadores.map((p) => <option key={p.id} value={p.id}>{p.nombre} · {p.correo}</option>)}
            </select>
          </label>}
          {!prestadorId && <label className="block space-y-1.5 text-sm font-medium">
            Prestador
            <Input value={prestador} onChange={(e) => setPrestador(e.target.value)} maxLength={120} required disabled={guardando} />
          </label>}
          <fieldset className="space-y-2" disabled={guardando}>
            <legend className="mb-2 text-sm font-medium">Exámenes que se van a remitir</legend>
            {examenes.map((e) => <label key={e.id} className="flex items-start gap-2 text-sm">
              <input type="checkbox" checked={elegidos.includes(e.id)} className="mt-0.5"
                onChange={(c) => setElegidos((lista) => c.target.checked ? [...lista, e.id] : lista.filter((id) => id !== e.id))} />
              {e.nombre}
            </label>)}
          </fieldset>
          {mensaje && <p role="alert" className="text-sm text-alerta-texto">{mensaje}</p>}
          <Button disabled={guardando || (!prestadorId && !prestador.trim()) || !elegidos.length}>Preparar orden</Button>
        </form>
      </CardContent>
    </Card>
  );
}

export function MovimientosRemision({ consulta, remision, correo }: { consulta: string; remision: Remision; correo?: CorreoRemision }) {
  const [elegidos, setElegidos] = useState<string[]>([]);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [guardando, iniciar] = useTransition();
  const [destinoConfirmado, confirmar] = useState<string | null>(null);
  const recibidos = remision.examenes.filter((e) => e.recibido_en).length;
  const estado = !remision.enviada_en ? "Preparada"
    : recibidos === remision.examenes.length ? "Recibida" : recibidos ? "Recepción parcial" : "Enviada";

  function registrar(examenes: string[] | null) {
    iniciar(async () => {
      setMensaje(null);
      const error = await anotarRemision(remision.id, consulta, examenes)
        .catch(() => "No se pudo registrar. Revisa la conexión y vuelve a intentar.");
      if (error) return setMensaje(error);
      setElegidos([]);
    });
  }

  function enviar() {
    if (!destinoConfirmado) return;
    const destino = destinoConfirmado;
    iniciar(async () => {
      setMensaje(null);
      confirmar(null);
      const resultado = await enviarOrden({ id: remision.id, consulta, destino })
        .catch(() => ({ status: 502, mensaje: "No se pudo confirmar el envío. Revisa la entrega antes de volver a intentarlo." }));
      if (resultado.status !== 200) setMensaje(resultado.mensaje);
    });
  }

  return (
    <Card>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="break-words font-semibold">{remision.prestador}</h2>
            <p className="text-sm text-muted-foreground">{estado} · {recibidos} de {remision.examenes.length} recibidos</p>
            {remision.enviada_en && <p className="text-xs text-muted-foreground">Enviada el {fechaHora.format(new Date(remision.enviada_en))}</p>}
            {correo?.estado === "enviado" && <p className="break-all text-xs text-muted-foreground">Enviada por correo a {correo.destino}</p>}
          </div>
          <Button variant="outline" asChild><Link href={"/imprimir/remision/" + remision.id}>Abrir orden</Link></Button>
        </div>
        <ul className="space-y-2 text-sm">
          {remision.examenes.map((e) => <li key={e.id}>
            {e.recibido_en ? <span>{e.nombre} · Recibido el {fechaHora.format(new Date(e.recibido_en))}</span>
              : remision.enviada_en ? <label className="flex items-start gap-2">
                <input type="checkbox" disabled={guardando} checked={elegidos.includes(e.id)} className="mt-0.5"
                  onChange={(c) => setElegidos((lista) => c.target.checked ? [...lista, e.id] : lista.filter((id) => id !== e.id))} />
                {e.nombre}
              </label> : e.nombre}
          </li>)}
        </ul>
        {mensaje && <p role="alert" className="text-sm text-alerta-texto">{mensaje}</p>}
        {remision.enviada_en ? (recibidos < remision.examenes.length &&
          <Button disabled={guardando || !elegidos.length} onClick={() => registrar(elegidos)}>Registrar recepción</Button>) : (
          <div className="space-y-2">
            {correo?.estado === "enviando" ? <p role="status" className="text-sm">Envío por correo en curso. Actualiza la página para ver el estado.</p>
              : <>
                {correo?.estado === "por_confirmar" && <p role="status" className="text-sm">Comprueba la entrega con el prestador antes de registrarla.</p>}
                {correo?.estado === null && (
                  destinoConfirmado ? <div className="space-y-2 rounded-md border p-3 text-sm">
                    <p className="break-all">Se enviará el PDF de esta orden a <strong>{destinoConfirmado}</strong>.</p>
                    <div className="flex flex-wrap gap-2">
                      <Button disabled={guardando} onClick={enviar}>Confirmar y enviar</Button>
                      <Button variant="outline" disabled={guardando} onClick={() => confirmar(null)}>Cancelar</Button>
                    </div>
                  </div> : <Button disabled={guardando} onClick={() => confirmar(correo.destino)}>Enviar orden por correo</Button>
                )}
                {(!destinoConfirmado || correo?.estado !== null) && <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">Si ya compartiste la orden, registra el envío.</p>
                  <Button variant="outline" disabled={guardando} onClick={() => registrar(null)}>Registrar envío realizado</Button>
                </div>}
              </>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
