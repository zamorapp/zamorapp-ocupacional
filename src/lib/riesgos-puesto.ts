// Identificación de procesos peligrosos y evaluación de riesgos por puesto, con mapa de riesgos.
// Compartido servidor/cliente, sin acceso a datos: tipos, símbolos del mapa, resumen y la copia a la matriz del puesto.
//
// Base legal (verificada el 06-nov-2026):
//   · LOPCYMAT (G.O. 38.236, 26-07-2005), arts. 40 (el Servicio de SST identifica, evalúa y controla las condiciones
//     y medio ambiente de trabajo), 53.1 y 56.3 (informar por escrito los riesgos del puesto) y 59 (condiciones
//     disergonómicas y psicosociales).
//   · NT-04-2023 «Programa de Seguridad y Salud en el Trabajo» (Res. 648 del 23-08-2023, G.O. 42.712 del
//     12-09-2023; derogó la NT-01-2008), art. 14: 1.2 identificar los procesos peligrosos con participación de los
//     trabajadores; 1.5 número de expuestos por área o zona; 2.1 el Servicio de SST con el Comité, constancia en acta;
//     2.3 medidas priorizando lo inmediato; 2.4 cuándo se repite (motivos, catálogo editable). Grupos de agentes:
//     art. 11 y 18 (físicos, químicos, biológicos, disergonómicos, psicosociales) y mecánicos o de seguridad.
//   · La norma no exige un «mapa de riesgos» con ese nombre: aquí es la forma gráfica de cumplir 14.1.5 (expuestos
//     por área o zona) y de validar la información con los trabajadores (14.1.3).
import { DEPARTAMENTOS, prioridad, type Departamento } from "@/lib/ergonomia";
import { claveRiesgo, GRUPOS, nivelRiesgo, type GrupoRiesgo, type Valoracion } from "@/lib/puestos-tipos";

// Quién hace estas evaluaciones (la base aplica la misma lista en evaluaciones_riesgos_editar)
export const ROLES_RIESGOS = ["administrador", "gerente_medico", "medico", "coordinador_sst"];
// Quién cambia la matriz de los puestos (igual que en Empresas › Puestos): el médico no
export const ROLES_PUESTOS = ["administrador", "coordinador_sst", "gerente_medico"];

export const BASE_LEGAL = "LOPCYMAT arts. 40, 53.1, 56.3 y 59 · NT-04-2023 art. 14";

// Nombre de cada grupo en este módulo: «mecánico» es el riesgo de seguridad (caídas, golpes, atrapamientos…)
export const NOMBRE_GRUPO: Record<GrupoRiesgo, string> = {
  fisico: "Físico",
  quimico: "Químico",
  biologico: "Biológico",
  mecanico: "Mecánico o de seguridad",
  disergonomico: "Disergonómico (ergonómico)",
  psicosocial: "Psicosocial",
};

// Símbolo del mapa y color de cada grupo: paleta categórica validada (orden fijo, separación para daltonismo
// ΔE ≥ 8 entre vecinos, claro y oscuro). Siempre va con su letra: el color nunca es la única pista.
export const SIMBOLO: Record<GrupoRiesgo, { letra: string; color: string; oscuro: string; texto: string }> = {
  fisico: { letra: "F", color: "#2a78d6", oscuro: "#3987e5", texto: "#ffffff" },
  quimico: { letra: "Q", color: "#eda100", oscuro: "#c98500", texto: "#0b0b0b" },
  biologico: { letra: "B", color: "#1baf7a", oscuro: "#199e70", texto: "#ffffff" },
  mecanico: { letra: "S", color: "#eb6834", oscuro: "#d95926", texto: "#ffffff" },
  disergonomico: { letra: "E", color: "#6250d6", oscuro: "#9085e9", texto: "#ffffff" },
  psicosocial: { letra: "P", color: "#e87ba4", oscuro: "#d55181", texto: "#ffffff" },
};

// Niveles de la matriz 5×5 (colores de estado: siempre con su palabra al lado)
export const COLOR_NIVEL: Record<string, string> = { Bajo: "#0ca30c", Medio: "#fab219", Alto: "#ec835a", Crítico: "#d03b3b" };
export const NIVELES = ["Crítico", "Alto", "Medio", "Bajo"] as const;

