"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Accessibility, AlertTriangle, Check, CheckCircle2, ChevronLeft, ChevronRight, CopyPlus, FlaskConical, HardHat, Loader2, Lock, MoreHorizontal, Plus, Printer, RotateCcw, Save, Trash2, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  clasificarImc,
  type DatosConsulta,
  type Diagnostico,
  diasSolapados,
  llenarModelo,
  ETIQUETA_ESTADO_CONSULTA,
  ETIQUETA_ORIGEN,
  type FilaExamen,
  imc,
  type Medicamento,
  type Origen,
  taAlterada,
} from "@/lib/consultas-tipos";
import type { Item } from "@/lib/listas";
import { ESTILO_APTITUD, GRUPOS_RIESGO, type Aptitud } from "@/lib/pacientes";
import { cn } from "@/lib/utils";
import { corregirConsulta, duplicarConsulta, firmarConsulta, guardarConsulta, guardarResultados, noRecordarResultados, reabrirConsulta } from "../acciones";
import type { HistorialConsulta, VersionConsulta } from "@/lib/consultas";
import { MenuImprimir } from "@/components/app/menu-imprimir";
import { enlaceCorreo, enlaceWhatsApp, llenar } from "@/lib/mensajes";
import type { Adjunto } from "@/lib/adjuntos-tipos";
import { contarResultados } from "@/lib/paraclinicos";
import { perfilesSugeridos } from "@/lib/perfiles-paraclinicos";
import { ParaclinicosDigitales, type ModoParaclinicos } from "./paraclinicos";
import { Antecedentes } from "./antecedentes";
import { aplicarPerfilExamen, aplicarPerfilParaclinicos, etiquetaMedicina, examenesDePerfil, indicacionPreestablecida } from "./perfiles";
import { BuscadorDiagnostico } from "./buscador-diagnostico";
import { AvisoDeclaracion } from "./aviso-declaracion";
import type { DeclaracionConsulta } from "../../accidentes/acciones";
import { reglasDeListas } from "@/lib/declaracion";
import { TextosFrecuentes } from "./textos-frecuentes";
import { confirmar } from "@/components/app/confirmar";
import { TextoDictado } from "./dictado";
import { Evolucion } from "./evolucion";
import { RegistrarAccidente } from "./registrar-accidente";
import { aplicarPlantilla, resumenPlantilla, type Plantilla } from "@/lib/plantillas";
import { sumarDias } from "@/lib/fecha";

type Props = {
  inicial: DatosConsulta;
  trabajador: { id: string; nombre: string; cedula: string; empresaId: string | null; edad: number | null; sexo: string | null; empresa: string; cargo: string; riesgos: Record<string, string[]> };
  medico: string | null;
  listas: Record<string, Item[]>;
  adjuntos: { orgId: string; lista: Adjunto[] } | null;
  envio: { servicio: string; plantilla: string; telefono: string | null; correo: string | null };
  puedeFirmar: boolean;
  versiones: VersionConsulta[];
  historial: HistorialConsulta;
  plantillas: Plantilla[];
  nueva: boolean;
  pasoInicial?: string;
  declaraciones: DeclaracionConsulta[];
};

const CONFIRMAR_FIRMA = {
  titulo: "¿Firmar la consulta?",
  texto: "Al firmarla queda bloqueada y no se borra. Si después encuentras un error, podrás corregirla indicando el motivo: la versión firmada queda guardada en el historial.",
  accion: "Firmar",
};
const fechaHora = (iso: string) => new Intl.DateTimeFormat("es-VE", { dateStyle: "short", timeStyle: "short", timeZone: "America/Caracas" }).format(new Date(iso));

const SELECT = "h-10 w-full rounded-md border bg-transparent px-3 text-sm disabled:opacity-60";
const APTITUDES: Aptitud[] = ["elegible", "elegible_con_restricciones", "no_elegible", "espera_resultados", "diferido"];

function Seccion({ titulo, children, accion }: { titulo: string; children: React.ReactNode; accion?: React.ReactNode }) {
  return (
    <Card className="gap-4">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">{titulo}</CardTitle>
        {accion}
      </CardHeader>
      <CardContent className="space-y-4">{children}</CardContent>
    </Card>
  );
}

// Campo de texto largo con dictado por voz
function Texto({ etiqueta, valor, onChange, filas = 3, placeholder }: { etiqueta: string; valor: string; onChange: (v: string) => void; filas?: number; placeholder?: string }) {
  return <TextoDictado id={`texto-${etiqueta}`} etiqueta={etiqueta} valor={valor} onChange={onChange} filas={filas} placeholder={placeholder} />;
}

// Días del rango [desde, hasta] que caen en los últimos 12 meses antes de «hoy»
const diasUltimoAnio = (r: { desde: string; hasta: string }, hoy: string) =>
  diasSolapados(r, { desde: sumarDias(hoy, -364), hasta: hoy });

// Botón de examen normal (perfil con código "normal") y menú con los demás perfiles
function AccionesExamen({ perfiles, etiquetaNormal, onAplicar }: { perfiles: Item[]; etiquetaNormal: string; onAplicar: (texto: string, comoNormal: boolean) => void }) {
  const normal = perfiles.find((p) => p.codigo === "normal");
  const otros = perfiles.filter((p) => p !== normal);
  return (
    <div className="flex items-center gap-2">
      {normal?.texto && (
        <Button type="button" size="sm" variant="outline" className="h-8 border-ok/50 text-ok-texto hover:bg-ok/10 hover:text-ok-texto" onClick={() => onAplicar(normal.texto!, true)}>
          <CheckCircle2 /> {etiquetaNormal}
        </Button>
      )}
      <ElegirPerfil items={otros} onElegir={(t) => onAplicar(t, false)} />
    </div>
  );
}

function ElegirPerfil({ items, onElegir }: { items: Item[]; onElegir: (texto: string) => void }) {
  if (!items.length) return null;
  return (
    <select
      value=""
      onChange={(e) => {
        const it = items.find((i) => i.id === e.target.value);
        if (it?.texto) onElegir(it.texto);
      }}
      className="h-8 max-w-48 rounded-md border bg-transparent px-2 text-xs"
    >
      <option value="">Aplicar perfil…</option>
      {items.map((i) => <option key={i.id} value={i.id}>{i.nombre}</option>)}
    </select>
  );
}

function TablaExamen({ filas, onChange, bloqueado }: { filas: FilaExamen[]; onChange: (f: FilaExamen[]) => void; bloqueado: boolean }) {
  if (!filas.length) return <p className="text-sm text-muted-foreground">Sin plantilla. Agrégala en Configuración › Listas.</p>;
  return (
    <div className="divide-y rounded-lg border">
      {filas.map((f, i) => {
        const alterado = f.valor.trim() !== f.normal.trim();
        return (
          <div key={f.clave} className={cn("grid grid-cols-[8.5rem_minmax(0,1fr)_auto] items-start gap-3 px-3 py-1.5", alterado && "bg-aviso/10")}>
            <span className="pt-1.5 text-sm">{f.nombre}</span>
            <textarea
              rows={1}
              value={f.valor}
              disabled={bloqueado}
              onChange={(e) => onChange(filas.map((x, j) => (j === i ? { ...x, valor: e.target.value } : x)))}
              className={cn("field-sizing-content min-h-8 w-full resize-none rounded border-0 bg-transparent px-2 py-1.5 text-sm leading-snug outline-none focus:bg-card focus:ring-1 focus:ring-primary", alterado && "font-medium")}
            />
            {alterado ? (
              <button type="button" disabled={bloqueado} title="Volver a normal" className="pt-2 text-muted-foreground hover:text-foreground" onClick={() => onChange(filas.map((x, j) => (j === i ? { ...x, valor: x.normal } : x)))}>
                <RotateCcw className="size-3.5" />
              </button>
            ) : <span className="size-3.5" />}
          </div>
        );
      })}
    </div>
  );
}

// Plantilla activa del motivo elegido (se busca por el código del motivo: PRE, PER, EGR, REI…)
function plantillaPara(plantillas: Plantilla[], listas: Record<string, Item[]>, motivoId: string | null) {
  const codigo = listas.motivo_consulta?.find((m) => m.id === motivoId)?.codigo;
  return codigo ? plantillas.find((p) => p.motivo === codigo && p.activo) ?? null : null;
}

