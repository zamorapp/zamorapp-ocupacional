"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { Ban, CalendarPlus, Check, Eye, FileDown, FileText, Loader2, MessageCircle, Search, Trash2, UserRound, X } from "lucide-react";
import { confirmar } from "@/components/app/confirmar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { sumarDias } from "@/lib/fecha";
import { cn } from "@/lib/utils";
import { estadoEnlace, type SolicitudPaciente } from "@/lib/solicitudes-paciente";
import { alargarEnlacePaciente, anularEnlacePaciente, eliminarEnlacePaciente } from "../paciente-enlace-acciones";

// Historial de enlaces al paciente (Cesar, 12-nov-2026): todo lo enviado entre Desde y Hasta, con alargar, caducar
// y eliminar. «Caducar» = anular: el enlace deja de servir al instante (lo ya recibido se queda en su ficha).

const ZONA = "America/Caracas";
const dia = (iso: string) => new Intl.DateTimeFormat("es-VE", { timeZone: ZONA, day: "2-digit", month: "2-digit", year: "2-digit" }).format(new Date(iso));
const momento = (iso: string) => new Intl.DateTimeFormat("es-VE", { timeZone: ZONA, day: "2-digit", month: "2-digit", hour: "numeric", minute: "2-digit", hour12: true }).format(new Date(iso));
const telefonoVisible = (t: string) => (t.startsWith("58") && t.length === 12 ? `0${t.slice(2, 5)}-${t.slice(5)}` : `+${t}`);
const sinTildes = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

type Estado = "esperando" | "por revisar" | "aceptada" | "descartada" | "vencido" | "anulado";
const ESTADOS: { clave: Estado; nombre: string; color: string }[] = [
  { clave: "esperando", nombre: "Esperando", color: "bg-primary/10 text-primary" },
  { clave: "por revisar", nombre: "Por revisar", color: "bg-aviso/20 text-aviso-texto" },
  { clave: "aceptada", nombre: "Aceptado", color: "bg-ok/15 text-ok-texto" },
  { clave: "vencido", nombre: "Vencido", color: "bg-muted text-muted-foreground" },
  { clave: "anulado", nombre: "Caducado", color: "bg-alerta/10 text-alerta-texto" },
  { clave: "descartada", nombre: "Descartado", color: "bg-muted text-muted-foreground" },
];
const DE = Object.fromEntries(ESTADOS.map((e) => [e.clave, e])) as Record<Estado, (typeof ESTADOS)[number]>;
const DIAS_ALARGAR = [3, 7, 15, 30] as const;

