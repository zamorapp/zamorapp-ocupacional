"use client";

import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ZONA } from "@/lib/fecha";
import { anotarRemision, prepararRemision } from "./acciones";

type Examen = { id: string; nombre: string };
export type Remision = {
  id: string;
  prestador: string;
  creada_en: string;
  enviada_en: string | null;
  examenes: (Examen & { recibido_en: string | null })[];
};

const fechaHora = new Intl.DateTimeFormat("es-VE", { dateStyle: "short", timeStyle: "short", timeZone: ZONA });

export function AltaRemision({ consulta, examenes }: { consulta: string; examenes: Examen[] }) {
  const [prestador, setPrestador] = useState("");
  const [elegidos, setElegidos] = useState<string[]>([]);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [guardando, iniciar] = useTransition();
  const intento = useRef<{ id: string; datos: string } | null>(null);

  function guardar() {
    const datos = JSON.stringify([prestador.trim(), elegidos]);
    const id = intento.current?.datos === datos ? intento.current.id : crypto.randomUUID();
    intento.current = { id, datos };
    iniciar(async () => {
      setMensaje(null);
      const error = await prepararRemision(id, consulta, prestador, elegidos)
        .catch(() => "No se pudo guardar. Revisa la conexión y vuelve a intentar.");
      if (error) return setMensaje(error);
      intento.current = null;
      setPrestador("");
      setElegidos([]);
    });
  }

  return (
    <Card>
      <CardContent>
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); guardar(); }}>
          <label className="block space-y-1.5 text-sm font-medium">
            Prestador
            <Input value={prestador} onChange={(e) => setPrestador(e.target.value)} maxLength={120} required disabled={guardando} />
          </label>
          <fieldset className="space-y-2" disabled={guardando}>
            <legend className="mb-2 text-sm font-medium">Exámenes que se van a remitir</legend>
            {examenes.map((e) => <label key={e.id} className="flex items-start gap-2 text-sm">
              <input type="checkbox" checked={elegidos.includes(e.id)} className="mt-0.5"
                onChange={(c) => setElegidos((lista) => c.target.checked ? [...lista, e.id] : lista.filter((id) => id !== e.id))} />
              {e.nombre}
            </label>)}
          </fieldset>
          {mensaje && <p role="alert" className="text-sm text-alerta-texto">{mensaje}</p>}
          <Button disabled={guardando || !prestador.trim() || !elegidos.length}>Preparar orden</Button>
        </form>
      </CardContent>
    </Card>
  );
}

export function MovimientosRemision({ consulta, remision }: { consulta: string; remision: Remision }) {
  const [elegidos, setElegidos] = useState<string[]>([]);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [guardando, iniciar] = useTransition();
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

  return (
    <Card>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="break-words font-semibold">{remision.prestador}</h2>
            <p className="text-sm text-muted-foreground">{estado} · {recibidos} de {remision.examenes.length} recibidos</p>
            {remision.enviada_en && <p className="text-xs text-muted-foreground">Enviada el {fechaHora.format(new Date(remision.enviada_en))}</p>}
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
            <p className="text-sm text-muted-foreground">Comparte la orden con el prestador y registra el envío cuando lo hayas hecho.</p>
            <Button disabled={guardando} onClick={() => registrar(null)}>Registrar envío realizado</Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
