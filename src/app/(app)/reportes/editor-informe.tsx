"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { Copy, ExternalLink, Loader2, Plus, Printer, RotateCcw, Save, Shuffle, Sparkles, Trash2, Undo2, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { personaVacia, representantesDe, type Firmantes, type Persona } from "@/lib/firmantes";
import type { InformeVigilancia } from "@/lib/reportes";
import type { TextosInforme } from "@/lib/vigilancia-textos";
import { generarAnalisis, SECCIONES_ANALISIS, type DatosAnalisis } from "@/lib/vigilancia-analisis";
import { abrirEnVentana } from "@/lib/escritorio";
import { leerRespuestaIA, pedidoIA, TITULOS_IA, type ClaveIA } from "@/lib/vigilancia-ia";
import { guardarInformeVigilancia } from "./acciones";

type Clave = keyof TextosInforme;

const SECCIONES: [Clave, string, string][] = [
  ["resumen", "Resumen ejecutivo", "Hallazgos clave del período en pocas líneas."],
  ["conclusiones", "Análisis y conclusiones médico-ocupacionales", "Interpretación médica de los indicadores."],
  ["vision_medico", "Visión del médico ocupacional (opcional)", "Tu perspectiva personal, que complementa al analizador y a la IA. Sale en el informe solo si la escribes. No escribas nombres ni diagnósticos de personas: este informe lo lee la empresa."],
  ["recomendaciones_medicas", "Recomendaciones médico-ocupacionales", "Lo que hace el servicio médico: vigilancia, evaluaciones, seguimiento de casos y reintegros."],
  ["recomendaciones", "Recomendaciones de seguridad y salud en el trabajo", "Lo que hacen la empresa, su Servicio de SST y el Comité: controles, EPP, investigación."],
  ["factores_riesgo", "Factores de riesgo, procesos peligrosos y efectos en la salud", "Se sugieren desde los puestos de la empresa."],
  ["medidas_control", "Medidas de control en la fuente, el ambiente y los trabajadores", ""],
];

// Opcional y gratis: copia un pedido con cifras agregadas (sin nombres) para Claude o ChatGPT y lee la respuesta pegada
function MejorarConIA({ datos, riesgos, quitar, aplicar }: { datos: DatosAnalisis; riesgos: string; quitar: string[]; aplicar: (t: Partial<Record<ClaveIA, string>>) => void }) {
  const [respuesta, setRespuesta] = useState("");
  const [nota, setNota] = useState<{ error: boolean; texto: string } | null>(null);
  const pedido = pedidoIA(datos, riesgos, quitar);
  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(pedido);
      setNota({ error: false, texto: "Pedido copiado. Pégalo en Claude o ChatGPT y trae aquí la respuesta." });
    } catch {
      setNota({ error: true, texto: "No se pudo copiar solo: abre «Ver lo que se copia», selecciona el texto y cópialo." });
    }
  };
  const usar = () => {
    const t = leerRespuestaIA(respuesta);
    const n = Object.keys(t).length;
    if (!n) return setNota({ error: true, texto: `No encontré los títulos (${Object.values(TITULOS_IA).join(", ")}). Pega la respuesta completa.` });
    aplicar(t);
    setRespuesta("");
    setNota(n < 3 ? { error: false, texto: `Puse ${n} de 3 apartados; los otros quedan como estaban.` } : null);
  };
  return (
    <details className="group rounded-lg border border-dashed p-3">
      <summary className="cursor-pointer text-sm font-medium"><Sparkles className="mr-1 inline size-4 text-primary" />Mejorar con IA <span className="font-normal text-muted-foreground">· opcional y gratis: conclusión y recomendaciones</span></summary>
      <div className="mt-3 space-y-3 text-sm">
        <p className="text-xs text-muted-foreground">Solo van cifras del trimestre: sin el nombre ni el RIF de la empresa, sin nombres de trabajadores, sin diagnósticos confidenciales y sin grupos de 1 o 2 casos. Sin internet, el analizador de zamorApp sigue redactando todo.</p>
        <p className="text-xs font-medium text-aviso-texto">Revisa el pedido antes de copiarlo: no debe tener nombres.</p>
        <details className="rounded-md bg-muted/50 px-3 py-2">
          <summary className="cursor-pointer text-xs font-medium">Ver lo que se copia</summary>
          <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap font-mono text-xs">{pedido}</pre>
        </details>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" size="sm" className="w-full sm:w-auto" onClick={copiar}><Copy /> 1. Copiar pedido</Button>
          <Button asChild type="button" variant="ghost" size="sm"><a href="https://claude.ai/new" target="_blank" rel="noreferrer"><ExternalLink /> Abrir Claude</a></Button>
          <Button asChild type="button" variant="ghost" size="sm"><a href="https://chatgpt.com/" target="_blank" rel="noreferrer"><ExternalLink /> Abrir ChatGPT</a></Button>
        </div>
        <Textarea placeholder="2. Pega aquí la respuesta completa de la IA" value={respuesta} onChange={(e) => setRespuesta(e.target.value)} className="min-h-24 text-sm" />
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" size="sm" disabled={!respuesta.trim()} onClick={usar}><Wand2 /> 3. Usar en el informe</Button>
          {nota && <span className={`text-xs ${nota.error ? "text-alerta-texto" : "text-muted-foreground"}`}>{nota.texto}</span>}
        </div>
      </div>
    </details>
  );
}

