"use client";

import { useState, useTransition } from "react";
import { BellRing, CheckCircle2, Loader2, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { desactualizada, type NotificacionRiesgo } from "@/lib/notificacion-riesgos";
import { cn } from "@/lib/utils";
import { marcarFirmada, notificarPuesto, notificarRiesgos } from "@/app/(app)/pacientes/notificacion-acciones";
import { hoyCaracas } from "@/lib/fecha";

const fecha = (v: string) => v.slice(0, 10).split("-").reverse().join("/");
const imprimir = (ids: string[]) => window.open(`/imprimir/notificacion-riesgos?ids=${ids.join(",")}`, "_blank", "noopener");

// Ficha del trabajador: entregas de la notificación de riesgos, acuse firmado y aviso si el puesto cambió
export function NotificacionesRiesgo({ trabajadorId, puesto, iniciales, edita }: {
  trabajadorId: string;
  puesto: { id: string | null; nombre: string; evaluadoEn: string | null };
  iniciales: NotificacionRiesgo[];
  edita: boolean;
}) {
  const [lista, setLista] = useState(iniciales);
  const [aviso, setAviso] = useState<{ ok: boolean; mensaje: string } | null>(null);
  const [ocupado, iniciar] = useTransition();
  const vigente = lista.find((n) => !desactualizada(n, puesto));

  return (
    <div className="space-y-3">
      <div className={cn("flex flex-wrap items-center gap-3 rounded-lg px-3 py-2 text-sm", vigente ? (vigente.firmadaEn ? "bg-ok/10" : "bg-aviso/10") : "bg-alerta/10")}>
        <span className="min-w-0 flex-1">
          {!puesto.id ? "Sin puesto asignado: no hay riesgos que notificar."
            : vigente ? (vigente.firmadaEn ? `Notificado el ${fecha(vigente.entregadaEn)} y firmado el ${fecha(vigente.firmadaEn)}.` : `Notificado el ${fecha(vigente.entregadaEn)}: falta el acuse firmado.`)
            : lista.length ? "La evaluación del puesto cambió después de la última notificación: notifica de nuevo."
            : "Nunca se le han notificado por escrito los riesgos de su puesto."}
        </span>
        {edita && puesto.id && (
          <Button size="sm" disabled={ocupado} onClick={() => iniciar(async () => {
            const r = await notificarRiesgos([trabajadorId]);
            setAviso(r);
            if (r.ok && r.ids) {
              const hoy = hoyCaracas();
              setLista((l) => [{ id: r.ids![0], puestoId: puesto.id, puesto: puesto.nombre, entregadaEn: hoy, firmadaEn: null, contenido: l[0]?.contenido ?? { dependencia: null, turno: null, tareas: null, herramientas: null, riesgos: [], epp: null, recomendaciones: null, evaluadoEn: puesto.evaluadoEn } }, ...l]);
              imprimir(r.ids);
            }
          })}>{ocupado ? <Loader2 className="animate-spin" /> : <BellRing />} Notificar riesgos</Button>
        )}
      </div>
      {aviso && <p className={cn("text-sm", aviso.ok ? "text-ok-texto" : "text-destructive")}>{aviso.mensaje}</p>}
      {lista.length > 0 && (
        <ul className="divide-y text-sm">
          {lista.map((n) => (
            <li key={n.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
              <span className="font-medium">{fecha(n.entregadaEn)}</span>
              <span className="min-w-0 flex-1 truncate text-muted-foreground">{n.puesto}{desactualizada(n, puesto) && " · desactualizada"}</span>
              {edita ? (
                <label className="flex items-center gap-1.5 text-xs">
                  <input type="checkbox" checked={Boolean(n.firmadaEn)} disabled={ocupado || Boolean(n.firmadaEn)} title={n.firmadaEn ? "Con el acuse firmado no se cambia: si hubo un error, registra una nueva" : undefined} className="size-4 accent-[var(--primary)]"
                    onChange={(x) => iniciar(async () => {
                      const r = await marcarFirmada(n.id, x.target.checked);
                      setAviso(r);
                      if (r.ok) setLista((l) => l.map((y) => (y.id === n.id ? { ...y, firmadaEn: x.target.checked ? hoyCaracas() : null } : y)));
                    })} />
                  Acuse firmado
                </label>
              ) : n.firmadaEn && <span className="flex items-center gap-1 text-xs text-ok-texto"><CheckCircle2 className="size-3.5" /> Firmada</span>}
              <Button variant="ghost" size="sm" onClick={() => imprimir([n.id])}><Printer /> Imprimir</Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// Puesto de trabajo: notifica a todos sus trabajadores activos y abre las hojas para firmar
export function BotonNotificarPuesto({ puestoId, trabajadores }: { puestoId: string; trabajadores: number }) {
  const [ocupado, iniciar] = useTransition();
  const [aviso, setAviso] = useState<string | null>(null);
  if (!trabajadores) return null;
  return (
    <>
      <Button variant="ghost" size="sm" disabled={ocupado} title={aviso ?? "Registra y abre la notificación de riesgos de cada trabajador del puesto"}
        onClick={() => {
          if (!window.confirm(`¿Notificar los riesgos del puesto a ${trabajadores} trabajador(es)? Se registra la entrega con fecha de hoy.`)) return;
          iniciar(async () => {
            const r = await notificarPuesto(puestoId);
            setAviso(r.mensaje);
            if (r.ok && r.ids) imprimir(r.ids);
            else window.alert(r.mensaje);
          });
        }}>
        {ocupado ? <Loader2 className="animate-spin" /> : <BellRing />} Notificar
      </Button>
    </>
  );
}

// Varios trabajadores (p. ej. los pendientes del paquete de inspección)
export function BotonNotificarTrabajadores({ ids }: { ids: string[] }) {
  const [ocupado, iniciar] = useTransition();
  if (!ids.length) return null;
  return (
    <Button size="sm" disabled={ocupado}
      onClick={() => {
        if (!window.confirm(`¿Notificar los riesgos de su puesto a ${ids.length} trabajador(es)? Se registra la entrega con fecha de hoy.`)) return;
        iniciar(async () => {
          const r = await notificarRiesgos(ids);
          if (r.ok && r.ids) imprimir(r.ids);
          window.alert(r.mensaje);
        });
      }}>
      {ocupado ? <Loader2 className="animate-spin" /> : <BellRing />} Notificar a los {ids.length}
    </Button>
  );
}
