"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Archive, CalendarPlus, Loader2, MessageCircle, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { abrirEnVentana } from "@/lib/escritorio";
import { enlaceWhatsApp } from "@/lib/mensajes";
import { NOMBRE_MEDIO, type Seguimiento } from "@/lib/telemedicina-tipos";
import { abrirControl, archivarSala, extenderSala } from "../telemedicina-acciones";

const fechaCorta = (iso: string) => iso.split("-").reverse().join("/");
const dias = (desde: string, hasta: string) => Math.round((Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`)) / 86_400_000);

// Sala de espera de telemedicina: consultas a distancia que esperan que el paciente vuelva (con sus paraclínicos).
// «hoy» viene del servidor (Caracas), nunca del reloj de Windows.
export function SalaEspera({ lista, hoy, servicio, max }: { lista: Seguimiento[]; hoy: string; servicio: string; max?: number }) {
  const [items, setItems] = useState(lista);
  const visibles = max ? items.slice(0, max) : items;
  if (!items.length) return <p className="px-1 py-6 text-center text-sm text-muted-foreground">Nadie espera. Las consultas a distancia que dejes en la sala aparecen aquí.</p>;
  return (
    <ul className="divide-y">
      {visibles.map((s) => (
        <Fila key={s.alertaId} s={s} hoy={hoy} servicio={servicio}
          onCambio={(n) => setItems((x) => (n ? x.map((y) => (y.alertaId === n.alertaId ? n : y)) : x.filter((y) => y.alertaId !== s.alertaId)))} />
      ))}
    </ul>
  );
}

function Fila({ s, hoy, servicio, onCambio }: { s: Seguimiento; hoy: string; servicio: string; onCambio: (n: Seguimiento | null) => void }) {
  const [ocupado, iniciar] = useTransition();
  const [accion, setAccion] = useState("");
  const [error, setError] = useState("");
  const quedan = s.revisarAntes ? dias(hoy, s.revisarAntes) : null;
  const correr = (nombre: string, f: () => Promise<void>) => { setAccion(nombre); setError(""); iniciar(f); };
  const recordatorio = `Hola ${s.paciente.split(" ")[0]}. Le escribimos de ${servicio} por su consulta a distancia del ${fechaCorta(s.fecha)}.${s.pedidos.length ? ` Cuando tenga los resultados de ${s.pedidos.join(", ")}, ` : " "}avísenos para darle su cita de control.`;
  return (
    <li className="grid grid-cols-1 gap-2 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
      <div className="min-w-0">
        <p className="flex flex-wrap items-center gap-2 font-medium">
          <Link href={`/pacientes/${s.trabajadorId}`} className="hover:underline">{s.paciente}</Link>
          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">{NOMBRE_MEDIO[s.medio]}</span>
          {quedan != null && quedan <= 1 && <span className="rounded-full bg-aviso/15 px-2 py-0.5 text-xs font-medium text-aviso-texto">{quedan < 0 ? "Venció" : quedan === 0 ? "Vence hoy" : "Vence mañana"}</span>}
        </p>
        <p className="text-sm text-muted-foreground">
          Consulta del <span className="tabular-nums">{fechaCorta(s.fecha)}</span>
          {s.empresa && <> · {s.empresa}</>}
          {s.pedidos.length > 0 ? <> · esperando {s.pedidos.join(", ")}</> : <> · esperando que vuelva</>}
          {quedan != null && quedan > 1 && <> · quedan <span className="tabular-nums">{quedan}</span> días</>}
        </p>
        {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" className="max-sm:h-11" disabled={ocupado} onClick={() => correr("control", async () => { const r = await abrirControl(s.consultaId); if (r && !r.ok) setError(r.mensaje); })}>
          {ocupado && accion === "control" ? <Loader2 className="animate-spin" /> : <Phone />} Abrir control
        </Button>
        <Button size="sm" className="max-sm:h-11" variant="outline" onClick={() => abrirEnVentana(enlaceWhatsApp(s.telefono, recordatorio))}><MessageCircle /> Recordarle</Button>
        <Button size="sm" className="max-sm:h-11" variant="outline" disabled={ocupado} onClick={() => correr("mas", async () => {
          const r = await extenderSala(s.alertaId, 15);
          if (!r.ok || !r.revisarAntes) return setError(r.mensaje);
          onCambio({ ...s, revisarAntes: r.revisarAntes });
        })}>
          {ocupado && accion === "mas" ? <Loader2 className="animate-spin" /> : <CalendarPlus />} 15 días más
        </Button>
        <Button size="sm" variant="ghost" disabled={ocupado} className="text-muted-foreground max-sm:h-11" onClick={() => correr("archivar", async () => {
          const r = await archivarSala(s.alertaId);
          if (!r.ok) return setError(r.mensaje);
          onCambio(null);
        })}>
          {ocupado && accion === "archivar" ? <Loader2 className="animate-spin" /> : <Archive />} Archivar
        </Button>
      </div>
    </li>
  );
}

// Tarjeta del Inicio: se oculta si nadie espera; muestra 3 y «Ver todo» lleva a /atencion/a-distancia
export function TarjetaSalaDistancia({ lista, hoy, servicio }: { lista: Seguimiento[]; hoy: string; servicio: string }) {
  if (lista.length === 0) return null;
  return (
    <Card className="gap-0 py-0">
      <CardHeader className="flex flex-row items-center gap-2 border-b px-5 py-3">
        <Phone className="size-5 text-primary" aria-hidden />
        <CardTitle className="text-base">Sala de espera a distancia</CardTitle>
        <span className="rounded-full bg-muted px-2 py-0.5 text-xs tabular-nums text-muted-foreground">{lista.length}</span>
        <Button variant="ghost" size="sm" className="-my-1 ml-auto max-sm:h-11" asChild><Link href="/atencion/a-distancia">Ver todo</Link></Button>
      </CardHeader>
      <div className="px-5"><SalaEspera lista={lista} hoy={hoy} servicio={servicio} max={3} /></div>
    </Card>
  );
}
