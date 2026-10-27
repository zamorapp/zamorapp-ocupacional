"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { AlertTriangle, ExternalLink, FileWarning, Loader2, Megaphone, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Diagnostico, Origen } from "@/lib/consultas-tipos";
import { coincidencias, diasInformeNt02, type Regla } from "@/lib/declaracion";
import { declaracionesDeConsulta, declararDesdeConsulta, type DeclaracionConsulta } from "../../accidentes/acciones";

// Avisos de declaración obligatoria bajo los diagnósticos. Nunca bloquean: cada aviso se puede ignorar.
// Enfermedad de origen ocupacional → declaración ante el INPSASEL en 24 h (LOPCYMAT art. 73) con un clic.
// Código del Anexo 1 marcado como común → sugiere revisar el origen. Lista del MPPS → recordatorio de notificación.
export function AvisoDeclaracion({ consultaId, diagnosticos, reglas, onOrigen }: {
  consultaId: string;
  diagnosticos: Diagnostico[];
  reglas: Regla[];
  onOrigen: (i: number, origen: Origen) => void;
}) {
  const [ignorados, setIgnorados] = useState<string[]>([]);
  const [declaraciones, setDeclaraciones] = useState<DeclaracionConsulta[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();

  useEffect(() => {
    declaracionesDeConsulta(consultaId).then(setDeclaraciones).catch(() => {});
  }, [consultaId]);

  const avisos = diagnosticos.flatMap((d, i) => {
    if (!d.descripcion.trim()) return [];
    const c = d.cie10 ? coincidencias(d.cie10, reglas) : [];
    const anexo = c.find((x) => x.lista === "ocupacional");
    const epi = c.find((x) => x.lista === "epidemiologica");
    const clave = `${d.cie10 || d.descripcion}`;
    const salida: { clave: string; tipo: "declarar" | "revisar" | "epi"; i: number; d: Diagnostico; texto: string }[] = [];
    if (d.origen === "ocupacional")
      salida.push({
        clave: `o:${clave}`, tipo: "declarar", i, d,
        texto: anexo
          ? `Está en el Anexo 1 de la NT-02 (${anexo.grupo ?? anexo.nombre}). Declaración ante el INPSASEL en 24 h e informe de investigación en ${diasInformeNt02(true)} días.`
          : `No está en el Anexo 1 de la NT-02. Declaración ante el INPSASEL en 24 h e informe de investigación en ${diasInformeNt02(false)} días.`,
      });
    else if (anexo && d.origen === "comun")
      salida.push({ clave: `r:${clave}`, tipo: "revisar", i, d, texto: `Está en la lista de enfermedades ocupacionales (NT-02, Anexo 1: ${anexo.grupo ?? anexo.nombre}). Si sospechas origen laboral, márcalo como ocupacional.` });
    if (epi) salida.push({ clave: `e:${clave}`, tipo: "epi", i, d, texto: `Notificación epidemiológica obligatoria al MPPS (${epi.grupo?.toLowerCase() ?? "según la lista"}): ${epi.nombre}.` });
    return salida.filter((a) => !ignorados.includes(a.clave));
  });
  if (!avisos.length) return null;

  const declarar = (d: Diagnostico) =>
    iniciar(async () => {
      setError(null);
      const r = await declararDesdeConsulta(consultaId, d.cie10, d.descripcion, d.cie10 ? coincidencias(d.cie10, reglas).some((x) => x.lista === "ocupacional") : false);
      if (!r.ok) return setError(r.mensaje);
      setDeclaraciones(await declaracionesDeConsulta(consultaId));
    });

  return (
    <div className="space-y-2">
      {avisos.map((a) => {
        const hecha = a.tipo === "declarar" ? declaraciones.find((x) => (x.cie10 ?? "") === (a.d.cie10 || "")) : undefined;
        const Icono = a.tipo === "epi" ? Megaphone : a.tipo === "revisar" ? FileWarning : AlertTriangle;
        return (
          <div key={a.clave} className={a.tipo === "declarar" ? "rounded-md bg-alerta/10 px-3 py-2 text-sm text-alerta-texto" : "rounded-md bg-aviso/10 px-3 py-2 text-sm"}>
            <div className="flex items-start gap-2">
              <Icono className="mt-0.5 size-4 shrink-0" />
              <div className="min-w-0 flex-1 space-y-1.5">
                <p>
                  <span className="font-medium">{a.d.cie10 ? `${a.d.cie10} ${a.d.descripcion}` : a.d.descripcion}. </span>
                  {a.texto}
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  {a.tipo === "declarar" && (hecha ? (
                    <Link href={`/accidentes/${hecha.id}`} target="_blank" className="inline-flex items-center gap-1 font-medium underline underline-offset-2">
                      Declaración Nº {hecha.numero} {hecha.fechaDeclaracion ? "· declarada" : "· por declarar"} <ExternalLink className="size-3.5" />
                    </Link>
                  ) : (
                    <Button type="button" size="sm" onClick={() => declarar(a.d)} disabled={pendiente}>
                      {pendiente && <Loader2 className="animate-spin" />} Iniciar declaración
                    </Button>
                  ))}
                  {a.tipo === "revisar" && (
                    <Button type="button" size="sm" variant="outline" onClick={() => onOrigen(a.i, "ocupacional")}>Marcar como ocupacional</Button>
                  )}
                  <Button type="button" size="sm" variant="ghost" onClick={() => setIgnorados((x) => [...x, a.clave])}><X /> Ignorar</Button>
                </div>
              </div>
            </div>
          </div>
        );
      })}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
