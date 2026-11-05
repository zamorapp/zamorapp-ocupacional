"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { PLANTILLA_APTITUD, PLANTILLA_CITA } from "@/lib/mensajes";
import { ChevronRight } from "lucide-react";
import { BarraGuardar } from "@/components/app/barra-guardar";
import { useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import { Campo, CampoSelect, CampoTexto } from "@/components/app/campo";
import { Button } from "@/components/ui/button";
import { guardarOrganizacion } from "../acciones";
import { CERTIFICACION_TRABAJADOR, CONDICION_PAGO_BCV, NOTA_CERTIFICADO_SACS, NOTA_IDONEIDAD, NOTA_PREEMPLEO_VIH, NOTA_RIESGOS_PUESTO } from "@/lib/mensajes";

type Ajustes = {
  palabra_aptitud?: string;
  titulo_constancia?: string;
  observacion_idoneidad?: string | null;
  firma_paciente_constancia?: boolean;
  firma_medico_ocupacional?: boolean;
  reposo_pie_copia?: string | null;
  orden_nota?: string | null;
  orden_nota_preempleo?: string | null;
  nota_riesgos_puesto?: string | null;
  constancia_copia?: boolean;
  mensaje_cita?: string | null;
  mensaje_aptitud?: string | null;
  certificado_titulo?: string | null;
  certificado_nota?: string | null;
  firma_sello_separados?: boolean;
  reposo_pie_original?: string | null;
  meses_examen_periodico?: number;
  dias_aviso_fecha_futura?: number;
  recordatorio_resultados_dias?: number;
  centinela_correo?: boolean;
  dias_equipo_confianza?: number;
  celda_minima_empresa?: number;
  membrete_lema?: string | null;
  cobro_condiciones?: string | null;
  cobro_datos_pago?: string | null;
  factura_datos_pago?: string | null;
  membrete_titular?: string | null;
  membrete_credenciales?: string | null;
  invita_como?: string | null;
  certificacion_trabajador?: string | null;
  vigilancia_poblacion?: "efectivos" | "todos";
  vigilancia_horas?: "same" | "nomina";
};

type Org = { nombre: string; rif: string | null; direccion: string | null; telefono: string | null; correo: string | null; ajustes: unknown };

function Casilla({ id, etiqueta, defecto }: { id: string; etiqueta: string; defecto: boolean }) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <input type="checkbox" name={id} defaultChecked={defecto} className="size-4 accent-[var(--primary)]" />
      {etiqueta}
    </label>
  );
}

// Los cinco pasos de la pantalla. Cada uno se abre solo y, cerrado, resume en una línea lo que tiene hoy.
// Todos los campos siguen dentro del mismo formulario (ocultos, no quitados): «Guardar» manda siempre todo.
const PASOS = [
  { id: "servicio", titulo: "Datos del servicio", ayuda: "Nombre, RIF, contacto, logo y membrete de todos los documentos" },
  { id: "documentos", titulo: "Documentos impresos", ayuda: "Títulos, notas al pie, firmas y copias, por documento" },
  { id: "plazos", titulo: "Plazos y avisos", ayuda: "Vigencia del periódico, recordatorios y plazos legales" },
  { id: "privacidad", titulo: "Seguridad y privacidad", ayuda: "Código de dos pasos y cifras pequeñas en la vigilancia" },
  { id: "mensajes", titulo: "Mensajes por WhatsApp y correo", ayuda: "Textos de cita, resultado de aptitud e invitación a RR. HH." },
] as const;
type IdPaso = (typeof PASOS)[number]["id"];

// Lee lo que hoy está escrito; antes de que el formulario exista (primer pintado), lo guardado
function valor(f: HTMLFormElement | null, nombre: string, inicial: Record<string, unknown>): string {
  const el = f?.elements.namedItem(nombre);
  if (!el || el instanceof RadioNodeList) {
    const v = inicial[nombre];
    return v === true ? "sí" : v === false || v == null ? "" : String(v).trim();
  }
  if (el instanceof HTMLInputElement && el.type === "checkbox") return el.checked ? "sí" : "";
  return String((el as HTMLInputElement).value ?? "").trim();
}

