"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ChevronRight, CloudOff, ExternalLink, Lock, RefreshCw, Search, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { buscarPacientes } from "@/lib/movil/datos";
import type { Motor } from "@/lib/movil/motor";
import type { Abierta } from "@/lib/movil/sesion";
import { cn } from "@/lib/utils";
import { Ficha } from "./ficha";
import { FormConsulta } from "./consulta";
import { PacienteNuevo } from "./paciente-nuevo";
import { Pendientes } from "./pendientes";
import { useMotor } from "./usar-motor";

export type Vista =
  | { v: "inicio" }
  | { v: "ficha"; id: string }
  | { v: "consulta"; trabajadorId: string; consultaId?: string }
  | { v: "nuevo" }
  | { v: "pendientes" };

function useEnLinea() {
  const [en, setEn] = useState(true);
  useEffect(() => {
    const f = () => setEn(navigator.onLine);
    f();
    addEventListener("online", f); addEventListener("offline", f);
    return () => { removeEventListener("online", f); removeEventListener("offline", f); };
  }, []);
  return en;
}

const haceCuanto = (ms: number | null, ahora: number) => {
  if (ms == null) return "nunca";
  const min = Math.round((ahora - ms) / 60_000);
  if (min < 1) return "hace segundos";
  if (min < 60) return `hace ${min} min`;
  if (min < 48 * 60) return `hace ${Math.round(min / 60)} h`;
  return `hace ${Math.round(min / 1440)} días`;
};

export function Trabajo({ a, alBloquear }: { a: Abierta; alBloquear: () => void }) {
  const { motor } = a;
  const e = useMotor(motor);
  const enLinea = useEnLinea();
  const [pila, setPila] = useState<Vista[]>([{ v: "inicio" }]);
  const vista = pila[pila.length - 1];
  const ir = (x: Vista) => setPila((p) => [...p, x]);
  const volver = () => setPila((p) => (p.length > 1 ? p.slice(0, -1) : p));

  // Sincroniza al volver la señal y cada minuto mientras haya señal
  useEffect(() => {
    if (!enLinea) return;
    motor.sincronizar().catch(() => {});
    const t = setInterval(() => motor.sincronizar().catch(() => {}), 60_000);
    return () => clearInterval(t);
  }, [enLinea, motor]);

  // El botón «atrás» del teléfono vuelve a la pantalla anterior en vez de salir
  useEffect(() => {
    const atras = () => { if (pila.length > 1) volver(); };
    if (pila.length > 1) history.pushState(null, "");
    addEventListener("popstate", atras);
    return () => removeEventListener("popstate", atras);
  }, [pila.length]);

  const sinRevisar = e.conflictos + e.rechazados;

  return (
    <div className="min-h-dvh bg-background pb-10">
      <header className="sticky top-0 z-10 border-b bg-background/95 px-4 pb-3 pt-3 backdrop-blur">
        <div className="flex items-center gap-2">
          <h1 className="flex-1 truncate text-base font-semibold">zamorApp <span className="font-normal text-muted-foreground">· celular</span></h1>
          <Button size="icon" variant="ghost" aria-label="Bloquear" onClick={alBloquear}><Lock /></Button>
        </div>
        <button type="button" onClick={() => ir({ v: "pendientes" })}
          className={cn("mt-2 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs",
            sinRevisar ? "bg-destructive/10 text-destructive" : enLinea ? "bg-ok/10 text-ok-texto" : "bg-aviso/15 text-aviso-texto")}>
          {e.sincronizando ? <RefreshCw className="size-4 shrink-0 animate-spin" /> : !enLinea ? <CloudOff className="size-4 shrink-0" /> : sinRevisar ? <AlertTriangle className="size-4 shrink-0" /> : <RefreshCw className="size-4 shrink-0" />}
          <span className="flex-1">
            {e.progreso ?? (
              <>
                {enLinea ? "Con señal" : "Sin señal"} · {e.pendientes ? `${e.pendientes} por subir` : "todo subido"}
                {sinRevisar ? ` · ${sinRevisar} por revisar` : ""} · sincronizado {haceCuanto(e.ultimaSincronia, motor.reloj.ahora())}
              </>
            )}
          </span>
          <ChevronRight className="size-4 shrink-0" />
        </button>
        {e.error && <p className="mt-1.5 text-xs text-destructive">{e.error}</p>}
        {!e.horaVerificada && <p className="mt-1.5 text-xs text-muted-foreground">Hora sin verificar: se confirma con la nube al sincronizar.</p>}
      </header>

      <main className="mx-auto max-w-xl px-4 pt-4">
        {e.bloqueadoPorTiempo ? (
          <SinConexionLarga motor={motor} enLinea={enLinea} />
        ) : !e.registrado || motor.meta.cursor === null ? (
          <PrimeraCopia motor={motor} enLinea={enLinea} />
        ) : vista.v === "inicio" ? (
          <Inicio motor={motor} enLinea={enLinea} ir={ir} />
        ) : vista.v === "ficha" ? (
          <Ficha motor={motor} id={vista.id} ir={ir} volver={volver} />
        ) : vista.v === "consulta" ? (
          <FormConsulta motor={motor} trabajadorId={vista.trabajadorId} consultaId={vista.consultaId} volver={volver} />
        ) : vista.v === "nuevo" ? (
          <PacienteNuevo motor={motor} enLinea={enLinea} alCrear={(id) => setPila([{ v: "inicio" }, { v: "ficha", id }])} volver={volver} />
        ) : (
          <Pendientes motor={motor} enLinea={enLinea} volver={volver} />
        )}
      </main>
    </div>
  );
}

