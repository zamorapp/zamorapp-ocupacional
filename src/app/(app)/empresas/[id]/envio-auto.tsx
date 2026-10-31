"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { AlertTriangle, Loader2, Mail, MailCheck } from "lucide-react";
import type { EnvioAuto } from "@/lib/envio-auto";
import { guardarEnvioAuto } from "./acciones";

const HORAS = Array.from({ length: 16 }, (_, i) => i + 6); // 6:00 a. m. a 9:00 p. m.
const horaVE = (h: number) => `${h % 12 || 12}:00 ${h < 12 ? "a. m." : "p. m."}`;
const fechaHora = (iso: string) =>
  new Intl.DateTimeFormat("es-VE", { day: "2-digit", month: "2-digit", hour: "numeric", minute: "2-digit", timeZone: "America/Caracas" }).format(new Date(iso));

// Constancias automáticas a RR. HH. (Cesar, 31-oct). El estado se ve de un vistazo (verde = activo) y un toque lo cambia.
// Siempre dice a quién le llega y qué NO sale solo (informes, reposos, referencias).
const ESCRITORIO = process.env.NEXT_PUBLIC_ESCRITORIO === "1";
const WEB = "https://zamorapp-ocupacional.vercel.app";

export function EnvioAutoConstancias({ empresaId, inicial, correos, editable, anotaClave }: { empresaId: string; inicial: EnvioAuto | null; correos: string[]; editable: boolean; anotaClave: boolean }) {
  const [ocupado, iniciar] = useTransition();
  const [activo, setActivo] = useState(inicial?.activo ?? false);
  const [hora, setHora] = useState(inicial?.hora ?? 17);
  const [mensaje, setMensaje] = useState<{ ok: boolean; texto: string } | null>(null);

  if (!inicial) {
    return <p className="text-sm text-muted-foreground">Requiere internet: este ajuste vive en la nube. Conéctate para verlo o cambiarlo.</p>;
  }

  const guardar = (nuevoActivo: boolean, nuevaHora: number) => iniciar(async () => {
    setMensaje(null);
    const r = await guardarEnvioAuto(empresaId, nuevoActivo, nuevaHora);
    setMensaje({ ok: r.ok, texto: r.mensaje });
    if (r.ok) { setActivo(nuevoActivo); setHora(nuevaHora); }
  });

  // Activo pero sin a quién mandarlo o sin el correo activado: no se ve verde, porque no saldrá nada
  const trabado = activo && (!correos.length || !inicial.claveLista);
  const tono = trabado ? "border-aviso/40 bg-aviso/15 text-aviso-texto" : activo ? "border-ok/30 bg-ok/10 text-ok-texto" : "border-border bg-muted text-muted-foreground";
  const textoChip = trabado ? "Activo, pero no saldrá nada" : activo ? "Envío diario activo" : "Envío diario apagado";
  const Icono = ocupado ? Loader2 : activo ? MailCheck : Mail;
  return (
    <div className="space-y-3 text-sm">
      <ul className="space-y-1 text-muted-foreground">
        <li><b className="font-medium text-foreground">Copias que pide RR. HH.:</b> se responden solas al firmar la consulta.</li>
        <li><b className="font-medium text-foreground">Envío diario:</b> manda a RR. HH. las constancias que firmes ese día.</li>
      </ul>
      <div className="flex flex-wrap items-center gap-2">
        {editable ? (
          <button type="button" role="switch" aria-checked={activo} disabled={ocupado} onClick={() => guardar(!activo, hora)}
            className={`inline-flex items-center gap-2 rounded-full border py-0.5 pl-0.5 pr-2.5 text-xs font-medium transition disabled:opacity-60 ${tono}`}>
            <span aria-hidden className={`relative h-4 w-7 rounded-full transition-colors ${trabado ? "bg-aviso/70" : activo ? "bg-ok" : "bg-muted-foreground/40"}`}>
              <span className={`absolute top-0.5 size-3 rounded-full bg-white shadow transition-all ${activo ? "left-3.5" : "left-0.5"}`} />
            </span>
            <Icono className={`size-3.5 ${ocupado ? "animate-spin" : ""}`} aria-hidden />
            {textoChip}
          </button>
        ) : (
          <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium ${tono}`}>
            <Icono className="size-3.5" aria-hidden /> {textoChip}
          </span>
        )}
        {activo && (
          <label className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            Se envía a las
            <select value={hora} disabled={!editable || ocupado} onChange={(e) => guardar(true, Number(e.target.value))}
              className="h-7 rounded-md border bg-background px-1.5 text-xs text-foreground" aria-label="Hora del correo diario">
              {HORAS.map((h) => <option key={h} value={h}>{horaVE(h)}</option>)}
            </select>
          </label>
        )}
      </div>

      {activo && (
        correos.length ? (
          <p className="text-xs text-muted-foreground">Le llega a: {correos.join(", ")}. <Link href={`/envios?empresa=${empresaId}`} className="underline underline-offset-2">Cambiar contactos</Link></p>
        ) : (
          <p className="flex items-start gap-1.5 text-xs text-aviso-texto"><AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            <span>Esta empresa no tiene contactos con correo: no saldrá nada. <Link href={`/envios?empresa=${empresaId}`} className="underline underline-offset-2">Agregar contacto</Link></span>
          </p>
        )
      )}
      {activo && !inicial.claveLista && (
        <div className="flex items-start gap-1.5 text-xs text-aviso-texto"><AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          <span className="space-y-1.5">
            {ESCRITORIO || !anotaClave ? (
              <span className="block">
                {anotaClave ? "Falta que actives el correo" : "Falta que el administrador active el correo"}: abre{" "}
                <a href={`${WEB}/empresas/${empresaId}`} target="_blank" rel="noopener" className="underline underline-offset-2">zamorApp en la web</a>{" "}
                y toca «Activar correo».
              </span>
            ) : (
              <>
                <span className="block">Falta que actives el correo para que pueda salir.</span>
                <button type="button" disabled={ocupado} onClick={() => guardar(true, hora)}
                  className="inline-flex items-center gap-1 rounded-md border border-aviso/40 bg-background px-2 py-1 font-medium text-foreground disabled:opacity-60">
                  <MailCheck className="size-3.5" aria-hidden /> Activar correo
                </button>
              </>
            )}
          </span>
        </div>
      )}
      <p className="text-xs text-muted-foreground">Informes, reposos y referencias (llevan diagnóstico) nunca salen solos: los envías tú.</p>
      {mensaje && <p role="status" className={`text-xs ${mensaje.ok ? "text-ok-texto" : "text-alerta-texto"}`}>{mensaje.texto}</p>}

      {inicial.enviadas.length > 0 && (
        <details className="text-xs">
          <summary className="cursor-pointer text-muted-foreground">Enviadas automáticamente (últimas {inicial.enviadas.length})</summary>
          <ul className="mt-1.5 space-y-1">
            {inicial.enviadas.map((e) => (
              <li key={e.consultaId} className="flex flex-wrap justify-between gap-x-2">
                <span>{e.trabajador}</span>
                <span className="text-muted-foreground" title={e.enviadaA.join(", ")}>{fechaHora(e.enviadaEn)}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
