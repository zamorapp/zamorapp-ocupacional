"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Loader2, Plus, Printer, RotateCcw, Save, Sparkles, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { Firmantes, InformeVigilancia, Persona } from "@/lib/reportes";
import type { TextosInforme } from "@/lib/vigilancia-textos";
import { guardarInformeVigilancia } from "./acciones";

type Clave = keyof TextosInforme;

const SECCIONES: [Clave, string, string][] = [
  ["resumen", "Resumen ejecutivo", "Hallazgos clave del período en pocas líneas."],
  ["conclusiones", "Análisis y conclusiones médico-ocupacionales", "Interpretación médica de los indicadores."],
  ["recomendaciones", "Recomendaciones de seguridad y salud laboral", "Acciones para la empresa, el Comité y los trabajadores."],
  ["factores_riesgo", "Factores de riesgo, procesos peligrosos y efectos en la salud", "Se sugieren desde los puestos de la empresa."],
  ["medidas_control", "Medidas de control en la fuente, el ambiente y los trabajadores", ""],
];

const vacia: Persona = { nombre: "", cedula: "" };

// Redacción del informe: cada sección trae un borrador generado con los datos del período, editable.
export function EditorInforme({ empresaId, desde, hasta, inicial, sugeridos, firmantesBase, editable, enlaceImprimir }: {
  empresaId: string | null;
  desde: string;
  hasta: string;
  inicial: InformeVigilancia | null;
  sugeridos: TextosInforme;
  firmantesBase: Firmantes;
  editable: boolean;
  enlaceImprimir: string;
}) {
  const [textos, setTextos] = useState<TextosInforme>(() => ({
    resumen: inicial?.resumen || sugeridos.resumen,
    conclusiones: inicial?.conclusiones || sugeridos.conclusiones,
    recomendaciones: inicial?.recomendaciones || sugeridos.recomendaciones,
    factores_riesgo: inicial?.factores_riesgo || sugeridos.factores_riesgo,
    medidas_control: inicial?.medidas_control || sugeridos.medidas_control,
  }));
  const [firmantes, setFirmantes] = useState<Firmantes>(() => ({ ...firmantesBase, ...inicial?.firmantes }));
  const [aviso, setAviso] = useState<{ ok: boolean; mensaje: string } | null>(null);
  const [guardado, setGuardado] = useState(Boolean(inicial?.id));
  const [ocupado, iniciar] = useTransition();

  const cambiar = (k: Clave, v: string) => { setTextos({ ...textos, [k]: v }); setAviso(null); };
  const persona = (k: "medico" | "sst" | "empleador", c: Partial<Persona>) => setFirmantes({ ...firmantes, [k]: { ...vacia, ...firmantes[k], ...c } });
  const delegados = firmantes.delegados?.length ? firmantes.delegados : [vacia];

  const guardar = (imprimir = false) =>
    iniciar(async () => {
      const r = await guardarInformeVigilancia(empresaId, desde, hasta, { ...textos, firmantes });
      setAviso(r);
      if (r.ok) setGuardado(true);
      if (r.ok && imprimir) window.open(enlaceImprimir, "_blank");
    });

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">
        {guardado ? "Textos guardados para este período." : "Borrador sugerido con los datos del período: revísalo, edítalo y guárdalo."} Lo que guardes aquí sale en el informe impreso.
      </p>
      <p className="rounded-md bg-aviso/10 px-3 py-2 text-xs">La empresa (RR. HH., delegados) puede leer estos textos: no incluyas nombres ni diagnósticos individuales.</p>
      {SECCIONES.map(([k, titulo, ayuda]) => (
        <div key={k} className="space-y-1.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-sm font-medium">{titulo}</div>
              {ayuda && <div className="text-xs text-muted-foreground">{ayuda}</div>}
            </div>
            {editable && textos[k] !== sugeridos[k] && (
              <Button type="button" variant="ghost" size="sm" onClick={() => cambiar(k, sugeridos[k])}><RotateCcw /> Usar sugerencia</Button>
            )}
          </div>
          <Textarea value={textos[k]} disabled={!editable} onChange={(e) => cambiar(k, e.target.value)} className="min-h-28 text-sm" />
        </div>
      ))}

      <div className="space-y-2">
        <div className="text-sm font-medium">Firmantes</div>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          {([["medico", "Médico ocupacional"], ["sst", "Servicio de SST"], ["empleador", "Representante del empleador"]] as const).map(([k, t]) => (
            <div key={k} className="grid grid-cols-[minmax(0,1fr)_8rem] gap-2">
              <Input aria-label={`${t}: nombre`} placeholder={`${t}: nombre y apellido`} disabled={!editable} value={firmantes[k]?.nombre ?? ""} onChange={(e) => persona(k, { nombre: e.target.value })} className="h-9" />
              <Input aria-label={`${t}: cédula`} placeholder="Cédula" disabled={!editable} value={firmantes[k]?.cedula ?? ""} onChange={(e) => persona(k, { cedula: e.target.value })} className="h-9" />
            </div>
          ))}
          {delegados.map((d, i) => (
            <div key={i} className="grid grid-cols-[minmax(0,1fr)_8rem_auto] gap-2">
              <Input aria-label="Delegado: nombre" placeholder="Delegado de prevención: nombre" disabled={!editable} value={d.nombre} onChange={(e) => setFirmantes({ ...firmantes, delegados: delegados.map((x, j) => (j === i ? { ...x, nombre: e.target.value } : x)) })} className="h-9" />
              <Input aria-label="Delegado: cédula" placeholder="Cédula" disabled={!editable} value={d.cedula} onChange={(e) => setFirmantes({ ...firmantes, delegados: delegados.map((x, j) => (j === i ? { ...x, cedula: e.target.value } : x)) })} className="h-9" />
              {editable && (i === delegados.length - 1 ? (
                <Button type="button" variant="ghost" size="icon" aria-label="Agregar delegado" onClick={() => setFirmantes({ ...firmantes, delegados: [...delegados, vacia] })}><Plus /></Button>
              ) : (
                <Button type="button" variant="ghost" size="icon" aria-label="Quitar delegado" onClick={() => setFirmantes({ ...firmantes, delegados: delegados.filter((_, j) => j !== i) })}><Trash2 /></Button>
              ))}
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {editable && (
          <>
            <Button disabled={ocupado} onClick={() => guardar()}>{ocupado ? <Loader2 className="animate-spin" /> : <Save />} Guardar</Button>
            <Button variant="outline" disabled={ocupado} onClick={() => guardar(true)}><Printer /> Guardar e imprimir</Button>
            <Button variant="ghost" disabled={ocupado} onClick={() => { setTextos(sugeridos); setAviso(null); }}><Sparkles /> Regenerar todo</Button>
          </>
        )}
        {!editable && <Button asChild variant="outline"><Link href={enlaceImprimir} target="_blank"><Printer /> Imprimir</Link></Button>}
        {aviso && <span className={aviso.ok ? "text-sm text-ok-texto" : "text-sm text-destructive"}>{aviso.mensaje}</span>}
      </div>
    </div>
  );
}