function Inicio({ motor, enLinea, ir }: { motor: Motor; enLinea: boolean; ir: (v: Vista) => void }) {
  const [q, setQ] = useState("");
  const lista = useMemo(() => buscarPacientes(motor, q), [motor, q]);
  const total = motor.tabla("public.trabajadores").size;
  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
        <Input autoFocus inputMode="search" value={q} onChange={(ev) => setQ(ev.target.value)}
          placeholder="Cédula o nombre del paciente" className="h-12 pl-10 text-base" />
      </div>
      {q.trim() ? (
        lista.length ? (
          <ul className="divide-y rounded-xl border bg-card">
            {lista.map((p) => (
              <li key={p.id}>
                <button type="button" onClick={() => ir({ v: "ficha", id: p.id })} className="flex w-full items-center gap-3 px-4 py-3 text-left active:bg-muted">
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{p.apellidos}, {p.nombres}</div>
                    <div className="truncate text-xs text-muted-foreground">{p.cedula}{p.empresa ? ` · ${p.empresa}` : ""}{p.numero ? ` · H. ${p.numero}` : ""}</div>
                  </div>
                  <ChevronRight className="size-4 text-muted-foreground" />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">No está en el teléfono. Si es nuevo, regístralo.</p>
        )
      ) : (
        <p className="text-center text-xs text-muted-foreground">{total.toLocaleString("es-VE")} pacientes en el teléfono</p>
      )}
      <Button variant="outline" className="h-12 w-full text-base" onClick={() => ir({ v: "nuevo" })}><UserPlus /> Paciente nuevo</Button>
      {enLinea && (
        <a href="/panel" className="flex items-center justify-center gap-1.5 text-sm text-primary underline-offset-4 hover:underline">
          Abrir la app completa (firmar, imprimir) <ExternalLink className="size-3.5" />
        </a>
      )}
    </div>
  );
}

function PrimeraCopia({ motor, enLinea }: { motor: Motor; enLinea: boolean }) {
  const e = motor.estado();
  return (
    <div className="space-y-3 rounded-xl border bg-card p-5 text-center">
      <RefreshCw className={cn("mx-auto size-8 text-primary", e.sincronizando && "animate-spin")} />
      <p className="font-medium">Copiando tus pacientes al teléfono</p>
      <p className="text-sm text-muted-foreground">{e.progreso ?? (enLinea ? "Preparando…" : "Hace falta señal para la primera copia.")}</p>
      {!e.sincronizando && <Button disabled={!enLinea} onClick={() => motor.sincronizar()}>Reintentar</Button>}
    </div>
  );
}

function SinConexionLarga({ motor, enLinea }: { motor: Motor; enLinea: boolean }) {
  return (
    <div className="space-y-3 rounded-xl border border-aviso/40 bg-aviso/10 p-5 text-center">
      <CloudOff className="mx-auto size-8 text-aviso-texto" />
      <p className="font-medium">Pasaron más de 7 días sin sincronizar</p>
      <p className="text-sm text-muted-foreground">Por seguridad, conéctate a internet para seguir viendo los datos. Lo que guardaste está a salvo y subirá al conectarte.</p>
      <Button disabled={!enLinea || motor.sincronizando} onClick={() => motor.sincronizar()}><RefreshCw /> Sincronizar ahora</Button>
    </div>
  );
}
