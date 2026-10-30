"use client";

import { ArrowLeft, ChevronRight, ClipboardPlus, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { antiguedad } from "@/lib/fecha";
import { consultasDe, paciente, repososDe } from "@/lib/movil/datos";
import type { Motor } from "@/lib/movil/motor";
import { cn } from "@/lib/utils";
import type { Vista } from "./trabajo";

const s = (v: unknown) => (v == null ? "" : String(v));
const ESTADO: Record<string, { t: string; c: string }> = {
  borrador: { t: "Borrador", c: "bg-aviso/15 text-aviso-texto" },
  cerrada: { t: "Lista para firmar", c: "bg-info/15 text-info-texto" },
  firmada: { t: "Firmada", c: "bg-ok/15 text-ok-texto" },
};

export function Ficha({ motor, id, ir, volver }: { motor: Motor; id: string; ir: (v: Vista) => void; volver: () => void }) {
  const p = paciente(motor, id);
  if (!p) return <p className="text-sm text-muted-foreground">Paciente no encontrado en el teléfono.</p>;
  const t = p.fila;
  const consultas = consultasDe(motor, id);
  const reposos = repososDe(motor, id).slice(0, 5);
  const pendiente = (tabla: string, fila: string) => [...motor.bandeja.values()].some((c) => c.estado === "pendiente" && c.tabla === tabla && c.fila_id === fila);
  const puesto = s(motor.tabla("public.puestos").get(s(t.puesto_id))?.nombre);
  const edad = antiguedad(s(t.fecha_nacimiento) || null);

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2">
        <Button size="icon" variant="ghost" onClick={volver} aria-label="Volver"><ArrowLeft /></Button>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-semibold leading-tight">{p.nombres} {p.apellidos}</h2>
          <p className="text-sm text-muted-foreground">{p.cedula}{p.numero ? ` · Historia ${p.numero}` : ""}{edad ? ` · ${edad.split(" y ")[0]}` : ""}</p>
          <p className="text-sm text-muted-foreground">{p.empresa}{puesto ? ` · ${puesto}` : ""}</p>
        </div>
      </div>
      {t.telefono ? (
        <a href={`tel:${s(t.telefono)}`} className="flex items-center gap-2 text-sm text-primary"><Phone className="size-4" /> {s(t.telefono)}</a>
      ) : null}
      {pendiente("public.trabajadores", id) && <p className="rounded-lg bg-aviso/15 px-3 py-2 text-xs text-aviso-texto">Registrado en este teléfono: sube al haber señal.</p>}

      <Button className="h-12 w-full text-base" onClick={() => ir({ v: "consulta", trabajadorId: id })}><ClipboardPlus /> Nueva consulta</Button>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold">Consultas ({consultas.length})</h3>
        {consultas.length ? (
          <ul className="divide-y rounded-xl border bg-card">
            {consultas.slice(0, 40).map(({ fila: c, diagnosticos, motivo }) => {
              const e = ESTADO[s(c.estado)] ?? ESTADO.borrador;
              return (
                <li key={s(c.id)}>
                  <button type="button" onClick={() => ir({ v: "consulta", trabajadorId: id, consultaId: s(c.id) })} className="flex w-full items-center gap-3 px-4 py-3 text-left active:bg-muted">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 text-sm">
                        <span className="font-medium">{s(c.fecha)}</span>
                        <span className={cn("rounded-full px-2 py-0.5 text-[11px]", e.c)}>{e.t}</span>
                        {pendiente("clinico.consultas", s(c.id)) && <span className="text-[11px] text-aviso-texto">por subir</span>}
                      </div>
                      <div className="truncate text-xs text-muted-foreground">{motivo || s(c.motivo_texto) || "Sin motivo"}</div>
                      {diagnosticos.length > 0 && (
                        <div className="truncate text-xs">{diagnosticos.map((d) => `${s(d.cie10)} ${s(d.descripcion)}`).join(" · ")}</div>
                      )}
                    </div>
                    <ChevronRight className="size-4 text-muted-foreground" />
                  </button>
                </li>
              );
            })}
          </ul>
        ) : <p className="text-sm text-muted-foreground">Sin consultas todavía.</p>}
      </section>

      {reposos.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-sm font-semibold">Últimos reposos</h3>
          <ul className="divide-y rounded-xl border bg-card text-sm">
            {reposos.map((r) => (
              <li key={s(r.id)} className="flex justify-between gap-2 px-4 py-2.5">
                <span>{s(r.desde)} → {s(r.hasta)}</span>
                <span className="text-muted-foreground">{s(r.causa).replace(/_/g, " ")}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