// Resumen de una línea de cada paso cerrado, con lo que hoy está escrito en el formulario
function resumen(id: IdPaso, f: HTMLFormElement | null, inicial: Record<string, unknown>): string {
  const v = (n: string) => valor(f, n, inicial);
  const unir = (...p: (string | false)[]) => p.filter(Boolean).join(" · ");
  switch (id) {
    case "servicio": return unir(v("nombre") || "Falta el nombre", v("rif") && `RIF ${v("rif")}`, v("membrete_titular"));
    case "documentos": return unir(`Aptitud: ${v("palabra_aptitud") || "Elegible"}`, v("constancia_copia") ? "constancia con copia" : "constancia sin copia", v("firma_sello_separados") ? "firma y sello separados" : "firma y sello juntos");
    case "plazos": return unir(`Periódico cada ${v("meses_examen_periodico") || 12} meses`, v("recordatorio_resultados_dias") === "0" ? "sin recordar resultados" : `recordar resultados cada ${v("recordatorio_resultados_dias") || 3} días`, v("centinela_correo") ? "plazos legales por correo" : "plazos legales solo en la campana");
    case "privacidad": return unir(v("dias_equipo_confianza") === "0" ? "Código en cada entrada" : `Código cada ${v("dias_equipo_confianza") || 30} días`, v("celda_minima_empresa") === "0" ? "la empresa ve todas las cifras" : `la empresa no ve cifras menores de ${v("celda_minima_empresa") || 3}`);
    case "mensajes": return "3 mensajes: cita, resultado e invitación";
  }
}

// Un grupo de un paso que se despliega (sigue en el formulario aunque esté cerrado)
function Grupo({ titulo, abierto, children }: { titulo: string; abierto?: boolean; children: React.ReactNode }) {
  return (
    <details open={abierto} className="group rounded-lg border bg-background">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2.5 text-sm font-medium [&::-webkit-details-marker]:hidden">
        <ChevronRight className="size-4 shrink-0 text-muted-foreground transition group-open:rotate-90" />
        {titulo}
      </summary>
      <div className="grid grid-cols-1 gap-4 border-t px-3 py-3 sm:grid-cols-2">{children}</div>
    </details>
  );
}

