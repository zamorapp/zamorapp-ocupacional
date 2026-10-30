// Clase de cada examen del catálogo de paraclínicos: laboratorio, estudio de imagen (eco, rayos X, tomografía,
// resonancia u otro) o estudio funcional (espirometría, audiometría, electrocardiograma u otro).
// Se guarda en lista_items.datos.clase; si no está, se deduce del nombre y del grupo (lo importado del SAME no la trae).
// La usa la consulta: el perfil sugerido no pone el laboratorio por defecto (Cesar, 30-oct: casi no se pide; queda
// como opción), y el expediente agrupa los estudios digitalizados por clase.
import { normalizar } from "@/lib/ocr/interpretar";

export const CLASES = {
  laboratorio: "Laboratorio",
  eco: "Ecografía",
  rayos_x: "Rayos X",
  tomografia: "Tomografía",
  resonancia: "Resonancia magnética",
  imagen: "Otro estudio de imagen",
  espirometria: "Espirometría",
  audiometria: "Audiometría",
  electrocardiograma: "Electrocardiograma",
  funcional: "Otro estudio funcional",
} as const;
export type Clase = keyof typeof CLASES;
export type Familia = "laboratorio" | "imagen" | "funcional";

export const FAMILIA: Record<Clase, Familia> = {
  laboratorio: "laboratorio",
  eco: "imagen", rayos_x: "imagen", tomografia: "imagen", resonancia: "imagen", imagen: "imagen",
  espirometria: "funcional", audiometria: "funcional", electrocardiograma: "funcional", funcional: "funcional",
};
export const NOMBRE_FAMILIA: Record<Familia, string> = { laboratorio: "Laboratorio", imagen: "Estudios de imagen", funcional: "Estudios funcionales" };

// Palabras sueltas (sin acentos ni mayúsculas) que delatan la clase. El orden importa: «eco» antes que «rayos x»
// («ecografía de partes blandas»), «tomografía» antes que «resonancia» no choca.
const PISTAS: [Clase, RegExp][] = [
  ["espirometria", /\bespirometr|\bfuncion(alismo)? pulmonar|\bspirometr/],
  ["audiometria", /\baudiometr|\baudiograma|\blogoaudiometr|\bimpedanciometr/],
  ["electrocardiograma", /\belectrocardiogra|\becg\b|\bekg\b/],
  ["eco", /\beco(grafia|sonograma|cardiograma|doppler)?\b|\becograf|\bultrason|\bultrasonido|\bdoppler/],
  ["resonancia", /\bresonancia|\brmn?\b|\bresonancia magnetica/],
  ["tomografia", /\btomograf|\btac\b|\bangiotac/],
  ["rayos_x", /\brayos? ?x\b|\brx\b|\bradiograf|\bmamograf|\bdensitometr|\btelerradiograf/],
  ["imagen", /\bimagen|\bimagenolog|\bgammagraf/],
  ["funcional", /\bholter\b|\bergometr|\bprueba de esfuerzo|\belectroencefalogra|\beeg\b|\bvisiometr|\bagudeza visual|\boptometr|\bcampimetr|\bpsicotecn/],
];

export function claseDeducida(nombre: string, grupo?: string | null): Clase {
  for (const texto of [nombre, grupo ?? ""]) {
    const t = normalizar(texto);
    if (!t) continue;
    for (const [clase, re] of PISTAS) if (re.test(t)) return clase;
  }
  return "laboratorio";
}

export function claseDe(item: { nombre: string; grupo?: string | null; datos?: Record<string, unknown> | null }): Clase {
  const c = item.datos?.clase;
  return typeof c === "string" && c in CLASES ? (c as Clase) : claseDeducida(item.nombre, item.grupo);
}

export const familiaDe = (item: Parameters<typeof claseDe>[0]): Familia => FAMILIA[claseDe(item)];

// El perfil sugerido se separa en lo que se aplica por defecto (imágenes y funcionales) y el laboratorio opcional.
// Un examen del perfil que no está en el catálogo (examen libre) se clasifica por su nombre.
export function separarPorLaboratorio<T extends { id: string; nombre: string }>(examenes: T[], catalogo: { id: string; nombre: string; grupo?: string | null; datos?: Record<string, unknown> | null }[]) {
  const porId = new Map(catalogo.map((c) => [c.id, c]));
  const estudios: T[] = [], laboratorio: T[] = [];
  for (const e of examenes) (familiaDe(porId.get(e.id) ?? { nombre: e.nombre }) === "laboratorio" ? laboratorio : estudios).push(e);
  return { estudios, laboratorio };
}

// Historial de estudios del expediente: cada archivo adjunto con sus estudios (los exámenes que marcó quien lo subió)
// y su familia. Sin exámenes marcados se mira el nombre del archivo; si tampoco dice nada, queda «sin clasificar».
type ItemCatalogo = { id: string; nombre: string; grupo?: string | null; datos?: Record<string, unknown> | null };
export function clasificarAdjunto(adj: { nombre: string; descripcion?: string | null; examenes?: string[] | null }, catalogo: ItemCatalogo[]) {
  const porId = new Map(catalogo.map((c) => [c.id, c]));
  const estudios = (adj.examenes ?? []).map((id) => {
    const item = porId.get(id) ?? { nombre: id.startsWith("libre-") ? id.slice(6).replace(/^./, (l) => l.toUpperCase()) : "Examen" };
    return { nombre: item.nombre, clase: claseDe(item) };
  });
  if (estudios.length) {
    // La familia del archivo es la del primer estudio que no sea laboratorio (un PDF con Rx y hematología va a imagen)
    const principal = estudios.find((e) => FAMILIA[e.clase] !== "laboratorio") ?? estudios[0];
    return { familia: FAMILIA[principal.clase] as Familia | null, clase: principal.clase as Clase | null, estudios: estudios.map((e) => e.nombre) };
  }
  const deducida = claseDeducida(`${adj.nombre} ${adj.descripcion ?? ""}`.replace(/[_-]+/g, " "));
  return deducida === "laboratorio" ? { familia: null, clase: null, estudios: [] } : { familia: FAMILIA[deducida] as Familia | null, clase: deducida as Clase | null, estudios: [] };
}
