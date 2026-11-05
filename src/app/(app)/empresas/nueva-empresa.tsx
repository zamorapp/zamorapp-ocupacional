"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Check, ChevronLeft, ChevronRight, Loader2, Pencil, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { Empresa } from "@/lib/empresas";
import { AVISOS_EMPRESA } from "@/lib/empresas-avisos";
import { MESES } from "@/lib/periodos";
import { guardarEmpresa } from "./acciones";

function Campo({ id, etiqueta, className, ...props }: React.ComponentProps<"input"> & { etiqueta: string }) {
  return (
    <div className={className}>
      <Label htmlFor={id} className="mb-1.5">{etiqueta}</Label>
      <Input id={id} name={id} className="h-10" {...props} />
    </div>
  );
}

// Los pasos del formulario de empresa. Al crear se recorren en orden y al final se revisa;
// al editar se salta a cualquiera y se guarda cuando se quiera. Todos los campos siguen en el mismo formulario.
const PASOS = [
  { titulo: "Identificación", ayuda: "Quién es la empresa: razón social, RIF y actividad." },
  { titulo: "Ubicación y dependencias", ayuda: "Dónde está, cómo se le contacta y en qué departamentos se divide." },
  { titulo: "Registros legales", ayuda: "Servicio de SST y PSST ante el INPSASEL, y cuándo empieza su año de trabajo." },
  { titulo: "Exámenes y avisos", ayuda: "Cada cuánto se examina a su gente y qué avisos quieres recibir de ella." },
] as const;

function leer(f: HTMLFormElement | null, nombre: string): string {
  const el = f?.elements.namedItem(nombre);
  if (!el || el instanceof RadioNodeList) return "";
  if (el instanceof HTMLSelectElement) return el.selectedOptions[0]?.text ?? "";
  return String((el as HTMLInputElement).value ?? "").trim();
}

// Revisión antes de crear: lo que quedó escrito en cada paso, con «Cambiar» para volver
function Revision({ f, ir }: { f: HTMLFormElement | null; ir: (n: number) => void }) {
  const v = (n: string) => leer(f, n);
  const deps = v("dependencias").split("\n").map((d) => d.trim()).filter(Boolean);
  // Datos opcionales que faltan por paso: se avisan en ámbar, nunca impiden crear
  const falta = (campos: [string, string][]) => campos.filter(([n]) => !v(n) || v(n) === "Sin definir").map(([, t]) => t);
  const faltan: string[][] = [
    falta([["nil", "NIL"], ["actividad", "actividad económica"]]),
    falta([["estado", "estado"], ["municipio", "municipio"], ["direccion", "dirección"], ["telefono", "teléfono"]]),
    falta([["servicio_sst", "servicio de SST"], ["servicio_sst_registro", "registro del servicio de SST"], ["psst_registro", "registro del PSST"]]),
    [],
  ];
  const filas: [number, string, string][] = [
    [0, "Identificación", [v("razon_social"), v("rif") && `RIF ${v("rif")}`, v("actividad")].filter(Boolean).join(" · ")],
    [1, "Ubicación", [v("estado"), v("municipio"), v("telefono"), deps.length ? `${deps.length} dependencia${deps.length === 1 ? "" : "s"}` : "sin dependencias"].filter(Boolean).join(" · ")],
    [2, "Registros legales", [`SST: ${v("servicio_sst") || "sin definir"}`, v("psst_registro") ? "PSST registrado" : "PSST sin fecha", `gestión desde ${v("mes_inicio_gestion")}`].join(" · ")],
    [3, "Exámenes y avisos", `Periódico cada ${v("periodicidad_meses") || 12} meses · avisar ${v("dias_aviso_examen") || 30} días antes`],
  ];
  return (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground">Revisa y pulsa «Crear empresa». Lo que falta se puede completar después con «Editar».</p>
      <ul className="divide-y rounded-lg border">
        {filas.map(([n, t, d]) => (
          <li key={t} className="flex items-center gap-3 px-3 py-2.5">
            {faltan[n].length ? <span aria-hidden className="mx-1 size-2 shrink-0 rounded-full bg-aviso" /> : <Check className="size-4 shrink-0 text-ok-texto" />}
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium">{t}</span>
              <span className="block text-xs text-muted-foreground [overflow-wrap:anywhere]">{d || "Sin datos"}</span>
              {faltan[n].length > 0 && <span className="block text-xs text-aviso-texto">Falta: {faltan[n].join(", ")}</span>}
            </span>
            <Button type="button" variant="ghost" size="sm" onClick={() => ir(n)}>Cambiar</Button>
          </li>
        ))}
      </ul>
    </div>
  );
}