// Jerarquía de las medidas (de la más a la menos eficaz)
export const TIPOS_MEDIDA = [
  { clave: "eliminacion", nombre: "Eliminar el peligro" },
  { clave: "sustitucion", nombre: "Sustituir" },
  { clave: "ingenieria", nombre: "Control de ingeniería" },
  { clave: "administrativa", nombre: "Medida administrativa" },
  { clave: "epp", nombre: "Equipo de protección personal" },
] as const;
export type TipoMedida = (typeof TIPOS_MEDIDA)[number]["clave"];

// Motivos de NT-04-2023 art. 14.2.4: si la organización todavía no tiene la lista, se usan estos
export const MOTIVOS_BASE = [
  "Inicio del Programa de Seguridad y Salud en el Trabajo",
  "Nueva actividad productiva",
  "Proyecto de construcción, mantenimiento o reparación",
  "Cambio de equipos, sustancias o tecnología",
  "Cambio de instalaciones, organización o métodos de trabajo",
  "Daños a la salud de los trabajadores",
  "Prevención inadecuada o insuficiente",
  "Nuevos riesgos señalados por los trabajadores",
  "Solicitud de delegados, Comité o trabajadores",
  "Revisión periódica o indicación del INPSASEL",
];

export type FilaRiesgo = {
  id: string;
  pregunta?: string | null; // la pregunta de la lista de chequeo que lo agregó (si la hay)
  puestoId: string | null;
  puesto: string;
  area: string;
  tarea: string;
  grupo: GrupoRiesgo;
  agente: string;
  fuente: string; // de dónde viene (máquina, sustancia, organización…)
  efecto: string; // posible daño a la salud
  expuestos: number | null;
  p: number;
  s: number;
  controles: string; // lo que ya existe
  medida: string; // lo que se recomienda
  tipoMedida: TipoMedida | "";
  responsable: Departamento;
  plazo: string;
};

// Puestos que entran en la evaluación (paso 2), con sus expuestos y su área
export type Mediciones = { temp?: number | null; lux?: number | null; ruido?: number | null; humedad?: number | null };
export type PuestoEvaluado = {
  clave: string; puestoId: string | null; puesto: string; area: string; expuestos: number | null;
  respuestas?: Record<string, 0 | 1>; // id de la pregunta → 1 Sí (el peligro está) · 0 No
  mediciones?: Mediciones; // oficina: ambiente medido en el puesto
};

// Tipo de evaluación: la lista de chequeo cambia (general = todas las áreas; oficina = puesto administrativo)
export type TipoEvaluacion = "general" | "oficina";
export const TIPOS_EVALUACION: { clave: TipoEvaluacion; nombre: string; lista: string; texto: string }[] = [
  { clave: "general", nombre: "Todas las áreas", lista: "pregunta_riesgo", texto: "Planta, almacén, campo, taller, cocina, mantenimiento… Revisa los seis grupos de riesgo." },
  { clave: "oficina", nombre: "Oficina administrativa", lista: "pregunta_riesgo_oficina", texto: "Pantalla, silla, mesa, teclado, luz, ruido, temperatura, pausas y carga mental, con mediciones." },
];

// Referencias del ambiente de oficina (COVENIN 2254, 2249 y 1565; humedad RD 486/1997 como referencia)
export const MEDICIONES: { clave: keyof Mediciones; nombre: string; unidad: string; min?: number; max?: number; ref: string; fuente: string }[] = [
  { clave: "temp", nombre: "Temperatura", unidad: "°C", min: 17, max: 26, ref: "17 a 26 °C", fuente: "COVENIN 2254:1995" },
  { clave: "lux", nombre: "Iluminancia en la mesa", unidad: "lux", min: 500, max: 800, ref: "500 a 800 lux", fuente: "COVENIN 2249:1993" },
  { clave: "ruido", nombre: "Ruido", unidad: "dBA", max: 85, ref: "menos de 85 dBA (8 h)", fuente: "COVENIN 1565:1995" },
  { clave: "humedad", nombre: "Humedad relativa", unidad: "%", min: 30, max: 60, ref: "30 a 60 %", fuente: "RD 486/1997 (referencia)" },
];
export const fueraDeRango = (m: (typeof MEDICIONES)[number], v: number | null | undefined) =>
  typeof v === "number" && ((m.min !== undefined && v < m.min) || (m.max !== undefined && v > m.max));

