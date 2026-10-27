"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { CheckCircle2, Loader2, Mail, MessageCircle, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { plantillaInicial, type GrupoPorEnviar, type Plantilla } from "@/lib/envios-tipos";
import { ESTILO_APTITUD, ETIQUETA_APTITUD, type Aptitud } from "@/lib/pacientes";
import { cn } from "@/lib/utils";
import { enviar } from "../acciones";

const dia = (iso: string) => iso.split("-").reverse().join("/");

export function Bandeja({ grupos, plantillas }: { grupos: GrupoPorEnviar[]; plantillas: Plantilla[] }) {
  if (!grupos.length) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-xl border bg-card p-10 text-center">
        <CheckCircle2 className="size-8 text-ok-texto" />
        <p className="font-medium">Todo enviado</p>
        <p className="text-sm text-muted-foreground">Cuando firmes una consulta con constancia de aptitud, aparece aquí lista para mandar.</p>
      </div>
    );
  }
  return (
    <ul className="grid gap-4 lg:grid-cols-2">
      {grupos.map((g) => <Grupo key={`${g.empresaId}|${g.fecha}`} g={g} plantilla={plantillaInicial(plantillas.filter((p) => !p.empresaId || p.empresaId === g.empresaId), g.empresaId)} />)}
    </ul>
  );
}

function Grupo({ g, plantilla }: { g: GrupoPorEnviar; plantilla: Plantilla }) {
  const [trabajando, iniciar] = useTransition();
  const [enCurso, setEnCurso] = useState<string | null>(null);
  const [hecho, setHecho] = useState<{ nombre: string; whatsapp: string }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [telefono, setTelefono] = useState("");
  const conTelefono = g.contactos.filter((c) => c.telefono);

  // Un toque: se abre la pestaña de WhatsApp en el mismo clic (si no, el navegador la bloquea) y se le pone
  // el enlace cuando el servidor termina el PDF. Si el navegador no la abrió, queda el botón «Abrir WhatsApp».
  const mandar = (clave: string, contactoIds: string[], telefonosExtra: string[]) => {
    const ventana = window.open("", "_blank");
    setEnCurso(clave);
    setError(null);
    iniciar(async () => {
      const r = await enviar({
        empresaId: g.empresaId,
        fecha: g.fecha,
        consultaIds: g.consultas.map((c) => c.id),
        contactoIds,
        correosExtra: [],
        telefonosExtra,
        canal: "whatsapp",
        incluirConsulta: false,
        mensaje: plantilla.mensaje,
        asunto: plantilla.asunto,
        mensajeConstancias: plantilla.mensajeConstancias,
      });
      setEnCurso(null);
      const enlace = r.enlaces?.[0];
      if (!r.ok || !enlace) {
        ventana?.close();
        setError(r.mensaje);
        return;
      }
      if (ventana) ventana.location.href = enlace.whatsapp;
      setHecho((l) => [...l, ...(r.enlaces ?? [])]);
    });
  };

  return (
    <li className="flex flex-col rounded-xl border bg-card">
      <div className="flex items-start justify-between gap-3 border-b px-4 py-3">
        <div className="min-w-0">
          <p className="truncate font-semibold">{g.empresa}</p>
          <p className="text-xs text-muted-foreground">Evaluaciones del {dia(g.fecha)} · {g.consultas.length} constancia{g.consultas.length === 1 ? "" : "s"}</p>
        </div>
        <Button variant="ghost" size="sm" asChild><Link href={`/envios?empresa=${g.empresaId}&fecha=${g.fecha}`}><Mail /> Correo y más</Link></Button>
      </div>
      <ul className="max-h-40 flex-1 divide-y overflow-y-auto">
        {g.consultas.map((c) => (
          <li key={c.id} className="flex items-center justify-between gap-2 px-4 py-1.5 text-sm">
            <span className="truncate">{c.paciente}</span>
            <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium", ESTILO_APTITUD[c.aptitud as Aptitud])}>{ETIQUETA_APTITUD[c.aptitud as Aptitud] ?? c.aptitud}</span>
          </li>
        ))}
      </ul>
      <div className="space-y-2 border-t px-4 py-3">
        {hecho.length > 0 ? (
          <div className="space-y-2">
            <p className="flex items-center gap-1.5 text-sm font-medium text-ok-texto"><CheckCircle2 className="size-4" /> Enlace listo. Si WhatsApp no se abrió, tócalo aquí:</p>
            {hecho.map((h) => <Button key={h.whatsapp} size="sm" variant="outline" className="mr-2" asChild><a href={h.whatsapp} target="_blank" rel="noreferrer"><MessageCircle /> Abrir WhatsApp · {h.nombre}</a></Button>)}
          </div>
        ) : (
          <>
            {conTelefono.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {conTelefono.map((c) => (
                  <Button key={c.id} size="sm" disabled={trabajando} onClick={() => mandar(c.id, [c.id], [])}>
                    {enCurso === c.id ? <Loader2 className="animate-spin" /> : <MessageCircle />} WhatsApp · {c.nombre}
                  </Button>
                ))}
              </div>
            ) : (
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><UserPlus className="size-3.5" /> Sin contacto con teléfono. Escribe uno o agrégalo en «Correo y más» › Contactos.</p>
            )}
            <div className="flex gap-2">
              <input value={telefono} onChange={(e) => setTelefono(e.target.value)} type="tel" placeholder="Otro teléfono: 0414-1234567" aria-label="Otro teléfono" className="h-9 min-w-0 flex-1 rounded-md border bg-transparent px-3 text-sm" />
              <Button size="sm" variant="outline" disabled={trabajando || telefono.replace(/\D/g, "").length < 10} onClick={() => mandar("otro", [], [telefono])}>
                {enCurso === "otro" ? <Loader2 className="animate-spin" /> : <MessageCircle />} Enviar
              </Button>
            </div>
          </>
        )}
        {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
      </div>
    </li>
  );
}