// Formulario de empresa: sin "empresa" crea una nueva (pasos en orden + revisión); con "empresa" edita sus datos
// "dependencias": las que la empresa ya tiene (al editar), para verlas antes de agregar
export function FormEmpresa({ habilitado, empresa, dependencias = [] }: { habilitado: boolean; empresa?: Empresa; dependencias?: string[] }) {
  const [abierto, setAbierto] = useState(false);
  const [estado, accion, enviando] = useActionState(guardarEmpresa, null);
  const [paso, setPaso] = useState(0);
  const formulario = useRef<HTMLFormElement>(null);
  const e = empresa;
  const crear = !e;
  const ultimo = crear ? PASOS.length : PASOS.length - 1; // al crear, el paso extra es la revisión

  useEffect(() => {
    if (estado?.ok) setAbierto(false);
  }, [estado]);

  // Antes de avanzar, los obligatorios del paso actual deben estar llenos (el navegador señala cuál)
  const pasoValido = () => {
    const seccion = formulario.current?.querySelector<HTMLElement>(`[data-paso="${paso}"]`);
    const campos = Array.from(seccion?.querySelectorAll<HTMLInputElement>("input, select, textarea") ?? []);
    return campos.every((c) => c.reportValidity());
  };
  const ir = (n: number) => setPaso(Math.max(0, Math.min(ultimo, n)));

  return (
    <Dialog open={abierto} onOpenChange={(v) => { setAbierto(v); if (v) setPaso(0); }}>
      <DialogTrigger asChild>
        {e ? (
          <Button variant="ghost" size="sm" disabled={!habilitado}><Pencil /> Editar</Button>
        ) : (
          <Button disabled={!habilitado}><Plus /> Nueva empresa</Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{e ? e.razonSocial : "Nueva empresa cliente"}</DialogTitle>
          <DialogDescription>{paso < PASOS.length ? PASOS[paso].ayuda : "Último paso: revisar."}</DialogDescription>
        </DialogHeader>

        {/* Celular: «Paso N de M» con barra fina; desde sm, los chips */}
        <div className="space-y-1.5 sm:hidden" aria-hidden>
          <p className="text-xs font-medium text-muted-foreground">Paso {paso + 1} de {ultimo + 1} · {paso < PASOS.length ? PASOS[paso].titulo : "Revisar"}</p>
          <div className="h-1 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary transition-all" style={{ width: `${((paso + 1) / (ultimo + 1)) * 100}%` }} /></div>
        </div>
        {/* Pasos: al crear se avanzan en orden; al editar se puede saltar a cualquiera */}
        <ol className="hidden flex-wrap gap-1.5 sm:flex" aria-label="Pasos">
          {[...PASOS.map((p) => p.titulo), ...(crear ? ["Revisar"] : [])].map((t, i) => {
            const libre = !crear || i < paso;
            return (
              <li key={t}>
                <button type="button" disabled={!libre && i !== paso} onClick={() => libre && ir(i)} aria-current={i === paso ? "step" : undefined}
                  className={cn("flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition",
                    i === paso ? "border-primary bg-primary text-primary-foreground" : crear && i < paso ? "bg-ok/10 text-ok-texto" : "text-muted-foreground",
                    libre && i !== paso && "hover:bg-muted")}>
                  <span aria-hidden>{crear && i < paso ? <Check className="size-3" /> : i + 1}</span>{t}
                </button>
              </li>
            );
          })}
        </ol>

        <form
          ref={formulario}
          action={accion}
          className="space-y-4"
          // Al crear, Enter en un campo avanza al siguiente paso en vez de guardar a medias
          onSubmit={(ev) => { if (crear && paso < ultimo) { ev.preventDefault(); if (pasoValido()) ir(paso + 1); } }}
          onKeyDown={(ev) => {
            if (ev.key === "Enter" && crear && paso < ultimo && ev.target instanceof HTMLInputElement) {
              ev.preventDefault();
              if (pasoValido()) ir(paso + 1);
            }
          }}
          onInvalidCapture={(ev) => {
            const n = (ev.target as HTMLElement).closest("[data-paso]")?.getAttribute("data-paso");
            if (n != null) setPaso(Number(n));
          }}
        >
          {e && <input type="hidden" name="id" value={e.id} />}
          <div data-paso="0" hidden={paso !== 0} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Campo id="razon_social" etiqueta="Razón social *" required defaultValue={e?.razonSocial} className="sm:col-span-2" />
          <Campo id="rif" etiqueta="RIF *" placeholder="J-30123456-7" required defaultValue={e?.rif} />
          <Campo id="nil" etiqueta="NIL" placeholder="Número de identificación laboral" defaultValue={e?.nil ?? ""} />
          <Campo id="actividad" etiqueta="Actividad económica" defaultValue={e?.actividad ?? ""} className="sm:col-span-2" />
          <Campo id="sector" etiqueta="Sector económico" defaultValue={e?.sector ?? ""} />
          </div>
          <div data-paso="1" hidden={paso !== 1} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Campo id="estado" etiqueta="Estado" defaultValue={e?.estado ?? ""} />
          <Campo id="municipio" etiqueta="Municipio" defaultValue={e?.municipio ?? ""} />
          <Campo id="parroquia" etiqueta="Parroquia" defaultValue={e?.parroquia ?? ""} />
          <Campo id="direccion" etiqueta="Dirección" defaultValue={e?.direccion ?? ""} className="sm:col-span-2" />
          <Campo id="telefono" etiqueta="Teléfono" type="tel" defaultValue={e?.telefono ?? ""} />
          <Campo id="correo" etiqueta="Correo" type="email" defaultValue={e?.correo ?? ""} />
          <div className="sm:col-span-2">
            <Label htmlFor="dependencias" className="mb-1.5">{e ? "Agregar dependencias o departamentos" : "Dependencias o departamentos"}</Label>
            {dependencias.length > 0 && (
              <ul aria-label="Dependencias que ya tiene" className="mb-2 flex flex-wrap gap-1.5">
                {dependencias.map((d) => <li key={d} className="rounded-full border bg-muted px-2.5 py-0.5 text-xs">{d}</li>)}
              </ul>
            )}
            <Textarea id="dependencias" name="dependencias" rows={4} placeholder={"Una por línea. Ejemplo:\nAdministración\nProducción\nMantenimiento"} />
            <p className="mt-1 text-xs text-muted-foreground">Al registrar o atender a un trabajador de esta empresa, «Dependencia o departamento» muestra estas. {e ? "Las que ya tiene no se repiten." : "También se pueden agregar después."}</p>
          </div>

          </div>
          <div data-paso="2" hidden={paso !== 2} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="servicio_sst" className="mb-1.5">Servicio de SST</Label>
            <select id="servicio_sst" name="servicio_sst" defaultValue={e?.servicioSst ?? ""} className="h-10 w-full rounded-md border bg-transparent px-3 text-sm">
              <option value="">Sin definir</option>
              <option value="propio">Propio</option>
              <option value="mancomunado">Mancomunado</option>
              <option value="tercerizado">Tercerizado</option>
            </select>
          </div>
          <Campo id="servicio_sst_registro" etiqueta="Registro del Servicio de SST" type="date" defaultValue={e?.servicioSstRegistro ?? ""} />
          <Campo id="psst_registro" etiqueta="Registro del PSST" type="date" defaultValue={e?.psstRegistro ?? ""} />
          <div className="sm:col-span-2">
            <Label htmlFor="mes_inicio_gestion" className="mb-1.5">La gestión (año de trabajo) empieza en</Label>
            <select id="mes_inicio_gestion" name="mes_inicio_gestion" defaultValue={e?.mesInicioGestion ?? 1} className="h-10 w-full rounded-md border bg-transparent px-3 text-sm">
              {MESES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
            </select>
            <p className="mt-1 text-xs text-muted-foreground">Los trimestres del informe de vigilancia se cuentan desde este mes. Ejemplo: febrero → I trimestre febrero-abril.</p>
          </div>
          </div>
          <div data-paso="3" hidden={paso !== 3} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Campo id="periodicidad_meses" etiqueta="Examen periódico cada (meses)" type="number" min={1} max={60} defaultValue={e?.periodicidadMeses ?? 12} />
          <Campo id="dias_aviso_examen" etiqueta="Avisar antes del vencimiento (días)" type="number" min={0} max={180} defaultValue={e?.diasAvisoExamen ?? 30} />
          <p className="-mt-2 text-xs text-muted-foreground sm:col-span-2">Si la constancia de aptitud no trae «Vigente hasta», el próximo examen se calcula con esta periodicidad. El inicio y el portal avisan con la anticipación indicada.</p>
          <div>
            <Campo id="dias_post_vacacional" etiqueta="Post vacacional: días desde el regreso" type="number" min={0} max={60} defaultValue={e?.diasPostVacacional ?? 5} />
            <p className="mt-1 text-xs text-muted-foreground">Se avisa 2 días antes del regreso y vence a los días indicados aquí.</p>
          </div>

          {/* Avisos por empresa: con las que se trabaja poco se apagan; los reportes y la ficha siguen mostrando todo */}
          <fieldset className="space-y-2 rounded-lg border px-3 py-2.5 sm:col-span-2">
            <legend className="px-1 text-sm font-medium">Avisos de esta empresa</legend>
            <input type="hidden" name="avisos_en_formulario" value="1" />
            {AVISOS_EMPRESA.map((a) => (
              <label key={a.clave} className="flex items-start gap-2.5 text-sm">
                <input type="checkbox" name={`aviso_${a.clave}`} defaultChecked={!e?.avisosApagados.includes(a.clave)} className="mt-0.5 size-4 accent-[var(--primary)]" />
                <span>{a.nombre} <span className="text-xs text-muted-foreground">· {a.detalle}</span></span>
              </label>
            ))}
            <label className="flex items-start gap-2.5 text-sm">
              <input type="checkbox" name="aviso_datos_legales" defaultChecked={!e?.ignorarAlertaLegal} className="mt-0.5 size-4 accent-[var(--primary)]" />
              <span>Datos legales incompletos <span className="text-xs text-muted-foreground">· En Inicio y en Empresas</span></span>
            </label>
            <p className="text-xs text-muted-foreground">Desmarca los que no quieras recibir. Los reportes y la ficha del trabajador siguen mostrando todo, y los plazos legales de accidentes siempre avisan.</p>
          </fieldset>

          </div>
          {crear && paso === PASOS.length && <Revision f={formulario.current} ir={ir} />}

          {estado && !estado.ok && (
            <p className="rounded-md bg-alerta/10 px-3 py-2 text-sm text-alerta-texto">{estado.mensaje}</p>
          )}
          <div className="flex flex-wrap items-center justify-end gap-2">
            {paso > 0 ? (
              <Button type="button" variant="ghost" className="mr-auto" onClick={() => ir(paso - 1)}><ChevronLeft /> Atrás</Button>
            ) : (
              <Button type="button" variant="ghost" className="mr-auto" onClick={() => setAbierto(false)}>Cancelar</Button>
            )}
            {crear && paso < ultimo && (
              <Button type="button" onClick={() => { if (pasoValido()) ir(paso + 1); }}>
                Siguiente: {paso + 1 < PASOS.length ? PASOS[paso + 1].titulo : "Revisar"} <ChevronRight />
              </Button>
            )}
            {!crear && paso < ultimo && (
              <Button type="button" variant="outline" onClick={() => { if (pasoValido()) ir(paso + 1); }}>Siguiente <ChevronRight /></Button>
            )}
            {(!crear || paso === ultimo) && (
              <Button type="submit" disabled={enviando}>
                {enviando && <Loader2 className="animate-spin" />} {e ? "Guardar cambios" : "Crear empresa"}
              </Button>
            )}
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