// Pregunta de la lista de chequeo (lista_items: nombre = pregunta, grupo = grupo de riesgo, texto = «Agente: …
// Daño: … Medida: … Fuente: …», editable en Configuración › Listas)
export type Pregunta = { id: string; grupo: GrupoRiesgo; texto: string; agente: string; efecto: string; medida: string; fuente: string };
export function preguntaDe(item: { id: string; nombre: string; grupo: string | null; texto: string | null }): Pregunta | null {
  if (!item.grupo || !GRUPOS.some(([g]) => g === item.grupo)) return null;
  const campo = (k: string) => (item.texto ?? "").split("\n").find((l) => l.toLowerCase().startsWith(k.toLowerCase() + ":"))?.slice(k.length + 1).trim() ?? "";
  return { id: item.id, grupo: item.grupo as GrupoRiesgo, texto: item.nombre, agente: campo("Agente") || item.nombre, efecto: campo("Daño"), medida: campo("Medida"), fuente: campo("Fuente") };
}

// Paso 3 completo para un puesto: todas las preguntas respondidas y cada riesgo valorado
export function faltaEnPuesto(p: PuestoEvaluado, preguntas: Pregunta[], filas: FilaRiesgo[]) {
  const sinResponder = preguntas.filter((q) => p.respuestas?.[q.id] === undefined).length;
  const delPuesto = filas.filter((f) => clavePuesto(f) === p.clave);
  const sinValorar = delPuesto.filter((f) => !f.p || !f.s).length;
  return { sinResponder, sinValorar, riesgos: delPuesto.length, listo: sinResponder === 0 && sinValorar === 0 };
}
export const clavePuesto = (p: { puestoId: string | null; puesto: string }) => p.puestoId ?? `t:${p.puesto.trim().toLowerCase()}`;

export type Marca = { id: string; x: number; y: number; filaId: string };
export type EtiquetaArea = { id: string; x: number; y: number; texto: string };
export type Mapa = { plano: string | null; marcas: Marca[]; areas: EtiquetaArea[] };
export const MAPA_VACIO: Mapa = { plano: null, marcas: [], areas: [] };

export type EvaluacionRiesgos = {
  id: string;
  empresaId: string;
  empresa: string;
  titulo: string;
  tipo: TipoEvaluacion;
  fecha: string;
  motivo: string;
  participantes: string;
  acta: string;
  puestos: PuestoEvaluado[];
  filas: FilaRiesgo[];
  mapa: Mapa;
  conclusion: string;
  observaciones: string;
  estado: "borrador" | "cerrada";
  evaluadoPor: string | null;
  cerradaEn: string | null;
  aplicadaEn: string | null;
};

export const nivelFila = (f: Pick<FilaRiesgo, "p" | "s">) => prioridad(f);

// Número de cada fila tal como sale en el mapa y en la tabla (orden de la lista)
export const numeros = (filas: FilaRiesgo[]) => new Map(filas.map((f, i) => [f.id, i + 1]));

// Resumen para la lista y el informe: cuántos riesgos por grupo, por nivel y el más alto
export function resumen(filas: FilaRiesgo[]) {
  const porGrupo = GRUPOS.map(([g]) => ({ grupo: g, n: filas.filter((f) => f.grupo === g).length })).filter((x) => x.n > 0);
  const niveles = filas.map((f) => nivelFila(f)).filter((n): n is NonNullable<typeof n> => Boolean(n));
  const porNivel = (["Crítico", "Alto", "Medio", "Bajo"] as const).map((t) => ({ texto: t, n: niveles.filter((n) => n.texto === t).length }));
  const max = niveles.reduce<(typeof niveles)[number] | null>((a, n) => (!a || n.n > a.n ? n : a), null);
  const puestos = new Set(filas.map((f) => f.puestoId ?? `t:${f.puesto.trim().toLowerCase()}`)).size;
  const sinValorar = filas.filter((f) => !f.p || !f.s).length;
  // Expuestos por área (NT-04-2023 14.1.5): el mayor número anotado en cada área, no la suma de sus riesgos
  const areas = new Map<string, number>();
  for (const f of filas) {
    const a = f.area.trim() || "Sin área";
    areas.set(a, Math.max(areas.get(a) ?? 0, f.expuestos ?? 0));
  }
  return { porGrupo, porNivel, max, puestos, sinValorar, expuestosPorArea: [...areas].map(([area, n]) => ({ area, n })) };
}

