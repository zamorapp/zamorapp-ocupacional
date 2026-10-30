import type { Cita } from "@/lib/citas";
import type { Solicitud } from "@/lib/solicitudes-tipos";
import { cn } from "@/lib/utils";

type Paso = { texto: string; en: string | null };

const dia = new Intl.DateTimeFormat("es-VE", { day: "2-digit", month: "2-digit", timeZone: "America/Caracas" });
const hora = new Intl.DateTimeFormat("es-VE", { hour: "2-digit", minute: "2-digit", timeZone: "America/Caracas" });

// Recorrido con la hora de cada paso («Pedida 29/10 04:20 p. m. → Confirmada 05:05 p. m. → …»).
// Todo en <span> porque también va dentro de un botón. El día se repite solo cuando cambia; los pasos sin hora (citas anteriores a esta versión) no se muestran.
export function Pasos({ pasos, className }: { pasos: Paso[]; className?: string }) {
  const conHora = pasos.filter((p): p is { texto: string; en: string } => Boolean(p.en)).sort((a, b) => a.en.localeCompare(b.en));
  if (!conHora.length) return null;
  let anterior = "";
  return (
    <span role="list" aria-label="Recorrido" className={cn("flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] text-muted-foreground", className)}>
      {conHora.map((p, i) => {
        const d = dia.format(new Date(p.en));
        const texto = `${d === anterior ? "" : `${d} `}${hora.format(new Date(p.en))}`;
        anterior = d;
        return (
          <span role="listitem" key={p.texto} className="flex items-center gap-1.5">
            {i > 0 && <span aria-hidden>→</span>}
            <span><span className="font-medium text-foreground/80">{p.texto}</span> <span className="tabular-nums">{texto}</span></span>
          </span>
        );
      })}
    </span>
  );
}

export const pasosCita = (c: Cita): Paso[] => [
  // Una cita del portal nace «solicitada»: su alta es el pedido. Las que agenda el servicio nacen confirmadas.
  { texto: "Pedida", en: c.confirmadaEn && c.creadoEn && c.confirmadaEn.slice(0, 16) === c.creadoEn.slice(0, 16) ? null : c.creadoEn },
  { texto: "Confirmada", en: c.confirmadaEn },
  { texto: "Llegó", en: c.llegada },
  { texto: "En consulta", en: c.enConsultaEn },
  { texto: "Atendido", en: c.atendidaEn },
  { texto: c.estado === "cancelada" ? "Cancelada" : "No asistió", en: c.estado === "cancelada" || c.estado === "no_asistio" ? c.cerradaEn : null },
];

export const pasosSolicitud = (s: Solicitud): Paso[] => [
  { texto: "Recibida", en: s.creadoEn },
  { texto: "En proceso", en: s.enProcesoEn },
  { texto: s.estado === "rechazada" ? "Rechazada" : "Respondida", en: s.estado === "respondida" || s.estado === "rechazada" ? s.respondidaEn : null },
];