export function FormOrganizacion({ org, editable, logo }: { org: Org; editable: boolean; logo?: React.ReactNode }) {
  const [estado, accion, enviando] = useActionState(guardarOrganizacion, null);
  const a = (org.ajustes ?? {}) as Ajustes;
  const formulario = useRef<HTMLFormElement>(null);
  const inicial: Record<string, unknown> = { firma_sello_separados: true, ...a, nombre: org.nombre, rif: org.rif };
  const [abierto, setAbierto] = useState<IdPaso | null>(null);
  const [sinGuardar, setSinGuardar] = useState(false);
  const [, setVersion] = useState(0); // vuelve a pintar los resúmenes al escribir

  // Al guardar bien, el aviso de «sin guardar» se apaga
  useEffect(() => { if (estado?.ok) setSinGuardar(false); }, [estado]);
  // El enlace del buscador puede abrir un paso: /configuracion/organizacion?paso=documentos
  const pasoPedido = useSearchParams().get("paso");
  useEffect(() => {
    if (pasoPedido && PASOS.some((x) => x.id === pasoPedido)) {
      setAbierto(pasoPedido as IdPaso);
      requestAnimationFrame(() => formulario.current?.querySelector(`[data-paso="${pasoPedido}"]`)?.scrollIntoView({ block: "start", behavior: "smooth" }));
    }
    setVersion((n) => n + 1);
  }, [pasoPedido]);

  return (
    <form
      ref={formulario}
      action={accion}
      className="space-y-4"
      onInput={() => { setSinGuardar(true); setVersion((n) => n + 1); }}
      // Un dato obligatorio vacío dentro de un paso cerrado: se abre ese paso para que se vea
      onInvalidCapture={(e) => {
        const paso = (e.target as HTMLElement).closest("[data-paso]")?.getAttribute("data-paso") as IdPaso | null;
        if (paso) setAbierto(paso);
      }}
    >
      <ol className="space-y-3" aria-label="Pasos de la configuración de la organización">
          {PASOS.map((p, i) => {
            const esAbierto = abierto === p.id;
            return (
              <li key={p.id} data-paso={p.id} className={cn("rounded-xl border bg-card transition", esAbierto && "border-primary/50 shadow-sm")}>
                <button
                  type="button"
                  aria-expanded={esAbierto}
                  onClick={() => setAbierto(esAbierto ? null : p.id)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left disabled:cursor-default"
                >
                  <span aria-hidden className={cn("grid size-8 shrink-0 place-items-center rounded-full text-sm font-semibold",
                    esAbierto ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>{i + 1}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold">{p.titulo}</span>
                    <span className="line-clamp-2 block text-sm text-muted-foreground">{esAbierto ? p.ayuda : resumen(p.id, formulario.current, inicial) || p.ayuda}</span>
                  </span>
                  <span className="shrink-0 text-sm font-medium text-primary">{esAbierto ? "Cerrar" : editable ? "Cambiar" : "Ver"}</span>
                </button>
                <div hidden={!esAbierto} className="space-y-4 border-t px-4 py-4">
                  {/* Solo los campos se bloquean sin permiso: los pasos se pueden abrir y leer */}
                  <fieldset disabled={!editable} className="space-y-4">
                    {p.id === "servicio" && <PasoServicio org={org} a={a} />}
                    {p.id === "documentos" && <PasoDocumentos a={a} />}
                    {p.id === "plazos" && <PasoPlazos a={a} />}
                    {p.id === "privacidad" && <PasoPrivacidad a={a} />}
                    {p.id === "mensajes" && <PasoMensajes a={a} />}
                  </fieldset>
                  {/* El logo se guarda solo (tiene su propio permiso), fuera del bloqueo de los campos */}
                  {p.id === "servicio" && logo && <div className="max-w-md rounded-lg border bg-background p-3"><p className="mb-2 text-sm font-medium">Logo del servicio</p>{logo}</div>}
                  {esAbierto && (
                    <div className="flex flex-wrap justify-end gap-2 pt-1">
                      {i < PASOS.length - 1
                        ? <Button type="button" variant="outline" onClick={() => setAbierto(PASOS[i + 1].id)}>Siguiente: {PASOS[i + 1].titulo} <ChevronRight /></Button>
                        : <Button type="button" variant="outline" onClick={() => setAbierto(null)}>Listo, cerrar</Button>}
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ol>

      <BarraGuardar sinGuardar={sinGuardar} enviando={enviando} resultado={estado} editable={editable} />
    </form>
  );
}

function PasoServicio({ org, a }: { org: Org; a: Ajustes }) {
  return (
    <>
      <p className="text-sm text-muted-foreground">Así se presenta el servicio en el membrete de constancias, informes, reposos y en los correos.</p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Campo id="nombre" etiqueta="Nombre del servicio *" defaultValue={org.nombre} required className="sm:col-span-2" />
        <Campo id="rif" etiqueta="RIF" defaultValue={org.rif ?? ""} placeholder="J-00000000-0" />
        <Campo id="telefono" etiqueta="Teléfono" defaultValue={org.telefono ?? ""} />
        <Campo id="correo" etiqueta="Correo" type="email" defaultValue={org.correo ?? ""} />
        <CampoDireccion defaultValue={org.direccion ?? ""} />
        <Campo id="membrete_titular" etiqueta="Médico titular (debajo del nombre del servicio)" defaultValue={a.membrete_titular ?? ""} placeholder="Dr. Nombre Apellido" />
        <Campo id="membrete_credenciales" etiqueta="Especialidad del titular" defaultValue={a.membrete_credenciales ?? ""} placeholder="Especialista en Medicina del Trabajo (Universidad)" />
        <Campo id="membrete_lema" etiqueta="Lema bajo el nombre (membrete)" defaultValue={a.membrete_lema ?? ""} placeholder="Servicios en Medicina Ocupacional · Ergonomía" className="sm:col-span-2" />
      </div>
    </>
  );
}

function PasoDocumentos({ a }: { a: Ajustes }) {
  return (
    <>
      <p className="text-sm text-muted-foreground">Toca un documento para ver lo que puedes cambiar. Una nota vacía no se imprime.</p>
      <div className="space-y-2">
        <Grupo titulo="Constancia de aptitud" abierto>
          <CampoSelect id="palabra_aptitud" etiqueta="Palabra base de la aptitud" defaultValue={a.palabra_aptitud ?? "Elegible"}>
            <option value="Elegible">Elegible / No elegible</option>
            <option value="Apto">Apto / No apto</option>
            <option value="Recomendable">Recomendable / No recomendable</option>
          </CampoSelect>
          <Campo id="titulo_constancia" etiqueta="Título de la constancia" ayuda="Vacío: se usa «Constancia de Aptitud»." defaultValue={a.titulo_constancia ?? "Constancia de Aptitud"} />
          <CampoTexto id="observacion_idoneidad" etiqueta="Nota de idoneidad (pie de la constancia; vacío para no imprimirla)" rows={2} className="sm:col-span-2" defaultValue={a.observacion_idoneidad ?? NOTA_IDONEIDAD} />
          <div className="space-y-2 sm:col-span-2">
            <Casilla id="constancia_copia" etiqueta="Constancia con copia para el servicio médico (2 hojas)" defecto={a.constancia_copia ?? false} />
            <Casilla id="firma_paciente_constancia" etiqueta="Espacio de firma del trabajador" defecto={a.firma_paciente_constancia ?? false} />
          </div>
        </Grupo>
        <Grupo titulo="Firmas en todos los documentos">
          <div className="space-y-2 sm:col-span-2">
            <Casilla id="firma_medico_ocupacional" etiqueta="Espacio de firma del médico ocupacional" defecto={a.firma_medico_ocupacional ?? true} />
            <Casilla id="firma_sello_separados" etiqueta="Firma y sello del médico en casillas separadas" defecto={a.firma_sello_separados ?? true} />
          </div>
        </Grupo>
        <Grupo titulo="Informe de consulta, historia y autorización pre-empleo">
          <CampoTexto id="certificacion_trabajador" etiqueta="Certificación del trabajador (vacío para no imprimirla)" rows={3} className="sm:col-span-2" defaultValue={a.certificacion_trabajador ?? CERTIFICACION_TRABAJADOR} />
          <CampoTexto id="nota_riesgos_puesto" etiqueta="Nota en letra pequeña debajo de los riesgos del puesto (también en constancia y orden)" rows={3} className="sm:col-span-2" defaultValue={a.nota_riesgos_puesto ?? NOTA_RIESGOS_PUESTO} />
        </Grupo>
        <Grupo titulo="Orden de exámenes">
          <Campo id="orden_nota" etiqueta="Nota al pie (ej. ayuno de 8 horas, laboratorio convenido)" defaultValue={a.orden_nota ?? ""} className="sm:col-span-2" />
          <CampoTexto id="orden_nota_preempleo" etiqueta="Nota de la autorización pre-empleo (vacío para no imprimirla)" rows={2} className="sm:col-span-2" defaultValue={a.orden_nota_preempleo ?? NOTA_PREEMPLEO_VIH} />
        </Grupo>
        <Grupo titulo="Reposo médico">
          <Campo id="reposo_pie_original" etiqueta="Pie del original" ayuda="Vacío: se usa «Original · RR. HH.»." defaultValue={a.reposo_pie_original ?? "ORIGINAL RECURSOS HUMANOS"} />
          <Campo id="reposo_pie_copia" etiqueta="Pie de la copia" ayuda="Vacío: se usa «Copia · Servicio médico»." defaultValue={a.reposo_pie_copia ?? "COPIA SERVICIO MÉDICO"} />
        </Grupo>
        <Grupo titulo="Certificado de salud">
          <Campo id="certificado_titulo" etiqueta="Título" ayuda="Vacío: se usa «Certificado de salud»." defaultValue={a.certificado_titulo ?? "Certificado de salud"} />
          <CampoTexto id="certificado_nota" etiqueta="Nota legal al pie (vacío para no imprimirla)" rows={2} className="sm:col-span-2" defaultValue={a.certificado_nota ?? NOTA_CERTIFICADO_SACS} />
        </Grupo>
        <Grupo titulo="Nota de cobro y recibo">
          <CampoTexto id="cobro_condiciones" etiqueta="Condiciones de pago (vacío para no imprimirlas)" rows={2} className="sm:col-span-2" defaultValue={a.cobro_condiciones ?? CONDICION_PAGO_BCV} />
          <CampoTexto id="cobro_datos_pago" etiqueta="Datos para el pago (cuentas y pago móvil; una por línea)" rows={6} className="sm:col-span-2" defaultValue={a.cobro_datos_pago ?? ""}
            placeholder={"Mercantil, cuenta corriente 0105-…, V-…, Nombre\nPago móvil: 0102 (Venezuela) · cédula · teléfono"} />
          <CampoTexto id="factura_datos_pago" etiqueta="Datos para el pago en la factura del talonario (vacío = no salen)" rows={3} className="sm:col-span-2" defaultValue={a.factura_datos_pago ?? ""} />
        </Grupo>
        <Grupo titulo="Informe de vigilancia epidemiológica">
          <CampoSelect id="vigilancia_poblacion" etiqueta="Población que cuenta" defaultValue={a.vigilancia_poblacion ?? "efectivos"}
            ayuda="«Efectivos» son los tipos de paciente marcados en Configuración › Listas › Tipos de paciente. Motivo y tipo de paciente siempre cuentan a todos.">
            <option value="efectivos">Solo trabajadores efectivos (como el SAME)</option>
            <option value="todos">Todos los pacientes de la empresa (también aspirantes y visitantes)</option>
          </CampoSelect>
          <CampoSelect id="vigilancia_horas" etiqueta="Horas hombre para IFN, IFB, IS, TAEO y TIEO" defaultValue={a.vigilancia_horas ?? "same"}
            ayuda="Según nómina: las horas por mes se cargan en la ficha de cada empresa; si faltan, se estiman con trabajadores × 8 h × días hábiles (COVENIN 474).">
            <option value="same">Fórmula del SAME: trabajadores × 5,5 h × días del período</option>
            <option value="nomina">Horas cargadas de la nómina</option>
          </CampoSelect>
        </Grupo>
      </div>
    </>
  );
}

function PasoPlazos({ a }: { a: Ajustes }) {
  return (
    <>
      <p className="text-sm text-muted-foreground">Cuándo vence cada examen y cuándo te avisa zamorApp. Ningún aviso impide guardar.</p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Campo id="meses_examen_periodico" etiqueta="Vigencia del examen periódico (meses)" type="number" min={1} max={36} defaultValue={a.meses_examen_periodico ?? 12} />
        <Campo id="dias_aviso_fecha_futura" etiqueta="Avisar si la fecha de la evaluación va más de estos días adelante" ayuda="Solo avisa, no impide guardar." type="number" min={1} max={3650} defaultValue={a.dias_aviso_fecha_futura ?? 90} />
        <Campo id="recordatorio_resultados_dias" etiqueta="Recordar resultados pendientes cada (días)" ayuda="0 = no recordar." type="number" min={0} max={30} defaultValue={a.recordatorio_resultados_dias ?? 3} />
      </div>
      <div className="space-y-1">
        <Casilla id="centinela_correo" etiqueta="Avisar por correo los plazos legales (declaración ante el INPSASEL, informe NT-02, investigación del accidente)" defecto={a.centinela_correo ?? false} />
        <p className="pl-6 text-xs text-muted-foreground">Viene apagado. Llega al personal de salud y SST de cada empresa con el número de evento, la empresa y el plazo: nunca el nombre del trabajador ni el diagnóstico. Sale cuando un administrador o gerente médico abre zamorApp. La campana avisa siempre.</p>
      </div>
    </>
  );
}

function PasoPrivacidad({ a }: { a: Ajustes }) {
  return (
    <>
      <p className="text-sm text-muted-foreground">Protege la entrada a zamorApp y la identidad de los trabajadores en lo que ve la empresa.</p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Campo id="dias_equipo_confianza" etiqueta="Pedir el código de dos pasos cada (días)" ayuda="En un equipo de confianza. 0 = en cada entrada." type="number" min={0} max={90} defaultValue={a.dias_equipo_confianza ?? 30} />
        <Campo id="celda_minima_empresa" etiqueta="En la vigilancia que se envía a la empresa, ocultar cifras menores de" ayuda="En empresas pequeñas se ve «<3» en vez del número. 0 = mostrar todas." type="number" min={0} max={10} defaultValue={a.celda_minima_empresa ?? 3} />
      </div>
    </>
  );
}

function PasoMensajes({ a }: { a: Ajustes }) {
  return (
    <>
      <p className="text-sm text-muted-foreground">{"Se abren en tu WhatsApp o tu correo listos para enviar. Campos que se reemplazan: {nombre}, {cedula}, {fecha}, {hora}, {motivo}, {empresa}, {servicio}, {aptitud}, {observacion}."}</p>
      <div className="grid gap-4">
        <CampoTexto id="mensaje_cita" etiqueta="Recordatorio de cita (al trabajador)" rows={3} defaultValue={a.mensaje_cita ?? PLANTILLA_CITA} />
        <CampoTexto id="mensaje_aptitud" etiqueta="Resultado de aptitud (a RR. HH. de la empresa)" rows={3} defaultValue={a.mensaje_aptitud ?? PLANTILLA_APTITUD} />
        {/* Invitación de RR. HH.: «Le invita el Dr. …» en la página del enlace y en el WhatsApp */}
        <Campo id="invita_como" etiqueta="Quién invita a RR. HH. (se lee «Le invita …»)" defaultValue={a.invita_como ?? ""} maxLength={120} placeholder="el Dr. Nombre Apellido" />
      </div>
    </>
  );
}

// El membrete muestra la dirección en dos líneas como máximo: pasada esa longitud se corta en los impresos
const DIRECCION_MAX = 140;
function CampoDireccion({ defaultValue }: { defaultValue: string }) {
  const [largo, setLargo] = useState(defaultValue.length);
  return (
    <Campo
      id="direccion"
      etiqueta="Dirección"
      defaultValue={defaultValue}
      onChange={(e) => setLargo(e.target.value.length)}
      ayuda={largo > DIRECCION_MAX ? `Tiene ${largo} caracteres: en el membrete solo caben unos ${DIRECCION_MAX} (dos líneas). Abrévialo para que se vea completo.` : undefined}
    />
  );
}