export function EditorConsulta({ inicial, trabajador, medico, listas, adjuntos, envio, puedeFirmar, versiones, historial, plantillas, nueva, pasoInicial, declaraciones }: Props) {
  const router = useRouter();
  // Consulta nueva con motivo ya elegido (p. ej. desde la cita): se precarga la plantilla de ese motivo
  const plantillaInicial = nueva && inicial.estado === "borrador" ? plantillaPara(plantillas, listas, inicial.motivoId) : null;
  const [precarga] = useState(() => (plantillaInicial ? aplicarPlantilla(inicial, plantillaInicial.datos, listas) : inicial));
  const [d, setD] = useState<DatosConsulta>(precarga);
  const [guardado, setGuardado] = useState(JSON.stringify(inicial));
  const [aviso, setAviso] = useState<{ ok: boolean; mensaje: string } | null>(null);
  const [guardando, iniciar] = useTransition();
  const [verTodo, setVerTodo] = useState(false);
  const [paso, setPaso] = useState(pasoInicial ?? "generales");
  // Corregir una consulta firmada: motivo obligatorio (lo exige también reabrir_consulta en la base)
  const [corrigiendo, setCorrigiendo] = useState(false);
  const [motivoCorreccion, setMotivoCorreccion] = useState("");
  const [ignorarPendientes, setIgnorarPendientes] = useState(false);
  const [ignorarPerfil, setIgnorarPerfil] = useState(false);
  const [accidente, setAccidente] = useState(false);
  // Avisos que el médico decidió ignorar en esta consulta (no bloquean nada)
  const [ignorados, setIgnorados] = useState<string[]>([]);
  // Última plantilla aplicada, con la consulta como estaba antes para poder deshacer
  // (despues: lo que dejó la plantilla; si el médico no tocó nada más, cambiar de motivo parte de «antes»)
  const [deshacer, setDeshacer] = useState<{ nombre: string; antes: DatosConsulta; despues: DatosConsulta } | null>(
    () => (plantillaInicial ? { nombre: plantillaInicial.nombre, antes: inicial, despues: precarga } : null));

  const bloqueado = d.estado !== "borrador";
  const cambios = JSON.stringify(d) !== guardado;
  const set = <K extends keyof DatosConsulta>(k: K, v: DatosConsulta[K]) => setD((x) => ({ ...x, [k]: v }));

  const motivo = listas.motivo_consulta.find((m) => m.id === d.motivoId);
  const plantilla = plantillaPara(plantillas, listas, d.motivoId);
  // Aplica la plantilla sobre lo escrito (no borra nada) y deja «Deshacer» con la consulta como estaba
  const usarPlantilla = (p: Plantilla, base: DatosConsulta) => {
    const despues = aplicarPlantilla(base, p.datos, listas);
    setDeshacer({ nombre: p.nombre, antes: base, despues });
    setD(despues);
  };
  // Deshace directo si nada cambió desde la plantilla; si el médico siguió escribiendo, lo confirma antes
  const deshacerPlantilla = async () => {
    if (!deshacer) return;
    if (deshacer.despues !== d && !(await confirmar({
      titulo: "¿Deshacer la plantilla?",
      texto: "La consulta vuelve a como estaba antes de aplicarla: también se pierde lo que escribiste después.",
      accion: "Deshacer",
    }))) return;
    setD({ ...deshacer.antes, motivoId: d.motivoId });
    setDeshacer(null);
  };
  const cambiarMotivo = (motivoId: string | null) => {
    // Si la plantilla anterior quedó intacta, se quita antes de poner la del motivo nuevo (no se acumulan)
    const intacta = deshacer && deshacer.despues === d;
    const base = { ...(intacta ? deshacer.antes : d), motivoId };
    const p = plantillaPara(plantillas, listas, motivoId);
    if (p && !bloqueado) usarPlantilla(p, base);
    else { setD(base); if (intacta) setDeshacer(null); }
  };
  const preventivo = motivo?.grupo === "preventivo";
  const mostrarTratamiento = !preventivo || verTodo || d.tratamiento.length > 0 || d.reposo.activo;
  const etiquetaAptitud = (a: Aptitud) => listas.clasificacion_aptitud.find((i) => i.codigo === a)?.nombre ?? a;

  // Pasos de la consulta; "hecho" marca con ✓ los que ya tienen información
  const pasos = [
    { id: "generales", titulo: "Generales", hecho: Boolean(d.motivoId) },
    { id: "antecedentes", titulo: "Antecedentes", hecho: d.antecedentes.length > 0 || d.habitos.some((h) => h.valor) },
    { id: "examen", titulo: "Examen", hecho: Boolean(d.signos.ta || d.signos.peso) },
    { id: "paraclinicos", titulo: d.paraclinicos.length ? `Paraclínicos (${d.paraclinicos.length})` : "Paraclínicos", hecho: d.paraclinicos.length > 0 && contarResultados(d.paraclinicos).pendientes === 0 },
    { id: "diagnostico", titulo: d.sano ? "Diagnóstico · sano" : d.diagnosticos.length ? `Diagnóstico (${d.diagnosticos.length})` : "Diagnóstico", hecho: d.sano || d.diagnosticos.length > 0 },
    { id: "aptitud", titulo: "Aptitud", hecho: Boolean(d.aptitud.clasificacion) },
    ...(mostrarTratamiento ? [{ id: "tratamiento", titulo: "Tratamiento y reposo", hecho: d.tratamiento.length > 0 || d.reposo.activo }] : []),
    { id: "conclusiones", titulo: "Conclusiones", hecho: Boolean(d.conclusiones || d.recomendacionesTrabajador || d.recomendacionesEmpresa) },
  ];
  const indicePaso = Math.max(0, pasos.findIndex((p) => p.id === paso));
  const irA = (i: number) => { setPaso(pasos[i].id); window.scrollTo({ top: 0, behavior: "smooth" }); };

  const valorImc = imc(d.signos.peso, d.signos.talla);
  const claseImc = clasificarImc(valorImc);

  // Reposos de otras consultas que se cruzan con el de esta (aviso, no bloquea)
  const solapados = d.reposo.activo && d.reposo.hasta >= d.reposo.desde
    ? historial.reposos.map((r) => ({ ...r, dias: diasSolapados(r, d.reposo) })).filter((r) => r.dias > 0)
    : [];
  const claveSolape = `reposo:${d.reposo.desde}:${d.reposo.hasta}`;
  const avisoSolape = solapados.length > 0 && !ignorados.includes(claveSolape);

  // Potencial discapacidad: criterios que ya muestra el reporte (reposo ≥ 90 días en 12 meses, discapacidad
  // registrada, no elegible o con restricciones, diagnóstico ocupacional) para que el médico decida
  const diasReposoAnio = historial.reposos.filter((r) => !["prenatal", "postnatal", "paternidad", "lactancia"].includes(r.causa))
    .reduce((t, r) => t + diasUltimoAnio(r, d.fecha), 0)
    + (d.reposo.activo && !["prenatal", "postnatal", "paternidad", "lactancia"].includes(d.reposo.causa) ? diasUltimoAnio(d.reposo, d.fecha) : 0);
  const criteriosDiscapacidad = [
    historial.discapacidadRegistrada && "Discapacidad registrada en su ficha",
    diasReposoAnio >= 90 && `${diasReposoAnio} días de reposo en los últimos 12 meses`,
    d.aptitud.clasificacion === "no_elegible" && "Aptitud: no elegible",
    d.aptitud.clasificacion === "elegible_con_restricciones" && "Aptitud: con restricciones",
    d.diagnosticos.some((x) => x.origen === "ocupacional" || x.origen === "accidente_laboral") && "Diagnóstico de origen ocupacional",
  ].filter(Boolean) as string[];

  // Modelo de informe libre: llena {nombre}, {cedula}… con los datos de esta consulta
  const aplicarModelo = async (it: Item) => {
    if (d.informeLibre.cuerpo.trim() && !(await confirmar({ titulo: "¿Reemplazar el contenido?", texto: "El informe libre ya tiene texto. El modelo lo reemplaza.", accion: "Reemplazar" }))) return;
    const diagnostico = d.sano ? "trabajador sano" : d.diagnosticos.filter((x) => x.descripcion.trim()).map((x) => (x.cie10 ? `${x.descripcion} (${x.cie10})` : x.descripcion)).join("; ");
    const campos = { nombre: trabajador.nombre, cedula: trabajador.cedula, edad: trabajador.edad?.toString() ?? "", empresa: trabajador.empresa, cargo: trabajador.cargo,
      fecha: d.fecha.split("-").reverse().join("/"), diagnostico, medico: medico ?? "" };
    set("informeLibre", { titulo: d.informeLibre.titulo || it.nombre, dirigidoA: d.informeLibre.dirigidoA, cuerpo: llenarModelo(it.texto ?? "", campos) });
  };

  const duplicar = async () => {
    if (!(await confirmar({ titulo: "¿Duplicar la consulta?", texto: "Se crea un borrador nuevo con fecha de hoy y los mismos datos, sin firma ni cierre. No se copian los signos vitales, los resultados de exámenes, la aptitud ni el reposo.", accion: "Duplicar" }))) return;
    iniciar(async () => {
      if (cambios && !bloqueado) {
        const g = await guardarConsulta(d, false);
        if (!g.ok) return setAviso(g);
        setGuardado(JSON.stringify(d));
      }
      const r = await duplicarConsulta(d.id);
      setAviso(r);
      if (r.ok && r.id) router.push(`/atencion/${r.id}`);
    });
  };

  const guardar = useCallback(
    (cerrar: boolean) =>
      iniciar(async () => {
        const r = await guardarConsulta(d, cerrar);
        setAviso(r);
        if (r.ok) {
          const nuevo = cerrar ? { ...d, estado: "cerrada" as const } : d;
          setD(nuevo);
          setGuardado(JSON.stringify(nuevo));
        }
      }),
    [d],
  );

  // Un clic: cierra (guardar_consulta con p_cerrar), firma y abre todos los documentos de la consulta en una sola impresión
  const firmarEImprimir = async () => {
    if (!(await confirmar({ ...CONFIRMAR_FIRMA, accion: "Firmar e imprimir" }))) return;
    iniciar(async () => {
      if (d.estado === "borrador") {
        const g = await guardarConsulta(d, true);
        if (!g.ok) return setAviso(g);
        setGuardado(JSON.stringify({ ...d, estado: "cerrada" }));
      }
      const r = await firmarConsulta(d.id);
      setAviso(r);
      if (!r.ok) return setD((x) => ({ ...x, estado: "cerrada" }));
      setD((x) => ({ ...x, estado: "firmada" }));
      router.push(`/imprimir/paquete/${d.id}`);
    });
  };

  // Menú Imprimir: con cambios sin guardar, guarda primero para que el documento salga con lo que se ve en pantalla
  const guardarAntes = async () => {
    const r = await guardarConsulta(d, false);
    setAviso(r);
    if (r.ok) setGuardado(JSON.stringify(d));
    return r.ok;
  };
  // Paraclínicos: con la consulta cerrada solo se escriben resultados (guardar_resultados); firmada, solo lectura
  const modoParaclinicos: ModoParaclinicos = d.estado === "borrador" ? "editar" : d.estado === "cerrada" ? "resultados" : "lectura";
  const resultadosSinGuardar = JSON.stringify(d.paraclinicos) !== JSON.stringify((JSON.parse(guardado) as DatosConsulta).paraclinicos);
  const guardarSoloResultados = () =>
    iniciar(async () => {
      const r = await guardarResultados(d.id, d.paraclinicos);
      setAviso(r);
      if (r.ok) setGuardado(JSON.stringify(d));
    });
  const pendientesResultado = contarResultados(d.paraclinicos).pendientes;

  const menuImprimir = (variante: "default" | "outline") => (
    <MenuImprimir
      consultaId={d.id}
      aptitud={Boolean(d.aptitud.clasificacion)}
      reposo={d.reposo.activo}
      tratamiento={d.tratamiento.some((m) => m.medicina)}
      examenes={d.paraclinicos.length > 0}
      referencias={d.interconsultas.some((x) => x.especialidad)}
      reubicacion={d.reubicacion.activa}
      informeLibre={Boolean(d.informeLibre.cuerpo.trim())}
      preoperatoria={/preoper/i.test(motivo?.nombre ?? "")}
      anexos={Boolean(adjuntos)}
      antes={cambios && !bloqueado ? guardarAntes : undefined}
      ocupado={guardando}
      variante={variante}
    />
  );

  // Ctrl+S guarda; avisa antes de salir con cambios sin guardar
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (!bloqueado) guardar(false);
      }
    };
    const salir = (e: BeforeUnloadEvent) => {
      if (cambios) e.preventDefault();
    };
    window.addEventListener("keydown", tecla);
    window.addEventListener("beforeunload", salir);
    return () => {
      window.removeEventListener("keydown", tecla);
      window.removeEventListener("beforeunload", salir);
    };
  }, [guardar, bloqueado, cambios]);

  const gruposParaclinicos = useMemo(() => {
    const g = new Map<string, Item[]>();
    for (const p of listas.paraclinico) g.set(p.grupo ?? "Otros", [...(g.get(p.grupo ?? "Otros") ?? []), p]);
    return [...g.entries()];
  }, [listas.paraclinico]);

  const reglasDeclaracion = useMemo(() => reglasDeListas(listas), [listas]);

  // Perfiles de paraclínicos de la empresa y el tipo de examen de esta consulta
  const sugeridos = useMemo(
    () => perfilesSugeridos(listas.grupo_paraclinicos, { empresaId: trabajador.empresaId, empresa: trabajador.empresa, motivoId: d.motivoId }),
    [listas.grupo_paraclinicos, trabajador.empresaId, trabajador.empresa, d.motivoId],
  );
  const faltanDePerfil = (pf: Item) => aplicarPerfilParaclinicos(d.paraclinicos, pf.texto ?? "", listas.paraclinico).slice(d.paraclinicos.length);
  const perfilPropuesto = sugeridos.find((pf) => faltanDePerfil(pf).length > 0);

  const actualizarDiag = (i: number, cambio: Partial<Diagnostico>) =>
    set("diagnosticos", d.diagnosticos.map((x, j) => (j === i ? { ...x, ...cambio } : x)));
  const actualizarMed = (i: number, cambio: Partial<Medicamento>) =>
    set("tratamiento", d.tratamiento.map((x, j) => (j === i ? { ...x, ...cambio } : x)));

  return (
    <Tabs value={pasos[indicePaso].id} onValueChange={setPaso} className="gap-4">
      {/* Cabecera fija con el paciente, las acciones y los pasos */}
      <div className="z-10 -mx-4 border-b bg-background/95 px-4 pt-3 lg:sticky lg:top-16 backdrop-blur sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <div className="grid size-10 shrink-0 sm:size-11 place-items-center rounded-full bg-primary text-base font-semibold text-primary-foreground">
            {trabajador.nombre.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join("").toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <Link href={`/pacientes/${trabajador.id}`} className="text-lg font-semibold hover:text-primary">{trabajador.nombre}</Link>
            <p className="truncate text-sm text-muted-foreground">
              {d.aptitud.clasificacion && (
                <span className={cn("mr-2 rounded-full px-2 py-0.5 text-xs font-medium", ESTILO_APTITUD[d.aptitud.clasificacion])}>{etiquetaAptitud(d.aptitud.clasificacion)}</span>
              )}
              {trabajador.cedula}{trabajador.edad !== null && ` · ${trabajador.edad} años`}{trabajador.sexo && ` · ${trabajador.sexo}`} · {[trabajador.cargo, trabajador.empresa].filter(Boolean).join(" · ")}
            </p>
          </div>
          <div className="text-right text-xs text-muted-foreground">
            <div>{ETIQUETA_ESTADO_CONSULTA[d.estado]} · {d.fecha.split("-").reverse().join("/")}</div>
            {medico && <div>{medico}</div>}
          </div>
          {d.estado === "firmada" ? (
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1.5 text-sm font-medium text-primary"><Lock className="size-4" /> Firmada</span>
              {menuImprimir("default")}
              {puedeFirmar && !corrigiendo && (
                <Button variant="outline" onClick={() => setCorrigiendo(true)} disabled={guardando}><RotateCcw /> Corregir</Button>
              )}
            </div>
          ) : bloqueado ? (
            <div className="flex flex-wrap gap-2">
              {menuImprimir("outline")}
              <Button variant="outline" onClick={() => iniciar(async () => { const r = await reabrirConsulta(d.id); setAviso(r); if (r.ok) setD({ ...d, estado: "borrador" }); })} disabled={guardando}>
                <Lock /> Reabrir
              </Button>
              {puedeFirmar && (
                <>
                  <Button variant="outline" onClick={async () => (await confirmar(CONFIRMAR_FIRMA)) && iniciar(async () => { const r = await firmarConsulta(d.id); setAviso(r); if (r.ok) setD({ ...d, estado: "firmada" }); })} disabled={guardando}>
                    <CheckCircle2 /> Firmar
                  </Button>
                  <Button onClick={firmarEImprimir} disabled={guardando}><Printer /> Firmar e imprimir</Button>
                </>
              )}
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {menuImprimir("outline")}
              <Button variant="outline" onClick={() => guardar(false)} disabled={guardando || !cambios}>
                {guardando ? <Loader2 className="animate-spin" /> : <Save />} {cambios ? "Guardar" : "Guardado"}
              </Button>
              <Button variant={puedeFirmar ? "outline" : "default"} onClick={() => guardar(true)} disabled={guardando}><CheckCircle2 /> Cerrar consulta</Button>
              {puedeFirmar && <Button onClick={firmarEImprimir} disabled={guardando}><Printer /> Cerrar, firmar e imprimir</Button>}
            </div>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon" aria-label="Más acciones" disabled={guardando}><MoreHorizontal /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-60">
              <DropdownMenuItem onSelect={duplicar}><CopyPlus /> Duplicar consulta</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setAccidente(true)}><HardHat /> Registrar accidente o enfermedad</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <RegistrarAccidente
          abierto={accidente}
          onAbierto={setAccidente}
          consultaId={d.id}
          trabajador={trabajador}
          tipoSugerido={d.diagnosticos.some((x) => x.origen === "ocupacional") && !d.diagnosticos.some((x) => x.origen === "accidente_laboral") ? "enfermedad" : "accidente"}
          descripcion={[d.motivoTexto, d.enfermedadActual, ...d.diagnosticos.filter((x) => x.descripcion.trim()).map((x) => `Dx: ${x.descripcion}${x.cie10 ? ` (${x.cie10})` : ""}`)].filter((x) => x.trim()).join("\n")}
        />
        {d.estado === "firmada" && corrigiendo && (
          <div className="mt-4 space-y-3 rounded-lg border border-aviso/40 bg-aviso/10 p-4">
            <p className="text-sm">
              <b>Corregir la consulta firmada.</b> La versión firmada se guarda tal cual en el historial (no se pierde ni se edita)
              y la consulta vuelve a borrador para que la corrijas, la cierres y la firmes de nuevo. Los impresos nuevos dirán
              «Revisión {d.revision + 1}» y reemplazan a los anteriores; si cambia la aptitud, la empresa recibe el aviso.
            </p>
            <Label htmlFor="motivo-correccion">Motivo de la corrección</Label>
            <Textarea id="motivo-correccion" value={motivoCorreccion} onChange={(e) => setMotivoCorreccion(e.target.value)}
              placeholder="Ej.: el diagnóstico correcto es sinusitis aguda, no rinofaringitis" rows={2} autoFocus />
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="ghost" onClick={() => { setCorrigiendo(false); setMotivoCorreccion(""); }} disabled={guardando}>Cancelar</Button>
              <Button
                disabled={guardando || motivoCorreccion.trim().length < 10}
                title={motivoCorreccion.trim().length < 10 ? "Escribe el motivo (al menos 10 caracteres)" : undefined}
                onClick={() => iniciar(async () => {
                  const r = await corregirConsulta(d.id, motivoCorreccion);
                  setAviso(r);
                  if (!r.ok) return;
                  const nuevo = { ...d, estado: "borrador" as const, revision: r.revision ?? d.revision + 1 };
                  setD(nuevo);
                  setGuardado(JSON.stringify(nuevo));
                  setCorrigiendo(false);
                  setMotivoCorreccion("");
                  // corregirConsulta invalida /atencion: su respuesta ya trae el historial de versiones al día
                })}
              >
                {guardando ? <Loader2 className="animate-spin" /> : <RotateCcw />} Abrir para corregir
              </Button>
            </div>
          </div>
        )}
        {versiones.length > 0 && (
          <details className="mt-3 rounded-lg border bg-muted/30 px-4 py-2 text-sm">
            <summary className="cursor-pointer font-medium">Revisión {d.revision} · {versiones.length} versión{versiones.length === 1 ? "" : "es"} firmada{versiones.length === 1 ? "" : "s"} anterior{versiones.length === 1 ? "" : "es"}</summary>
            <ul className="mt-2 space-y-1.5 pb-1">
              {versiones.map((v) => (
                <li key={v.revision} className="text-muted-foreground">
                  <span className="font-medium text-foreground">Revisión {v.revision}</span>
                  {v.firmadaEn && <> · firmada {fechaHora(v.firmadaEn)}</>} · corregida {fechaHora(v.reabiertaEn)} por {v.por}: «{v.motivo}»
                </li>
              ))}
            </ul>
          </details>
        )}
        {!cambios && d.aptitud.clasificacion && d.estado !== "borrador" && (() => {
          const texto = llenar(envio.plantilla, { nombre: trabajador.nombre, cedula: trabajador.cedula, fecha: d.fecha.split("-").reverse().join("/"), motivo: motivo?.nombre ?? "",
            empresa: trabajador.empresa, servicio: envio.servicio, aptitud: etiquetaAptitud(d.aptitud.clasificacion as Aptitud), observacion: d.aptitud.observacion ? " " + d.aptitud.observacion : "" });
          return (
            <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
              <span>Enviar resultado a RR. HH.:</span>
              <a href={enlaceWhatsApp(envio.telefono, texto)} target="_blank" rel="noreferrer" className="rounded-md border bg-card px-2 py-1 font-medium hover:border-primary/50 hover:text-primary">WhatsApp</a>
              <a href={enlaceCorreo(envio.correo, `Resultado de evaluación · ${trabajador.nombre}`, texto)} className="rounded-md border bg-card px-2 py-1 font-medium hover:border-primary/50 hover:text-primary">Correo</a>
            </div>
          );
        })()}
        {aviso?.mensaje && (
          <p className={cn("mt-2 text-sm", aviso.ok ? "text-ok-texto" : "text-destructive")}>{aviso.mensaje}</p>
        )}
        {/* Falta resultado: solo avisa, no impide cerrar ni firmar */}
        {pendientesResultado > 0 && d.estado !== "firmada" && !ignorarPendientes && paso !== "paraclinicos" && (
          <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg bg-aviso/15 px-3 py-2 text-sm">
            <FlaskConical className="size-4 text-aviso-texto" />
            <span className="min-w-0 flex-1">Faltan {pendientesResultado} resultado{pendientesResultado === 1 ? "" : "s"} de paraclínicos. Puedes cerrar y firmar igual; escríbelos cuando lleguen.</span>
            <Button size="sm" variant="outline" className="h-7" onClick={() => setPaso("paraclinicos")}>Ver exámenes</Button>
            <Button size="sm" variant="ghost" className="h-7" onClick={() => setIgnorarPendientes(true)}>Ignorar</Button>
            <Button size="sm" variant="ghost" className="h-7 text-muted-foreground" title="No volver a avisar en la campana por esta consulta"
              onClick={async () => { setIgnorarPendientes(true); setAviso(await noRecordarResultados(d.id)); }}>No recordar más</Button>
          </div>
        )}
        <TabsList className="-mb-px mt-3 flex h-auto w-full justify-start gap-1 overflow-x-auto overflow-y-hidden rounded-none [scrollbar-width:none] bg-transparent p-0">
          {pasos.map((p, i) => (
            <TabsTrigger
              key={p.id}
              value={p.id}
              className="group mb-2 h-9 flex-none gap-2 rounded-lg border-0 px-3 text-muted-foreground shadow-none hover:bg-muted data-[state=active]:bg-primary/10 data-[state=active]:font-semibold data-[state=active]:text-primary data-[state=active]:shadow-none"
            >
              <span className={cn(
                "grid size-5 place-items-center rounded-full border text-[11px] font-semibold",
                p.hecho ? "border-ok bg-ok text-white" : "group-data-[state=active]:border-primary group-data-[state=active]:text-primary",
              )}>
                {p.hecho ? <Check className="size-3" strokeWidth={3} /> : i + 1}
              </span>
              {p.titulo}
            </TabsTrigger>
          ))}
        </TabsList>
      </div>

      <fieldset disabled={bloqueado} className="contents">

          {/* ── Generales ── */}
          <TabsContent value="generales" className="mt-4 space-y-4">
            <Seccion titulo="Motivo">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
                <div>
                  <Label className="mb-1.5">Motivo de consulta *</Label>
                  <select value={d.motivoId ?? ""} onChange={(e) => cambiarMotivo(e.target.value || null)} className={SELECT}>
                    <option value="">Elige el motivo</option>
                    {["preventivo", "no_preventivo", null].map((g) => {
                      const items = listas.motivo_consulta.filter((m) => (m.grupo ?? null) === g || (g === null && m.grupo && !["preventivo", "no_preventivo"].includes(m.grupo)));
                      if (!items.length) return null;
                      return (
                        <optgroup key={g ?? "otros"} label={g === "preventivo" ? "Preventivos" : g === "no_preventivo" ? "No preventivos" : "Otros"}>
                          {items.map((m) => <option key={m.id} value={m.id}>{m.nombre}</option>)}
                        </optgroup>
                      );
                    })}
                  </select>
                </div>
                <div>
                  <Label className="mb-1.5">Tipo</Label>
                  <select value={d.tipo} onChange={(e) => set("tipo", e.target.value as DatosConsulta["tipo"])} className={SELECT}>
                    <option value="primera">Primera</option>
                    <option value="sucesiva">Sucesiva</option>
                    <option value="derivada">Derivada</option>
                  </select>
                </div>
              </div>
              {!bloqueado && deshacer ? (
                <div role="status" className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-sm">
                  <Wand2 className="size-4 shrink-0 text-primary" />
                  <span className="min-w-0 flex-1 basis-56">Plantilla de <b>{deshacer.nombre}</b> aplicada: revisa el examen, las recomendaciones y la vigencia.</span>
                  <Button type="button" size="sm" variant="ghost" className="h-7" onClick={deshacerPlantilla}>
                    <RotateCcw /> Deshacer
                  </Button>
                  <Button type="button" size="sm" variant="ghost" className="h-7 text-muted-foreground" onClick={() => setDeshacer(null)}>Listo</Button>
                </div>
              ) : !bloqueado && plantilla && (
                <Button type="button" size="sm" variant="outline" onClick={() => usarPlantilla(plantilla, d)} title={resumenPlantilla(plantilla.datos)}>
                  <Wand2 /> Aplicar plantilla de {plantilla.nombre}
                </Button>
              )}
              {preventivo ? (
                <p className="rounded-md bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
                  Evaluación de <b className="text-foreground">{motivo?.nombre}</b>: el motivo ya queda registrado y no requiere detalle.
                </p>
              ) : (
                <Texto etiqueta="Motivo (detalle)" valor={d.motivoTexto} onChange={(v) => set("motivoTexto", v)} filas={2} />
              )}
              {!preventivo && <Texto etiqueta="Enfermedad actual" valor={d.enfermedadActual} onChange={(v) => set("enfermedadActual", v)} filas={4} />}
            </Seccion>

            <Seccion titulo="Riesgos del puesto">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {GRUPOS_RIESGO.map(([k, n]) => (
                  <div key={k} className="flex flex-wrap items-baseline gap-2 text-sm">
                    <span className="w-28 text-muted-foreground">{n}</span>
                    {(trabajador.riesgos[k] ?? []).length
                      ? trabajador.riesgos[k].map((r) => <span key={r} className="rounded bg-muted px-2 py-0.5">{r}</span>)
                      : <span className="text-muted-foreground/60">—</span>}
                  </div>
                ))}
              </div>
            </Seccion>
          </TabsContent>

          {/* ── Antecedentes y hábitos ── */}
          <TabsContent value="antecedentes" className="mt-4 grid gap-4 lg:grid-cols-2">
            <Seccion titulo="Antecedentes médicos">
              <Antecedentes items={listas.antecedente_medico} valor={d.antecedentes} onChange={(v) => set("antecedentes", v)} />
            </Seccion>
            <Seccion titulo="Hábitos">
              <div className="space-y-2">
                {d.habitos.map((h, i) => (
                  <div key={h.clave} className="grid grid-cols-[9rem_minmax(0,1fr)] items-center gap-3">
                    <span className="text-sm">{h.nombre}</span>
                    <Input value={h.valor} className="h-8" placeholder="Niega" onChange={(e) => set("habitos", d.habitos.map((x, j) => (j === i ? { ...x, valor: e.target.value } : x)))} />
                  </div>
                ))}
              </div>
            </Seccion>
          </TabsContent>

          {/* ── Examen ── */}
          <TabsContent value="examen" className="mt-4 space-y-4">
            <Seccion titulo="Signos vitales y antropometría">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
                {([
                  ["ta", "TA (mmHg)", "120/80"], ["fc", "FC (lpm)", ""], ["fr", "FR (rpm)", ""], ["temp", "Temp (°C)", ""],
                  ["sat", "SatO₂ (%)", ""], ["peso", "Peso (kg)", ""], ["talla", "Talla (cm)", ""],
                ] as const).map(([k, n, ph]) => (
                  <div key={k}>
                    <Label className="mb-1.5 text-xs">{n}</Label>
                    <Input
                      value={d.signos[k] ?? ""}
                      placeholder={ph}
                      inputMode={k === "ta" ? "text" : "decimal"}
                      onChange={(e) => set("signos", { ...d.signos, [k]: e.target.value })}
                      className={cn("h-9", k === "ta" && taAlterada(d.signos.ta) && "border-alerta text-alerta-texto")}
                    />
                  </div>
                ))}
                <div>
                  <Label className="mb-1.5 text-xs">IMC</Label>
                  <div className={cn("flex h-9 items-center rounded-md border bg-muted/40 px-3 text-sm font-medium", claseImc?.alerta && "border-aviso text-aviso-texto")}>
                    {valorImc ?? "—"}
                  </div>
                  {claseImc && <p className={cn("mt-1 text-xs", claseImc.alerta ? "text-aviso-texto" : "text-muted-foreground")}>{claseImc.texto}</p>}
                </div>
              </div>
              {taAlterada(d.signos.ta) && (
                <p className="flex items-center gap-2 text-sm text-alerta-texto"><AlertTriangle className="size-4" /> Tensión arterial elevada.</p>
              )}
            </Seccion>
            <Evolucion previas={historial.mediciones} actual={d.signos} hoy={d.fecha} />
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <Seccion titulo="Examen funcional" accion={<AccionesExamen perfiles={listas.perfil_examen_funcional} etiquetaNormal="Funcional normal" onAplicar={(t, normal) => set("examenFuncional", aplicarPerfilExamen(d.examenFuncional, t, normal))} />}>
                <TablaExamen filas={d.examenFuncional} onChange={(f) => set("examenFuncional", f)} bloqueado={bloqueado} />
              </Seccion>
              <Seccion titulo="Examen físico" accion={<AccionesExamen perfiles={listas.perfil_examen_fisico} etiquetaNormal="Evaluación física normal" onAplicar={(t, normal) => set("examenFisico", aplicarPerfilExamen(d.examenFisico, t, normal))} />}>
                <TablaExamen filas={d.examenFisico} onChange={(f) => set("examenFisico", f)} bloqueado={bloqueado} />
              </Seccion>
            </div>
            <p className="text-xs text-muted-foreground">Precargado en normal: solo escribe lo que esté alterado. Las filas cambiadas se resaltan.</p>
          </TabsContent>

          {/* ── Paraclínicos ── */}
          <TabsContent value="paraclinicos" className="mt-4 space-y-4">
            {modoParaclinicos === "editar" && perfilPropuesto && !ignorarPerfil && (() => {
              const faltan = faltanDePerfil(perfilPropuesto);
              const total = examenesDePerfil(perfilPropuesto.texto).length;
              const nombres = faltan.map((p) => p.nombre).join(", ");
              return (
                <div className="flex flex-wrap items-center gap-3 rounded-xl border border-primary/30 bg-primary/5 px-4 py-3">
                  <FlaskConical className="size-5 shrink-0 text-primary" />
                  <div className="min-w-48 flex-1 text-sm">
                    <div className="font-medium">Perfil sugerido: {perfilPropuesto.nombre}</div>
                    <div className="truncate text-xs text-muted-foreground" title={nombres}>
                      {faltan.length === total ? `${total} exámenes: ${nombres}` : `Faltan ${faltan.length} de ${total}: ${nombres}`}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => set("paraclinicos", [...d.paraclinicos, ...faltan])}>
                      <Plus /> {faltan.length === total ? "Aplicar" : `Agregar ${faltan.length === 1 ? "el que falta" : `los ${faltan.length}`}`}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setIgnorarPerfil(true)}>Ignorar</Button>
                  </div>
                </div>
              );
            })()}
            {modoParaclinicos === "editar" && (
            <details open={d.paraclinicos.length === 0} className="group rounded-xl border bg-card">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-5 py-3 font-semibold">
                <span className="inline-flex items-center gap-2"><Plus className="size-4" /> Agregar exámenes</span>
                <span className="text-xs font-normal text-muted-foreground group-open:hidden">Perfiles y catálogo</span>
              </summary>
              <div className="space-y-4 border-t px-5 py-4">
              {listas.grupo_paraclinicos.length > 0 && (
                <div className="rounded-lg border bg-muted/30 p-3">
                  <div className="mb-2 text-sm font-medium">Perfiles</div>
                  <div className="flex flex-wrap gap-1.5">
                    {listas.grupo_paraclinicos.map((pf) => {
                      const sugerido = sugeridos.includes(pf);
                      return (
                        <button
                          key={pf.id}
                          type="button"
                          title={examenesDePerfil(pf.texto).join(", ")}
                          onClick={() => set("paraclinicos", aplicarPerfilParaclinicos(d.paraclinicos, pf.texto ?? "", listas.paraclinico))}
                          className={cn("inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs transition hover:border-primary", sugerido && "border-primary bg-primary/10 font-medium text-primary")}
                        >
                          <Plus className="size-3" /> {pf.nombre} <span className="text-muted-foreground">({examenesDePerfil(pf.texto).length})</span>
                        </button>
                      );
                    })}
                  </div>
                  {sugeridos.length > 0 && (
                    <p className="mt-2 text-xs text-primary">Resaltado: perfil de esta empresa o de este tipo de examen.</p>
                  )}
                </div>
              )}
              <div className="space-y-4">
                {gruposParaclinicos.map(([grupo, items]) => {
                  const todos = items.every((p) => d.paraclinicos.some((x) => x.id === p.id));
                  return (
                    <div key={grupo}>
                      <div className="mb-1.5 flex items-center justify-between">
                        <span className="text-sm font-medium">{grupo}</span>
                        <button
                          type="button"
                          className="text-xs text-primary hover:underline"
                          onClick={() =>
                            set("paraclinicos", todos
                              ? d.paraclinicos.filter((x) => !items.some((p) => p.id === x.id))
                              : [...d.paraclinicos, ...items.filter((p) => !d.paraclinicos.some((x) => x.id === p.id)).map((p) => ({ id: p.id, nombre: p.nombre, grupo: p.grupo, resultado: "" }))])
                          }
                        >
                          {todos ? "Quitar perfil" : "Agregar perfil"}
                        </button>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {items.map((p) => {
                          const activo = d.paraclinicos.some((x) => x.id === p.id);
                          return (
                            <button
                              key={p.id}
                              type="button"
                              onClick={() => set("paraclinicos", activo ? d.paraclinicos.filter((x) => x.id !== p.id) : [...d.paraclinicos, { id: p.id, nombre: p.nombre, grupo: p.grupo, resultado: "" }])}
                              className={cn("rounded-full border px-3 py-1 text-xs transition", activo ? "border-primary bg-primary text-primary-foreground" : "hover:border-primary/50")}
                            >
                              {p.nombre}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
              </div>
            </details>
            )}
            <ParaclinicosDigitales
              paraclinicos={d.paraclinicos}
              onChange={(p) => set("paraclinicos", p)}
              modo={modoParaclinicos}
              catalogo={listas.paraclinico}
              sexo={trabajador.sexo}
              archivos={adjuntos ? { orgId: adjuntos.orgId, trabajadorId: trabajador.id, consultaId: d.id, lista: adjuntos.lista } : null}
              asegurarGuardado={async () => (modoParaclinicos === "editar" && cambios ? guardarAntes() : true)}
              resultados={modoParaclinicos === "resultados" ? { sinGuardar: resultadosSinGuardar, guardando, guardar: guardarSoloResultados } : undefined}
            />
          </TabsContent>

          {/* ── Diagnóstico ── */}
          <TabsContent value="diagnostico" className="mt-4 space-y-4">
            <Card className={cn("gap-0 py-4", d.sano && "border-ok/50 bg-ok/5")}>
              <CardContent className="px-6">
                <label className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={d.sano}
                    onChange={async (e) => {
                      const sano = e.target.checked;
                      if (sano && d.diagnosticos.some((x) => x.descripcion.trim()) && !(await confirmar({ titulo: "¿Marcar como sano?", texto: "Se quitarán los diagnósticos que ya escribiste.", accion: "Marcar sano" }))) return;
                      setD((x) => ({
                        ...x,
                        sano,
                        diagnosticos: sano ? [] : x.diagnosticos,
                        aptitud: sano && !x.aptitud.clasificacion ? { ...x.aptitud, clasificacion: "elegible" } : x.aptitud,
                      }));
                    }}
                    className="mt-0.5 size-5 accent-[var(--primary)]"
                  />
                  <span>
                    <span className="font-medium">Trabajador sano</span>
                    <span className="block text-sm text-muted-foreground">
                      De acuerdo con los protocolos de evaluación clínica ocupacional, no presenta patología al momento de la evaluación.
                    </span>
                  </span>
                </label>
              </CardContent>
            </Card>
            {!d.sano && (
            <Seccion
              titulo="Diagnósticos (CIE-10)"
              accion={<Button type="button" size="sm" variant="outline" onClick={() => set("diagnosticos", [...d.diagnosticos, { cie10: "", descripcion: "", sistema: "", origen: "comun", principal: d.diagnosticos.length === 0 }])}><Plus /> Agregar</Button>}
            >
              {d.diagnosticos.length === 0 && <p className="text-sm text-muted-foreground">Sin diagnósticos. Pulsa Agregar y escribe parte del nombre o del código.</p>}
              {d.diagnosticos.map((x, i) => (
                <div key={i} className="grid gap-2 rounded-lg border p-3 sm:grid-cols-[minmax(0,3fr)_minmax(0,1fr)_minmax(0,1fr)_auto]">
                  <BuscadorDiagnostico
                    cie10={x.cie10}
                    descripcion={x.descripcion}
                    autoFocus={!x.descripcion}
                    onElegir={(v) => actualizarDiag(i, v)}
                    onEscribir={(descripcion) => actualizarDiag(i, { descripcion, cie10: "" })}
                  />
                  <select value={x.sistema} onChange={(e) => actualizarDiag(i, { sistema: e.target.value })} className={cn(SELECT, "h-9")}>
                    <option value="">Aparato o sistema</option>
                    {listas.sistema_organico.map((s) => <option key={s.id} value={s.nombre}>{s.nombre}</option>)}
                  </select>
                  <select value={x.origen} onChange={(e) => actualizarDiag(i, { origen: e.target.value as Origen })} className={cn(SELECT, "h-9", x.origen !== "comun" && "border-aviso")}>
                    {(Object.keys(ETIQUETA_ORIGEN) as Origen[]).map((o) => <option key={o} value={o}>{ETIQUETA_ORIGEN[o]}</option>)}
                  </select>
                  <button type="button" className="justify-self-end text-muted-foreground hover:text-destructive" onClick={() => set("diagnosticos", d.diagnosticos.filter((_, j) => j !== i))}><Trash2 className="size-4" /></button>
                  {i === 0 && <span className="text-xs text-muted-foreground sm:col-span-4">Diagnóstico principal</span>}
                </div>
              ))}
              {d.diagnosticos.some((x) => x.origen === "accidente_laboral") && (
                <p className="flex items-center gap-2 rounded-md bg-alerta/10 px-3 py-2 text-sm text-alerta-texto">
                  <HardHat className="size-4 shrink-0" /> Accidente laboral: regístralo para que corra el plazo de declaración ante el INPSASEL.
                  <button type="button" onClick={() => setAccidente(true)} className="ml-auto shrink-0 font-medium underline-offset-2 hover:underline">Registrar</button>
                </p>
              )}
              {/* Enfermedad ocupacional: aviso con el Anexo 1 (NT-02) y la lista del MPPS, «Iniciar declaración» e «Ignorar» */}
              <AvisoDeclaracion consultaId={d.id} declaracionesIniciales={declaraciones} diagnosticos={d.diagnosticos} reglas={reglasDeclaracion} onOrigen={(i, origen) => actualizarDiag(i, { origen })} />
            </Seccion>
            )}
            <Seccion titulo="Interconsultas" accion={<Button type="button" size="sm" variant="outline" onClick={() => set("interconsultas", [...d.interconsultas, { especialidad: "", motivo: "" }])}><Plus /> Agregar</Button>}>
              {d.interconsultas.length === 0 && <p className="text-sm text-muted-foreground">Sin interconsultas.</p>}
              {d.interconsultas.map((x, i) => (
                <div key={i} className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_auto]">
                  <select value={x.especialidad} onChange={(e) => set("interconsultas", d.interconsultas.map((y, j) => (j === i ? { ...y, especialidad: e.target.value } : y)))} className={cn(SELECT, "h-9")}>
                    <option value="">Especialidad</option>
                    {listas.especialidad.map((s) => <option key={s.id} value={s.nombre}>{s.nombre}</option>)}
                  </select>
                  <Input value={x.motivo} placeholder="Motivo de la referencia" className="h-9" onChange={(e) => set("interconsultas", d.interconsultas.map((y, j) => (j === i ? { ...y, motivo: e.target.value } : y)))} />
                  <button type="button" className="text-muted-foreground hover:text-destructive" onClick={() => set("interconsultas", d.interconsultas.filter((_, j) => j !== i))}><Trash2 className="size-4" /></button>
                </div>
              ))}
            </Seccion>
          </TabsContent>

          {/* ── Aptitud ── */}
          <TabsContent value="aptitud" className="mt-4 space-y-4">
            <Seccion titulo="Clasificación de aptitud">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-5">
                {APTITUDES.map((a) => (
                  <button
                    key={a}
                    type="button"
                    onClick={() => set("aptitud", { ...d.aptitud, clasificacion: d.aptitud.clasificacion === a ? "" : a })}
                    className={cn(
                      "rounded-xl border-2 px-3 py-3 text-sm font-medium transition",
                      d.aptitud.clasificacion === a ? cn(ESTILO_APTITUD[a], "border-current") : "border-transparent bg-muted/50 hover:bg-muted",
                    )}
                  >
                    {etiquetaAptitud(a)}
                  </button>
                ))}
              </div>
              {(d.aptitud.clasificacion === "elegible_con_restricciones" || d.aptitud.limitaciones.length > 0) && (
                <div>
                  <Label className="mb-2">Limitaciones ocupacionales</Label>
                  <div className="flex flex-wrap gap-1.5">
                    {listas.limitacion_ocupacional.map((l) => {
                      const activo = d.aptitud.limitaciones.includes(l.nombre);
                      return (
                        <button
                          key={l.id}
                          type="button"
                          onClick={() => set("aptitud", { ...d.aptitud, limitaciones: activo ? d.aptitud.limitaciones.filter((x) => x !== l.nombre) : [...d.aptitud.limitaciones, l.nombre] })}
                          className={cn("rounded-full border px-3 py-1 text-xs transition", activo ? "border-aviso bg-aviso/20 font-medium" : "hover:border-aviso")}
                        >
                          {l.nombre}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-[minmax(0,1fr)_14rem]">
                <TextosFrecuentes
                  etiqueta="Recomendaciones de aptitud"
                  items={listas.recomendacion_aptitud}
                  motivoCodigo={motivo?.codigo ?? null}
                  motivoNombre={motivo?.nombre ?? null}
                  valor={d.aptitud.observacion}
                  onChange={(v) => set("aptitud", { ...d.aptitud, observacion: v })}
                />
                <div>
                  <Label className="mb-1.5">Vigente hasta</Label>
                  <Input type="date" value={d.aptitud.vigenteHasta} onChange={(e) => set("aptitud", { ...d.aptitud, vigenteHasta: e.target.value })} />
                  <p className="mt-1 text-xs text-muted-foreground">Vacío: se calcula con la vigencia del examen periódico configurada.</p>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">La empresa cliente solo ve esta clasificación y las limitaciones, nunca el diagnóstico.</p>
            </Seccion>
            <Card className={cn("gap-0 py-4", d.potencialDiscapacidad && "border-aviso/60 bg-aviso/5")}>
              <CardContent className="space-y-3 px-6">
                <label className="flex items-start gap-3">
                  <input type="checkbox" checked={d.potencialDiscapacidad} onChange={(e) => set("potencialDiscapacidad", e.target.checked)} className="mt-0.5 size-5 accent-[var(--primary)]" />
                  <span>
                    <span className="flex items-center gap-1.5 font-medium"><Accessibility className="size-4" /> Potencial discapacidad</span>
                    <span className="block text-sm text-muted-foreground">Marca al trabajador para seguimiento: aparece en el reporte de potencial discapacidad y en la vigilancia.</span>
                  </span>
                </label>
                {criteriosDiscapacidad.length > 0 && (
                  <div className={cn("rounded-md px-3 py-2 text-sm", d.potencialDiscapacidad ? "bg-muted/50 text-muted-foreground" : "bg-aviso/10 text-aviso-texto")}>
                    {d.potencialDiscapacidad ? "Criterios presentes:" : "Hay criterios para considerarlo:"} {criteriosDiscapacidad.join(" · ")}
                  </div>
                )}
                {d.potencialDiscapacidad && (
                  <Texto etiqueta="Motivo y seguimiento" valor={d.discapacidadNota} onChange={(v) => set("discapacidadNota", v)} filas={2}
                    placeholder="Ej.: lumbalgia crónica con 120 días de reposo; evaluar por medicina física y CONAPDIS" />
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Tratamiento y reposo ── */}
          {mostrarTratamiento && (
            <TabsContent value="tratamiento" className="mt-4 space-y-4">
              <Seccion
                titulo="Tratamiento"
                accion={<Button type="button" size="sm" variant="outline" onClick={() => set("tratamiento", [...d.tratamiento, { medicina: "", concentracion: "", presentacion: "", dosis: "", frecuencia: "", duracion: "", via: "", observacion: "" }])}><Plus /> Medicina</Button>}
              >
                <datalist id="medicinas">{listas.medicina.map((m) => <option key={m.id} value={etiquetaMedicina(m.nombre, m.texto)} />)}</datalist>
                {d.tratamiento.length === 0 && <p className="text-sm text-muted-foreground">Sin medicinas indicadas.</p>}
                {d.tratamiento.map((m, i) => (
                  <div key={i} className="grid gap-2 rounded-lg border p-3 sm:grid-cols-[minmax(0,2fr)_repeat(6,minmax(0,1fr))_auto]">
                    <Input
                      list="medicinas"
                      value={m.medicina}
                      placeholder="Principio activo (DCI)"
                      className="h-9"
                      onChange={(e) => {
                        const v = e.target.value;
                        // Si elige del vademécum, se llenan los parámetros preestablecidos (editables)
                        const it = listas.medicina.find((x) => etiquetaMedicina(x.nombre, x.texto) === v);
                        if (!it) return actualizarMed(i, { medicina: v });
                        const pre = indicacionPreestablecida(it.texto);
                        actualizarMed(i, {
                          medicina: it.nombre,
                          concentracion: pre.concentracion ?? "",
                          presentacion: pre.presentacion ?? "",
                          via: pre.via ?? "",
                          dosis: pre.dosis ?? "",
                          frecuencia: pre.frecuencia ?? "",
                          duracion: pre.duracion ?? "",
                          observacion: pre.observacion ?? "",
                        });
                      }}
                    />
                    <Input value={m.concentracion ?? ""} placeholder="Concentración" className="h-9" onChange={(e) => actualizarMed(i, { concentracion: e.target.value })} />
                    {([["presentacion", listas.presentacion_medicina, "Presentación"], ["via", listas.via_administracion, "Vía"], ["frecuencia", listas.frecuencia_dosis, "Frecuencia"], ["duracion", listas.duracion_tratamiento, "Duración"]] as const).map(([k, items, ph]) => (
                      <select key={k} value={m[k]} onChange={(e) => actualizarMed(i, { [k]: e.target.value })} className={cn(SELECT, "h-9")}>
                        <option value="">{ph}</option>
                        {items.map((x) => <option key={x.id} value={x.nombre}>{x.nombre}</option>)}
                      </select>
                    ))}
                    <Input value={m.dosis} placeholder="Dosis" className="h-9" onChange={(e) => actualizarMed(i, { dosis: e.target.value })} />
                    <button type="button" className="text-muted-foreground hover:text-destructive" onClick={() => set("tratamiento", d.tratamiento.filter((_, j) => j !== i))}><Trash2 className="size-4" /></button>
                    <Input value={m.observacion ?? ""} placeholder="Nota al paciente (ej. después de las comidas)" className="h-8 sm:col-span-4" onChange={(e) => actualizarMed(i, { observacion: e.target.value })} />
                    <Input value={m.notaFarmacia ?? ""} placeholder="Nota a farmacia (ej. no sustituir)" className="h-8 sm:col-span-4" onChange={(e) => actualizarMed(i, { notaFarmacia: e.target.value })} />
                  </div>
                ))}
                <Texto etiqueta="Otras indicaciones" valor={d.indicaciones} onChange={(v) => set("indicaciones", v)} filas={2} />
              </Seccion>

              <Seccion titulo="Reposo médico">
                <label className="flex items-center gap-2 text-sm font-medium">
                  <input type="checkbox" checked={d.reposo.activo} onChange={(e) => set("reposo", { ...d.reposo, activo: e.target.checked })} className="size-4 accent-[var(--primary)]" />
                  Indicar reposo
                </label>
                {d.reposo.activo && (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
                    <div className="sm:col-span-2">
                      <Label className="mb-1.5">Causa</Label>
                      <select value={d.reposo.causa} onChange={(e) => set("reposo", { ...d.reposo, causa: e.target.value })} className={SELECT}>
                        {listas.causa_reposo.map((c) => <option key={c.id} value={c.codigo ?? c.nombre}>{c.nombre}</option>)}
                      </select>
                    </div>
                    <div className="sm:col-span-2">
                      <Label className="mb-1.5">Emitido por</Label>
                      <select value={d.reposo.ente} onChange={(e) => set("reposo", { ...d.reposo, ente: e.target.value })} className={SELECT}>
                        {listas.ente_emisor_reposo.map((c) => <option key={c.id} value={c.codigo ?? c.nombre}>{c.nombre}</option>)}
                      </select>
                    </div>
                    <div>
                      <Label className="mb-1.5">Desde</Label>
                      <Input type="date" value={d.reposo.desde} onChange={(e) => set("reposo", { ...d.reposo, desde: e.target.value })} />
                    </div>
                    <div>
                      <Label className="mb-1.5">Hasta</Label>
                      <Input type="date" value={d.reposo.hasta} onChange={(e) => set("reposo", { ...d.reposo, hasta: e.target.value })} />
                    </div>
                    <div className="flex items-end pb-2 text-sm text-muted-foreground sm:col-span-2">
                      {d.reposo.hasta >= d.reposo.desde
                        ? `${Math.round((Date.parse(d.reposo.hasta) - Date.parse(d.reposo.desde)) / 864e5) + 1} días · reintegro el día siguiente`
                        : "La fecha final es anterior a la inicial"}
                    </div>
                    {avisoSolape && (
                      <div role="status" className="flex flex-wrap items-start gap-x-3 gap-y-2 rounded-md border border-aviso/50 bg-aviso/10 px-3 py-2 text-sm text-aviso-texto sm:col-span-4">
                        <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                        <div className="min-w-0 flex-1">
                          <b>Se solapa con {solapados.length === 1 ? "otro reposo" : `${solapados.length} reposos`}:</b>
                          <ul className="mt-0.5">
                            {solapados.map((r, i) => (
                              <li key={i}>
                                {r.desde.split("-").reverse().join("/")} al {r.hasta.split("-").reverse().join("/")}
                                {" · "}{listas.causa_reposo.find((c) => (c.codigo ?? c.nombre) === r.causa)?.nombre ?? r.causa}
                                {" · "}{r.dias} día{r.dias === 1 ? "" : "s"} en común
                                {r.consultaId && <> · <Link href={`/atencion/${r.consultaId}`} target="_blank" className="underline-offset-2 hover:underline">ver consulta</Link></>}
                              </li>
                            ))}
                          </ul>
                        </div>
                        <Button type="button" size="sm" variant="ghost" className="h-7 text-aviso-texto hover:bg-aviso/20 hover:text-aviso-texto" onClick={() => setIgnorados((x) => [...x, claveSolape])}>Ignorar</Button>
                      </div>
                    )}
                    {d.reposo.ente !== "servicio_medico" && (
                      <div className="sm:col-span-2">
                        <Label className="mb-1.5">Médico externo que lo indicó</Label>
                        <Input value={d.reposo.medicoExterno} placeholder="Nombre y MPPS" onChange={(e) => set("reposo", { ...d.reposo, medicoExterno: e.target.value })} />
                      </div>
                    )}
                    <div className="sm:col-span-2">
                      <Label className="mb-1.5">Centro del IVSS</Label>
                      <Input value={d.reposo.centroIvss} placeholder="Si aplica" onChange={(e) => set("reposo", { ...d.reposo, centroIvss: e.target.value })} />
                    </div>
                    <label className="flex items-center gap-2 text-sm sm:col-span-2">
                      <input type="checkbox" checked={d.reposo.validadoIvss} onChange={(e) => set("reposo", { ...d.reposo, validadoIvss: e.target.checked })} className="size-4 accent-[var(--primary)]" />
                      Validado por el IVSS
                    </label>
                  </div>
                )}
              </Seccion>
            </TabsContent>
          )}

          {/* ── Conclusiones ── */}
          <TabsContent value="conclusiones" className="mt-4 space-y-4">
            <Seccion titulo="Conclusiones y recomendaciones">
              <Texto etiqueta="Conclusiones" valor={d.conclusiones} onChange={(v) => set("conclusiones", v)} />
              <TextosFrecuentes
                etiqueta="Recomendaciones para la empresa"
                items={listas.recomendacion_empresa}
                motivoCodigo={motivo?.codigo ?? null}
                motivoNombre={motivo?.nombre ?? null}
                valor={d.recomendacionesEmpresa}
                onChange={(v) => set("recomendacionesEmpresa", v)}
              />
              <TextosFrecuentes
                etiqueta="Recomendaciones para el trabajador"
                items={listas.recomendacion_paciente}
                motivoCodigo={motivo?.codigo ?? null}
                motivoNombre={motivo?.nombre ?? null}
                valor={d.recomendacionesTrabajador}
                onChange={(v) => set("recomendacionesTrabajador", v)}
              />
              <Texto etiqueta="Observación privada (solo personal de salud)" valor={d.observacionPrivada} onChange={(v) => set("observacionPrivada", v)} filas={2} />
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={d.autorizaPaciente} onChange={(e) => set("autorizaPaciente", e.target.checked)} className="size-4 accent-[var(--primary)]" />
                El trabajador autoriza enviar el informe a la empresa (si no, la empresa solo recibe la constancia de aptitud)
              </label>
            </Seccion>

            <Seccion titulo="Reubicación laboral">
              <label className="flex items-center gap-2 text-sm font-medium">
                <input
                  type="checkbox"
                  checked={d.reubicacion.activa}
                  onChange={(e) => set("reubicacion", { ...d.reubicacion, activa: e.target.checked, puestoActual: d.reubicacion.puestoActual || trabajador.cargo })}
                  className="size-4 accent-[var(--primary)]"
                />
                Indicar reubicación (se imprime la carta para la empresa)
              </label>
              {d.reubicacion.activa && (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
                  <div className="sm:col-span-2">
                    <Label className="mb-1.5">Puesto actual</Label>
                    <Input value={d.reubicacion.puestoActual} onChange={(e) => set("reubicacion", { ...d.reubicacion, puestoActual: e.target.value })} />
                  </div>
                  <div className="sm:col-span-2">
                    <Label className="mb-1.5">Puesto o tareas propuestas</Label>
                    <Input value={d.reubicacion.puestoPropuesto} onChange={(e) => set("reubicacion", { ...d.reubicacion, puestoPropuesto: e.target.value })} />
                  </div>
                  <div>
                    <Label className="mb-1.5">Tipo</Label>
                    <select value={d.reubicacion.tipo} onChange={(e) => set("reubicacion", { ...d.reubicacion, tipo: e.target.value as "temporal" | "definitiva" })} className={SELECT}>
                      <option value="temporal">Temporal</option>
                      <option value="definitiva">Definitiva</option>
                    </select>
                  </div>
                  <div>
                    <Label className="mb-1.5">Desde</Label>
                    <Input type="date" value={d.reubicacion.desde} onChange={(e) => set("reubicacion", { ...d.reubicacion, desde: e.target.value })} />
                  </div>
                  {d.reubicacion.tipo === "temporal" && (
                    <div>
                      <Label className="mb-1.5">Hasta</Label>
                      <Input type="date" value={d.reubicacion.hasta} onChange={(e) => set("reubicacion", { ...d.reubicacion, hasta: e.target.value })} />
                    </div>
                  )}
                  <div className="sm:col-span-4">
                    <Texto etiqueta="Motivo médico" valor={d.reubicacion.motivo} onChange={(v) => set("reubicacion", { ...d.reubicacion, motivo: v })} filas={2} />
                  </div>
                  <div className="sm:col-span-4">
                    <Texto etiqueta="Restricciones (una por línea)" valor={d.reubicacion.restricciones} onChange={(v) => set("reubicacion", { ...d.reubicacion, restricciones: v })} filas={3} />
                  </div>
                </div>
              )}
            </Seccion>

            <Seccion titulo="Informe médico libre">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm text-muted-foreground">Para cartas o informes que no encajan en otro documento. Si escribes el contenido, aparece «Informe libre» en el botón Imprimir.</p>
                {listas.modelo_informe_libre.length > 0 && (
                  <select value="" onChange={(e) => { const it = listas.modelo_informe_libre.find((i) => i.id === e.target.value); if (it) aplicarModelo(it); }}
                    aria-label="Usar un modelo de informe" className="h-8 max-w-56 rounded-md border bg-transparent px-2 text-xs">
                    <option value="">Usar modelo…</option>
                    {listas.modelo_informe_libre.map((i) => <option key={i.id} value={i.id}>{i.nombre}</option>)}
                  </select>
                )}
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <Label className="mb-1.5">Título</Label>
                  <Input value={d.informeLibre.titulo} placeholder="Informe médico" onChange={(e) => set("informeLibre", { ...d.informeLibre, titulo: e.target.value })} />
                </div>
                <div>
                  <Label className="mb-1.5">Dirigido a</Label>
                  <Input value={d.informeLibre.dirigidoA} placeholder="A quien pueda interesar" onChange={(e) => set("informeLibre", { ...d.informeLibre, dirigidoA: e.target.value })} />
                </div>
              </div>
              <Texto etiqueta="Contenido" valor={d.informeLibre.cuerpo} onChange={(v) => set("informeLibre", { ...d.informeLibre, cuerpo: v })} filas={6} />
            </Seccion>
          </TabsContent>
      </fieldset>

      {/* Navegación entre pasos */}
      <div className="flex items-center justify-between gap-3 border-t pt-4">
        <Button type="button" variant="ghost" disabled={indicePaso === 0} onClick={() => irA(indicePaso - 1)}>
          <ChevronLeft /> <span className="max-sm:hidden">{indicePaso > 0 ? pasos[indicePaso - 1].titulo : "Anterior"}</span><span className="sm:hidden">Anterior</span>
        </Button>
        <span className="text-xs text-muted-foreground">Paso {indicePaso + 1} de {pasos.length} · {pasos.filter((p) => p.hecho).length} completos</span>
        {indicePaso < pasos.length - 1 ? (
          <Button type="button" variant="outline" onClick={() => irA(indicePaso + 1)}>
            <span className="max-sm:hidden">{pasos[indicePaso + 1].titulo}</span><span className="sm:hidden">Siguiente</span> <ChevronRight />
          </Button>
        ) : !bloqueado ? (
          <Button type="button" onClick={() => guardar(true)} disabled={guardando}><CheckCircle2 /> Cerrar consulta</Button>
        ) : <span />}
      </div>

      {preventivo && !mostrarTratamiento && (
        <button type="button" className="text-sm text-primary hover:underline" onClick={() => setVerTodo(true)}>
          Mostrar tratamiento y reposo (ocultos para motivos preventivos)
        </button>
      )}
    </Tabs>
  );
}