function Campo({ etiqueta, valor, cambiar, disabled, placeholder, tipo = "text" }: { etiqueta: string; valor?: string; cambiar: (v: string) => void; disabled: boolean; placeholder?: string; tipo?: string }) {
  return (
    <label className="space-y-1 text-xs">
      <span className="text-muted-foreground">{etiqueta}</span>
      <Input type={tipo} value={valor ?? ""} placeholder={placeholder} disabled={disabled} onChange={(e) => cambiar(e.target.value)} className="h-9 text-sm" />
    </label>
  );
}

// Una o varias personas que firman: nombre, cédula, cargo y (médico, SST) registro
function Grupo({ titulo, ayuda, personas, cambiar, disabled, registro, varios }: {
  titulo: string; ayuda?: string; personas: Persona[]; cambiar: (l: Persona[]) => void; disabled: boolean; registro?: boolean; varios?: boolean;
}) {
  const filas = personas.length ? personas : [personaVacia];
  const poner = (i: number, c: Partial<Persona>) => cambiar(filas.map((p, j) => (j === i ? { ...personaVacia, ...p, ...c } : p)));
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">{titulo}{ayuda && <span className="ml-1.5 text-xs font-normal text-muted-foreground">{ayuda}</span>}</legend>
      {filas.map((p, i) => (
        <div key={i} className="grid grid-cols-1 gap-2 rounded-md border border-dashed p-2 sm:grid-cols-[minmax(0,1.4fr)_8rem_minmax(0,1fr)_auto]">
          <Input aria-label={`${titulo}: nombre y apellido`} placeholder="Nombre y apellido" disabled={disabled} value={p.nombre} onChange={(e) => poner(i, { nombre: e.target.value })} className="h-9" />
          <Input aria-label={`${titulo}: cédula`} placeholder="Cédula" disabled={disabled} value={p.cedula} onChange={(e) => poner(i, { cedula: e.target.value })} className="h-9" />
          <Input aria-label={`${titulo}: cargo`} placeholder="Cargo" disabled={disabled} value={p.cargo ?? ""} onChange={(e) => poner(i, { cargo: e.target.value })} className="h-9" />
          <div className="flex gap-1">
            {registro && <Input aria-label={`${titulo}: registro`} placeholder="Registro" disabled={disabled} value={p.registro ?? ""} onChange={(e) => poner(i, { registro: e.target.value })} className="h-9 w-32" />}
            {varios && !disabled && (filas.length > 1 || p.nombre) && (
              <Button type="button" variant="ghost" size="icon" aria-label={`Quitar de ${titulo.toLowerCase()}`} onClick={() => cambiar(filas.filter((_, j) => j !== i))}><Trash2 /></Button>
            )}
          </div>
        </div>
      ))}
      {varios && !disabled && filas.length < 8 && (
        <Button type="button" variant="ghost" size="sm" onClick={() => cambiar([...filas, personaVacia])}><Plus /> Agregar</Button>
      )}
    </fieldset>
  );
}