// Ordena por puesto y, dentro de cada puesto, del riesgo más alto al más bajo
export function porPuesto(filas: FilaRiesgo[]) {
  const grupos = new Map<string, { clave: string; puestoId: string | null; puesto: string; filas: FilaRiesgo[] }>();
  for (const f of filas) {
    const clave = f.puestoId ?? `t:${f.puesto.trim().toLowerCase()}`;
    if (!grupos.has(clave)) grupos.set(clave, { clave, puestoId: f.puestoId, puesto: f.puesto, filas: [] });
    grupos.get(clave)!.filas.push(f);
  }
  return [...grupos.values()];
}

// Copia los riesgos evaluados a la matriz de un puesto (Empresas › Puestos), que usan la consulta, la constancia
// y la notificación de riesgos. Agrega los agentes que falten y actualiza la valoración de los evaluados; no borra
// lo que el puesto ya tenía y la evaluación no trae.
export function aplicarAPuesto(
  puesto: { riesgos: Partial<Record<GrupoRiesgo, string[]>>; evaluacion: Record<string, Valoracion> },
  filas: FilaRiesgo[],
) {
  const riesgos: Partial<Record<GrupoRiesgo, string[]>> = Object.fromEntries(Object.entries(puesto.riesgos ?? {}).map(([g, l]) => [g, [...(l ?? [])]]));
  const evaluacion: Record<string, Valoracion> = { ...(puesto.evaluacion ?? {}) };
  let agregados = 0, actualizados = 0;
  for (const f of filas) {
    if (!f.agente.trim()) continue;
    const lista = (riesgos[f.grupo] ??= []);
    const existente = lista.find((a) => a.toLowerCase() === f.agente.trim().toLowerCase());
    const agente = existente ?? f.agente.trim();
    if (!existente) { lista.push(agente); agregados++; }
    if (f.p && f.s) {
      const control = [f.controles.trim(), f.medida.trim() && `Recomendado: ${f.medida.trim()}`].filter(Boolean).join(" · ").slice(0, 500);
      const anterior = evaluacion[claveRiesgo(f.grupo, agente)];
      evaluacion[claveRiesgo(f.grupo, agente)] = { p: f.p, s: f.s, control: control || anterior?.control || "" };
      if (existente) actualizados++;
    }
  }
  return { riesgos, evaluacion, agregados, actualizados };
}

// Filas iniciales a partir de la matriz que el puesto ya tiene (no se escribe dos veces lo mismo)
export function filasDePuesto(
  puesto: { id: string; nombre: string; dependencia?: string | null; riesgos: Partial<Record<GrupoRiesgo, string[]>>; evaluacion: Record<string, Valoracion>; trabajadores?: number },
  nuevoId: () => string,
): FilaRiesgo[] {
  return GRUPOS.flatMap(([g]) => (puesto.riesgos?.[g] ?? []).map((agente): FilaRiesgo => {
    const v = puesto.evaluacion?.[claveRiesgo(g, agente)];
    return {
      id: nuevoId(), puestoId: puesto.id, puesto: puesto.nombre, area: puesto.dependencia ?? "", tarea: "",
      grupo: g, agente, fuente: "", efecto: "", expuestos: puesto.trabajadores ?? null,
      p: v?.p ?? 0, s: v?.s ?? 0, controles: v?.control ?? "", medida: "", tipoMedida: "", responsable: "sst", plazo: "",
    };
  }));
}

export const GRUPO_VALIDO = new Set<string>(GRUPOS.map(([g]) => g));
export const TIPO_VALIDO = new Set<string>(TIPOS_MEDIDA.map((t) => t.clave));
export const DEPTO_VALIDO = new Set<string>(DEPARTAMENTOS.map((d) => d.clave));
export { nivelRiesgo };