export function HistorialEnlaces({ enlaces, desde, hasta, hoy, ahora, mas, sinProrroga }: {
  enlaces: SolicitudPaciente[]; desde: string; hasta: string; hoy: string; ahora: number; mas: boolean; sinProrroga?: boolean;
}) {
  const router = useRouter();
  const [cargando, navegar] = useTransition();
  const [ocupado, iniciar] = useTransition();
  const [d, setD] = useState(desde);
  const [h, setH] = useState(hasta);
  const [filtro, setFiltro] = useState<Estado | "todos">("todos");
  const [q, setQ] = useState("");
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);
  const [borrados, setBorrados] = useState<string[]>([]);

  const ir = (a: string, b: string) => navegar(() => router.push(`/atencion/enlaces?desde=${a}&hasta=${b}`));
  const rapido = (dias: number) => {
    const a = sumarDias(hoy, -dias);
    setD(a); setH(hoy); ir(a, hoy);
  };

  const conEstado = useMemo(() => enlaces.filter((e) => !borrados.includes(e.id)).map((e) => ({ e, estado: estadoEnlace(e, ahora) as Estado })), [enlaces, borrados, ahora]);
  const cuenta = (k: Estado) => conEstado.filter((x) => x.estado === k).length;
  const buscado = sinTildes(q.trim());
  const visibles = conEstado.filter(({ e, estado }) => (filtro === "todos" || estado === filtro)
    && (!buscado || sinTildes([nombreDe(e), e.telefono ?? "", e.datos?.cedula ?? "", e.empresaSugerida ?? "", e.datos?.empresa ?? ""].join(" ")).includes(buscado)));

  const hecho = (r: { ok: boolean; mensaje?: string }, texto: string) => {
    setAviso(r.ok ? { ok: true, texto } : { ok: false, texto: r.mensaje ?? "No se pudo." });
    if (r.ok) router.refresh();
  };
  const alargar = (e: SolicitudPaciente, estado: Estado, dias: number) => iniciar(async () => {
    hecho(await alargarEnlacePaciente(e.id, dias), estado === "aceptada"
      ? `${nombreDe(e)}: ${dias} días más para enviar resultados.` : `${nombreDe(e)}: el enlace vale ${dias} días más.`);
  });
  const caducar = async (e: SolicitudPaciente, estado: Estado) => {
    const si = await confirmar({
      titulo: `¿Caducar ya el enlace de ${nombreDe(e)}?`,
      texto: estado === "aceptada"
        ? "Desde ya no podrá descargar sus documentos ni enviar resultados con ese enlace. Lo que ya está en su ficha no cambia."
        : "Desde ya no podrá llenar sus datos con ese enlace. Si lo necesita, envíele uno nuevo.",
      accion: "Caducar ya",
      peligro: true,
    });
    if (si) iniciar(async () => hecho(await anularEnlacePaciente(e.id), `El enlace de ${nombreDe(e)} quedó caducado.`));
  };
  const eliminar = async (e: SolicitudPaciente, estado: Estado) => {
    const si = await confirmar({
      titulo: `¿Eliminar el enlace de ${nombreDe(e)}?`,
      texto: (estado === "esperando" ? "El enlace deja de servir y se borra. " : "Se borra del historial. ")
        + (estado === "aceptada" ? "Su ficha, su cita y los resultados que subió se quedan en su historia. " : "")
        + "No se puede deshacer.",
      accion: "Eliminar",
      peligro: true,
    });
    if (si) iniciar(async () => {
      const r = await eliminarEnlacePaciente(e.id);
      if (r.ok) setBorrados((v) => [...v, e.id]);
      hecho(r, `Se eliminó el enlace de ${nombreDe(e)}.`);
    });
  };

  return (
    <div className="space-y-4">
      {/* Filtros: Desde/Hasta (día de envío), atajos y estado */}
      <form className="flex flex-wrap items-end gap-2 rounded-xl border bg-card p-3" onSubmit={(ev) => { ev.preventDefault(); ir(d, h); }}>
        <label className="flex flex-col gap-0.5 text-xs text-muted-foreground">Desde
          <Input type="date" value={d} max={h || hoy} onChange={(ev) => setD(ev.target.value)} className="h-9 w-40" />
        </label>
        <label className="flex flex-col gap-0.5 text-xs text-muted-foreground">Hasta
          <Input type="date" value={h} min={d} max={hoy} onChange={(ev) => setH(ev.target.value)} className="h-9 w-40" />
        </label>
        <Button type="submit" size="sm" className="h-9" disabled={cargando || !d || !h || d > h}>{cargando ? <Loader2 className="animate-spin" /> : <Search />} Ver</Button>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Atajos de fecha">
          {([[0, "Hoy"], [7, "7 días"], [30, "30 días"], [90, "90 días"]] as const).map(([n, t]) => (
            <button key={t} type="button" onClick={() => rapido(n)} disabled={cargando}
              className={cn("h-9 rounded-full border px-3 text-xs hover:border-primary", desde === sumarDias(hoy, -n) && hasta === hoy && "border-primary bg-primary/10 font-medium")}>{t}</button>
          ))}
        </div>
        <div className="relative ml-auto w-full sm:w-56">
          <Search className="pointer-events-none absolute top-2.5 left-2.5 size-4 text-muted-foreground" />
          <Input value={q} onChange={(ev) => setQ(ev.target.value)} placeholder="Nombre, cédula o celular" aria-label="Buscar en el historial" className="h-9 pl-8" />
        </div>
      </form>

      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Estado del enlace">
        {[{ clave: "todos" as const, nombre: "Todos", n: conEstado.length }, ...ESTADOS.map((e) => ({ clave: e.clave, nombre: e.nombre, n: cuenta(e.clave) }))].map((x) => (
          <button key={x.clave} type="button" role="radio" aria-checked={filtro === x.clave} onClick={() => setFiltro(x.clave)} disabled={x.n === 0 && x.clave !== "todos"}
            className={cn("inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-sm transition disabled:opacity-40",
              filtro === x.clave ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:border-primary")}>
            {x.nombre} <span className={cn("rounded-full px-1.5 text-xs tabular-nums", filtro === x.clave ? "bg-primary-foreground/20" : "bg-muted")}>{x.n}</span>
          </button>
        ))}
      </div>

      {aviso && (
        <p role="status" className={cn("flex items-center gap-2 rounded-lg px-3 py-2 text-sm", aviso.ok ? "bg-ok/10 text-ok-texto" : "bg-destructive/10 text-destructive")}>
          {aviso.ok ? <Check className="size-4" /> : <X className="size-4" />} <span className="flex-1">{aviso.texto}</span>
          <button type="button" onClick={() => setAviso(null)} aria-label="Ignorar" className="text-xs font-medium hover:underline">Ignorar</button>
        </p>
      )}
      {sinProrroga && <p className="rounded-lg bg-aviso/10 px-3 py-2 text-sm text-aviso-texto">Alargar todavía no funciona: falta actualizar la base de datos. Caducar y eliminar sí.</p>}
      {mas && <p className="rounded-lg bg-aviso/10 px-3 py-2 text-sm text-aviso-texto">Se muestran los 500 más recientes. Acorte las fechas para ver los demás.</p>}

      {visibles.length === 0 ? (
        <p className="rounded-xl border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
          {conEstado.length ? "Ningún enlace con ese filtro." : "No se enviaron enlaces en esas fechas."}
        </p>
      ) : (
        <ul className={cn("divide-y overflow-hidden rounded-xl border bg-card", (ocupado || cargando) && "opacity-70")} aria-busy={ocupado || cargando}>
          {visibles.map(({ e, estado }) => {
            const vigente = estado === "esperando" || (estado === "aceptada" && e.resultadosHasta && Date.parse(e.resultadosHasta) >= ahora);
            const alargable = !sinProrroga && (estado === "esperando" || estado === "vencido" || estado === "aceptada");
            return (
              <li key={e.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:gap-4">
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", DE[estado].color)}>{DE[estado].nombre}</span>
                    <b className="font-medium">{nombreDe(e)}</b>
                    {e.trabajadorId && <Link href={`/pacientes/${e.trabajadorId}`} className="inline-flex items-center gap-0.5 text-xs font-medium text-primary hover:underline"><UserRound className="size-3" /> Ficha</Link>}
                  </p>
                  <p className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                    <span>Enviado {momento(e.creado)}</span>
                    {e.telefono && <span>{telefonoVisible(e.telefono)}</span>}
                    {(e.datos?.empresa || e.empresaSugerida) && <span>{e.empresaSugerida ?? e.datos?.empresa}</span>}
                    {(e.documentos ?? 0) > 0 && <span className="inline-flex items-center gap-1"><FileText className="size-3" /> {e.documentos} documento{e.documentos === 1 ? "" : "s"}</span>}
                  </p>
                  <p className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs">
                    {estado === "esperando" && <span className="font-medium">Vence {dia(e.vence)}</span>}
                    {estado === "vencido" && <span className="text-muted-foreground">Venció {dia(e.vence)}</span>}
                    {estado === "aceptada" && e.resultadosHasta && (
                      <span className={vigente ? "font-medium" : "text-muted-foreground"}>{vigente ? "Resultados hasta" : "Resultados: venció"} {dia(e.resultadosHasta)}</span>
                    )}
                    {e.abierto && <span className="inline-flex items-center gap-1 text-muted-foreground"><Eye className="size-3" /> abierto {momento(e.abierto)}</span>}
                    {e.recibido && <span className="inline-flex items-center gap-1 text-muted-foreground"><Check className="size-3" /> {e.registrado ? "confirmó" : "llenó"} {momento(e.recibido)}</span>}
                    {e.descargo && <span className="inline-flex items-center gap-1 text-ok-texto"><FileDown className="size-3" /> descargó {momento(e.descargo)}</span>}
                    {estado === "por revisar" && <Link href="/atencion#por-revisar" className="font-medium text-primary hover:underline">Revisar ahora</Link>}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-1.5 sm:justify-end">
                  {alargable && (
                    <label className="relative inline-flex">
                      <span className="sr-only">Alargar el enlace de {nombreDe(e)}</span>
                      <select value="" disabled={ocupado} onChange={(ev) => ev.target.value && alargar(e, estado, Number(ev.target.value))}
                        title={estado === "aceptada" ? "Más días para que envíe sus resultados" : "Más días para que llene el enlace"}
                        className="h-9 appearance-none rounded-md border bg-background pr-3 pl-8 text-sm font-medium hover:border-primary">
                        <option value="">Alargar</option>
                        {DIAS_ALARGAR.map((n) => <option key={n} value={n}>+{n} días</option>)}
                      </select>
                      <CalendarPlus className="pointer-events-none absolute top-2.5 left-2.5 size-4 text-primary" />
                    </label>
                  )}
                  {(estado === "esperando" || (estado === "aceptada" && vigente)) && (
                    <Button size="sm" variant="outline" className="h-9" disabled={ocupado} onClick={() => caducar(e, estado)}
                      title={estado === "aceptada" ? "Ya no podrá descargar ni enviar resultados" : "El enlace deja de servir ya"}>
                      <Ban className="text-alerta-texto" /> Caducar
                    </Button>
                  )}
                  {e.telefono && (
                    <Button size="sm" variant="ghost" className="h-9" asChild title="Abrir el chat de WhatsApp con este paciente">
                      <a href={`https://wa.me/${e.telefono}`} target="_blank" rel="noreferrer"><MessageCircle /> <span className="sm:sr-only">Escribirle</span></a>
                    </Button>
                  )}
                  {estado !== "por revisar" && (
                    <Button size="sm" variant="ghost" className="h-9 text-muted-foreground hover:text-alerta-texto" disabled={ocupado} onClick={() => eliminar(e, estado)} aria-label={`Eliminar el enlace de ${nombreDe(e)}`} title="Borra el enlace. Su ficha y sus resultados se quedan.">
                      <Trash2 /> <span className="sm:sr-only">Eliminar</span>
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <p className="text-xs text-muted-foreground">
        Alargar: si no lo ha llenado, más días para llenarlo; si ya lo aceptó, más días para enviar resultados (nunca más de 30 días desde hoy; las descargas de documentos no se reabren).
        Los enlaces que ya terminaron se borran solos con el tiempo: el plazo se cambia en <Link href="/configuracion/limpieza" className="font-medium text-primary underline">Limpieza</Link>.
      </p>
    </div>
  );
}

function nombreDe(e: SolicitudPaciente) {
  return e.datos ? `${e.datos.nombres} ${e.datos.apellidos}` : e.nombre?.trim() || "Sin nombre";
}