// Redacción del informe: cada sección trae un borrador generado con los datos del período, editable.
export function EditorInforme({ empresaId, desde, hasta, inicial, sugeridos: base, datos, firmantesBase, editable, enlaceImprimir, empresa }: {
  empresaId: string | null;
  desde: string;
  hasta: string;
  inicial: InformeVigilancia | null;
  sugeridos: TextosInforme;
  datos: DatosAnalisis | null;
  firmantesBase: Firmantes;
  editable: boolean;
  enlaceImprimir: string;
  /** Datos de la portada que salen de la ficha de la empresa (solo lectura aquí) */
  empresa?: { id: string; datos: [string, string | null][] } | null;
}) {
  // Variante de redacción: «Otra redacción» la cambia y el análisis se reescribe con los mismos datos
  const [variante, setVariante] = useState(inicial?.variante ?? 0);
  const generado = useMemo(() => (datos ? generarAnalisis(datos, variante) : null), [datos, variante]);
  const sugeridos: TextosInforme = generado ? { ...base, resumen: generado.resumen, conclusiones: generado.conclusion } : base;
  const [analisis, setAnalisis] = useState<Record<string, string>>(() => ({ ...generado?.secciones, ...inicial?.analisis }));
  const [textos, setTextos] = useState<TextosInforme>(() => ({
    resumen: inicial?.resumen || sugeridos.resumen,
    conclusiones: inicial?.conclusiones || sugeridos.conclusiones,
    vision_medico: inicial?.vision_medico ?? "",
    recomendaciones_medicas: inicial?.recomendaciones_medicas || sugeridos.recomendaciones_medicas,
    recomendaciones: inicial?.recomendaciones || sugeridos.recomendaciones,
    factores_riesgo: inicial?.factores_riesgo || sugeridos.factores_riesgo,
    medidas_control: inicial?.medidas_control || sugeridos.medidas_control,
  }));
  const [firmantes, setFirmantes] = useState<Firmantes>(() => ({ ...firmantesBase, ...inicial?.firmantes }));
  const [aviso, setAviso] = useState<{ ok: boolean; mensaje: string } | null>(null);
  // Textos de antes de «Usar en el informe» (IA): «Deshacer» los devuelve
  const [antesIA, setAntesIA] = useState<TextosInforme | null>(null);
  const [guardado, setGuardado] = useState(Boolean(inicial?.id));
  const [ocupado, iniciar] = useTransition();

  const cambiar = (k: Clave, v: string) => { setTextos({ ...textos, [k]: v }); setAviso(null); };
  const otraRedaccion = () => {
    if (!datos) return;
    const g = generarAnalisis(datos, variante + 1);
    setVariante(variante + 1);
    setAnalisis(g.secciones);
    setTextos({ ...textos, resumen: g.resumen, conclusiones: g.conclusion });
    setAviso(null);
  };
  const fijar = (c: Partial<Firmantes>) => { setFirmantes({ ...firmantes, ...c }); setAviso(null); };

  const guardar = (imprimir = false) =>
    iniciar(async () => {
      const guardarTextos = async () => {
        // Del análisis solo se guarda lo editado a mano; lo demás lo vuelve a redactar la variante
        const editado = Object.fromEntries(Object.entries(analisis).filter(([k, v]) => v !== generado?.secciones[k as keyof typeof generado.secciones]));
        const r = await guardarInformeVigilancia(empresaId, desde, hasta, { ...textos, firmantes, analisis: editado, variante });
        setAviso(r);
        if (r.ok) setGuardado(true);
        return r.ok;
      };
      if (!imprimir) return void (await guardarTextos());
      // La ventana del informe se pide con el clic y abre cuando terminó de guardar
      await abrirEnVentana(async () => ((await guardarTextos()) ? enlaceImprimir : null));
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
            {editable && k !== "vision_medico" && textos[k] !== sugeridos[k] && (
              <Button type="button" variant="ghost" size="sm" onClick={() => cambiar(k, sugeridos[k])}><RotateCcw /> Usar sugerencia</Button>
            )}
          </div>
          <Textarea value={textos[k]} disabled={!editable} onChange={(e) => cambiar(k, e.target.value)} className="min-h-28 text-sm" />
        </div>
      ))}

      {datos && editable && (
        <MejorarConIA
          datos={datos}
          riesgos={textos.factores_riesgo}
          quitar={(empresa?.datos ?? []).filter(([k]) => k === "RIF" || k === "Razón social").map(([, v]) => v ?? "")}
          aplicar={(t) => { setAntesIA(textos); setTextos({ ...textos, ...t }); setAviso({ ok: true, mensaje: "Texto de la IA puesto en la conclusión y las recomendaciones: revísalo antes de guardar." }); }}
        />
      )}

      {generado && (
        <details className="group rounded-lg border p-3">
          <summary className="cursor-pointer text-sm font-medium">Análisis de cada cuadro <span className="font-normal text-muted-foreground">· sale debajo de cada gráfico del informe impreso</span></summary>
          <div className="mt-3 space-y-3">
            {SECCIONES_ANALISIS.map(([k, titulo]) => (
              <div key={k} className="space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-muted-foreground">{titulo}</span>
                  {editable && analisis[k] !== generado.secciones[k] && (
                    <Button type="button" variant="ghost" size="sm" onClick={() => setAnalisis({ ...analisis, [k]: generado.secciones[k] })}><RotateCcw /> Usar sugerencia</Button>
                  )}
                </div>
                <Textarea value={analisis[k] ?? ""} disabled={!editable} onChange={(e) => { setAnalisis({ ...analisis, [k]: e.target.value }); setAviso(null); }} className="min-h-20 text-sm" />
              </div>
            ))}
          </div>
        </details>
      )}

      <details className="group rounded-lg border p-3" open={!guardado}>
        <summary className="cursor-pointer text-sm font-medium">Portada y firmantes <span className="font-normal text-muted-foreground">· se recuerdan del último informe de la empresa</span></summary>
        <div className="mt-3 space-y-4">
          {empresa && (
            <div className="rounded-md bg-muted/50 px-3 py-2 text-xs">
              <div className="mb-1 font-medium">De la ficha de la empresa</div>
              <dl className="grid grid-cols-1 gap-x-4 gap-y-0.5 sm:grid-cols-2">
                {empresa.datos.map(([k, v]) => (
                  <div key={k} className="flex min-w-0 gap-1.5"><dt className="shrink-0 text-muted-foreground">{k}:</dt><dd className={v ? "truncate" : "font-medium text-alerta-texto"}>{v || "Falta"}</dd></div>
                ))}
              </dl>
              <Link href={`/empresas/${empresa.id}`} className="mt-1 inline-block text-primary underline-offset-2 hover:underline">Corregir en la ficha de la empresa</Link>
            </div>
          )}
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Campo etiqueta="Autoridad" valor={firmantes.autoridad} cambiar={(v) => fijar({ autoridad: v })} disabled={!editable} />
            <Campo etiqueta="Custodio" valor={firmantes.custodio} cambiar={(v) => fijar({ custodio: v })} disabled={!editable} />
            <Campo etiqueta="Centro de trabajo" valor={firmantes.centro_trabajo} cambiar={(v) => fijar({ centro_trabajo: v })} disabled={!editable} placeholder="Si se deja vacío, la dirección de la empresa" />
            <Campo etiqueta="Fecha de emisión" tipo="date" valor={firmantes.fecha_emision} cambiar={(v) => fijar({ fecha_emision: v })} disabled={!editable} />
          </div>
          <Grupo titulo="Elaborado por" ayuda="Médico ocupacional" personas={[firmantes.medico ?? personaVacia]} cambiar={([p]) => fijar({ medico: p })} disabled={!editable} registro />
          <Grupo titulo="Servicio de Seguridad y Salud en el Trabajo" ayuda="Coordinador(a) y su registro del INPSASEL" personas={[firmantes.sst ?? personaVacia]} cambiar={([p]) => fijar({ sst: p })} disabled={!editable} registro />
          <Grupo titulo="Representantes del patrono" personas={representantesDe(firmantes)} cambiar={(l) => fijar({ representantes: l, empleador: undefined })} disabled={!editable} varios />
          <Grupo titulo="Delegados de prevención" personas={firmantes.delegados ?? []} cambiar={(l) => fijar({ delegados: l })} disabled={!editable} varios />
        </div>
      </details>

      <div className="flex flex-wrap items-center gap-2">
        {editable && (
          <>
            <Button disabled={ocupado} onClick={() => guardar()}>{ocupado ? <Loader2 className="animate-spin" /> : <Save />} Guardar</Button>
            <Button variant="outline" disabled={ocupado} onClick={() => guardar(true)}><Printer /> Guardar e imprimir</Button>
            {datos && <Button variant="ghost" disabled={ocupado} onClick={otraRedaccion} title="Reescribe el resumen, la conclusión y el análisis de cada cuadro con otras palabras, con los mismos datos"><Shuffle /> Otra redacción</Button>}
            <Button variant="ghost" disabled={ocupado} onClick={() => { setTextos(sugeridos); setAnalisis({ ...generado?.secciones }); setAviso(null); }}><Sparkles /> Regenerar todo</Button>
          </>
        )}
        {!editable && <Button asChild variant="outline"><Link href={enlaceImprimir} target="_blank"><Printer /> Imprimir</Link></Button>}
        {aviso && <span className={aviso.ok ? "text-sm text-ok-texto" : "text-sm text-destructive"}>{aviso.mensaje}</span>}
        {antesIA && aviso?.mensaje.startsWith("Texto de la IA") && (
          <Button type="button" variant="ghost" size="sm" onClick={() => { setTextos(antesIA); setAntesIA(null); setAviso(null); }}><Undo2 /> Deshacer</Button>
        )}
      </div>
    </div>
  );
}
