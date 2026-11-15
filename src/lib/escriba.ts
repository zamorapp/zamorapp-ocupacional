// Escriba de la consulta: ordena el dictado de corrido en los campos de la consulta, sin internet ni IA.
// El médico dice el nombre de cada sección («motivo», «examen físico», «abdomen», «aptitud»…) y lo que sigue
// va a ese campo. Las regiones del examen salen de la plantilla de la organización (Configuración › Listas).
// El resultado es una propuesta: el médico la revisa y nada se aplica ni se firma solo.
import type { Aptitud } from "@/lib/pacientes";
import type { DatosConsulta, FilaExamen, SignosVitales } from "@/lib/consultas-tipos";

export type CampoTexto = "motivoTexto" | "enfermedadActual" | "indicaciones" | "conclusiones" | "recomendacionesEmpresa" | "recomendacionesTrabajador";
type Destino = CampoTexto | "sinUbicar" | "antecedentes" | "signos" | "funcional" | "fisico" | "aptitud" | `funcional:${string}` | `fisico:${string}`;

export type Dictado = {
  textos: Partial<Record<CampoTexto, string>>;
  signos: Partial<SignosVitales>;
  // clave de la fila → texto dictado
  funcional: Record<string, string>;
  fisico: Record<string, string>;
  aptitud: { clasificacion: Aptitud | ""; observacion: string };
  motivoId: string | null;
  // Lo dicho antes de la primera frase de sección (saludo, conversación): el médico decide dónde va
  sinUbicar: string;
};

// Minúsculas y sin acentos, conservando el largo para que las posiciones sirvan sobre el texto original
const plano = (s: string) => Array.from(s, (c) => (c.normalize("NFD")[0] ?? c).toLowerCase()).join("");
const soloLetras = (s: string) => plano(s).replace(/[^a-z0-9ñ]+/g, " ").trim();

// «hola mundo punto y aparte» → signos; mayúscula al inicio y tras punto (la usa también el dictado por campo)
export function puntuar(texto: string, previo = "") {
  let t = ` ${texto.trim()} `
    .replace(/\s+punto y aparte\b[.,]?\s*/gi, ".\n")
    .replace(/\s+nueva línea\b[.,]?\s*/gi, "\n")
    .replace(/\s+punto y seguido\b[.,]?\s*/gi, ". ")
    .replace(/\s+punto\b[.,]?\s*/gi, ". ")
    .replace(/\s+coma\b[.,]?\s*/gi, ", ")
    .replace(/\s+dos puntos\b[.,]?\s*/gi, ": ")
    .trim();
  if (!previo.trim() || /[.\n]\s*$/.test(previo)) t = t.charAt(0).toUpperCase() + t.slice(1);
  const espacio = previo && !/[\s\n]$/.test(previo) ? " " : "";
  return espacio + t;
}

// Frases de sección que valen en cualquier momento del dictado
const SECCIONES: [string[], Destino][] = [
  [["motivo de consulta", "motivo de la consulta", "motivo"], "motivoTexto"],
  [["enfermedad actual", "historia de la enfermedad", "refiere"], "enfermedadActual"],
  [["antecedentes personales", "antecedentes familiares", "antecedentes", "habitos"], "antecedentes"],
  [["signos vitales", "antropometria"], "signos"],
  [["interrogatorio", "revision por sistemas", "examen funcional", "evaluacion funcional"], "funcional"],
  [["examen fisico", "evaluacion fisica", "al examen"], "fisico"],
  [["aptitud", "conclusion de aptitud", "clasificacion"], "aptitud"],
  [["indicaciones", "tratamiento", "plan"], "indicaciones"],
  [["conclusiones", "conclusion"], "conclusiones"],
  [["recomendaciones a la empresa", "recomendaciones para la empresa", "recomendacion a la empresa"], "recomendacionesEmpresa"],
  [["recomendaciones al trabajador", "recomendaciones para el trabajador", "recomendaciones al paciente", "recomendaciones"], "recomendacionesTrabajador"],
];

type Marca = { frase: string; destino: Destino; region?: "funcional" | "fisico" };

// Nombres de fila como frases: «Cabeza y cuello» también responde a «cabeza»; «Piel/faneras» a «piel»
function frasesDeFila(f: FilaExamen) {
  const nombre = soloLetras(f.nombre);
  const frases = new Set([nombre]);
  const primera = nombre.split(/\s+(?:y|e|o)\s+|\s+/)[0];
  if (primera && primera.length > 3) frases.add(primera);
  return [...frases].filter(Boolean);
}

function marcas(funcional: FilaExamen[], fisico: FilaExamen[]): Marca[] {
  const lista: Marca[] = SECCIONES.flatMap(([frases, destino]) => frases.map((frase) => ({ frase, destino })));
  for (const f of funcional) for (const frase of frasesDeFila(f)) lista.push({ frase, destino: `funcional:${f.clave}`, region: "funcional" });
  for (const f of fisico) for (const frase of frasesDeFila(f)) lista.push({ frase, destino: `fisico:${f.clave}`, region: "fisico" });
  // A igual posición gana la frase más larga («examen físico» antes que «examen»)
  return lista.sort((a, b) => b.frase.length - a.frase.length);
}

const ES_NORMAL = /^(?:(?:es|esta|se encuentra|se observa|luce|sin novedad,?)\s+)?(?:normal(?:es)?|sin alteraciones?|sin hallazgos|conservad[oa]s?|dentro de (?:los )?limites normales|nada que destacar|negativo)\.?$/;

// Números dictados con coma o punto («36 coma 5», «1,70»)
const numero = (s: string) => s.replace(/\s*(?:coma|punto)\s*/g, ".").replace(",", ".");

export function leerSignos(texto: string): Partial<SignosVitales> {
  const t = soloLetras(texto.replace(/(\d)[,.](\d)/g, "$1punto$2")).replace(/(\d)punto(\d)/g, "$1.$2");
  const s: Partial<SignosVitales> = {};
  const ta = t.match(/(?:tension|presion)(?: arterial)?(?: de)? (\d{2,3}) (?:sobre|con|entre|por) (\d{2,3})/) ?? t.match(/\bta (\d{2,3}) (?:sobre|con) (\d{2,3})/);
  if (ta) s.ta = `${ta[1]}/${ta[2]}`;
  const fr = t.match(/(?:frecuencia respiratoria|\bfr)(?: de)? (\d{1,2})\b/);
  if (fr) s.fr = fr[1];
  const fc = t.match(/(?:frecuencia cardiaca|frecuencia|pulso|\bfc)(?! respiratoria)(?: de)? (\d{2,3})\b/);
  if (fc) s.fc = fc[1];
  const temp = t.match(/temperatura(?: de)? (\d{2}(?:\.\d| (?:coma|punto) \d)?)/);
  if (temp) s.temp = numero(temp[1]);
  const sat = t.match(/saturacion(?: de oxigeno)?(?: de)? (\d{2,3})/);
  if (sat) s.sat = sat[1];
  const peso = t.match(/peso(?: de)? (\d{2,3}(?:\.\d+| (?:coma|punto) \d+)?)/);
  if (peso) s.peso = numero(peso[1]);
  const talla = t.match(/(?:talla|estatura|mide)(?: de)? (\d(?:\.\d{1,2}| (?:metro(?:s)?(?: con)?|coma|punto) \d{1,2})|\d{3})/);
  if (talla) {
    const v = talla[1];
    const m = v.match(/^(\d)\D+(\d{1,2})$/);
    // La pantalla pide centímetros
    s.talla = v.length === 3 && !m ? v : String(Math.round(Number(m ? `${m[1]}.${m[2].padEnd(2, "0")}` : v) * 100));
  }
  return s;
}

export function leerAptitud(texto: string): Aptitud | "" {
  const t = soloLetras(texto);
  if (/\bno apto\b|\bno elegible\b/.test(t)) return "no_elegible";
  if (/\bapto con restricci|\bcon restricci|\belegible con restricci|\bapto con limitaci/.test(t)) return "elegible_con_restricciones";
  if (/\bespera(?: de)? (?:los )?resultados\b/.test(t)) return "espera_resultados";
  if (/\bdiferido\b/.test(t)) return "diferido";
  if (/\bapto\b|\belegible\b/.test(t)) return "elegible";
  return "";
}

// Limpia el trozo de una sección: quita «:», «es», «de», signos sueltos al inicio y agrega la puntuación dictada
function limpiar(s: string) {
  const t = s.replace(/^[\s,.:;-]+/, "").replace(/^(?:es|de|del|son|esta|tiene)\s+/i, "").replace(/[\s,;:-]+$/, "");
  return t ? puntuar(t) : "";
}

export function ordenarDictado(texto: string, opciones: {
  funcional: FilaExamen[]; fisico: FilaExamen[]; motivos?: { id: string; nombre: string }[];
}): Dictado {
  const p = plano(texto);
  const lista = marcas(opciones.funcional, opciones.fisico);
  const trozos: { destino: Destino; desde: number; hasta: number }[] = [];
  let destino: Destino = "sinUbicar";
  // Las regiones solo se reconocen dentro de su examen: «dolor en el abdomen» en la enfermedad actual no salta
  let modo: "funcional" | "fisico" | null = null;
  let desde = 0;
  let i = 0;
  const bordeAntes = (k: number) => k === 0 || !/[a-z0-9ñ]/.test(p[k - 1]);
  const bordeDespues = (k: number) => k >= p.length || !/[a-z0-9ñ]/.test(p[k]);
  while (i < p.length) {
    if (!bordeAntes(i)) { i++; continue; }
    const m = lista.find((x) => (!x.region || x.region === modo) && p.startsWith(x.frase, i) && bordeDespues(i + x.frase.length));
    if (!m) { i++; continue; }
    trozos.push({ destino, desde, hasta: i });
    destino = m.destino;
    if (m.destino === "funcional" || m.destino === "fisico") modo = m.destino;
    else if (!m.region) modo = null;
    i += m.frase.length;
    desde = i;
  }
  trozos.push({ destino, desde, hasta: p.length });

  const d: Dictado = { textos: {}, signos: leerSignos(texto), funcional: {}, fisico: {}, aptitud: { clasificacion: "", observacion: "" }, motivoId: null, sinUbicar: "" };
  const sumar = (actual: string | undefined, nuevo: string) => (actual ? `${actual} ${nuevo}` : nuevo);
  const filaPorClave = (lista: FilaExamen[], clave: string) => lista.find((f) => f.clave === clave);
  for (const t of trozos) {
    const crudo = texto.slice(t.desde, t.hasta);
    const limpio = limpiar(crudo);
    if (!limpio) continue;
    const [grupo, clave] = t.destino.split(":") as ["funcional" | "fisico", string | undefined];
    if (clave) {
      const fila = filaPorClave(opciones[grupo], clave);
      const valor = ES_NORMAL.test(soloLetras(limpio)) && fila?.normal ? fila.normal : limpio;
      d[grupo][clave] = sumar(d[grupo][clave], valor);
    } else if (t.destino === "aptitud") {
      d.aptitud.clasificacion ||= leerAptitud(crudo);
      // La observación es lo que sigue a la clasificación («apto con restricciones para trabajo en altura»)
      const obs = limpiar(crudo.replace(/^[\s,.:;-]*(?:es\s+)?(?:no\s+)?(?:apto|elegible)(?:\s+con\s+(?:restricciones|limitaciones))?|^[\s,.:;-]*(?:diferido|en espera de resultados)/i, ""));
      if (obs) d.aptitud.observacion = sumar(d.aptitud.observacion, obs);
    } else if (t.destino === "sinUbicar") {
      d.sinUbicar = sumar(d.sinUbicar, limpio);
    } else if (t.destino === "antecedentes") {
      // No hay campo libre de antecedentes: se dejan al inicio de la enfermedad actual para que el médico los pase
      d.textos.enfermedadActual = sumar(d.textos.enfermedadActual, `Antecedentes: ${limpio}`);
    } else if (t.destino === "signos" || t.destino === "funcional" || t.destino === "fisico") {
      // Lo dicho tras «signos vitales» ya se leyó como números; lo general del examen va a la enfermedad actual
      if (t.destino !== "signos" && !ES_NORMAL.test(soloLetras(limpio))) d.textos.enfermedadActual = sumar(d.textos.enfermedadActual, limpio);
      if (t.destino !== "signos" && ES_NORMAL.test(soloLetras(limpio)))
        for (const f of opciones[t.destino]) if (f.normal && !d[t.destino][f.clave]) d[t.destino][f.clave] = f.normal;
    } else {
      const campo = t.destino as CampoTexto;
      d.textos[campo] = sumar(d.textos[campo], limpio);
    }
  }

  // Motivo de la lista («vienes para una evaluación preempleo»): el nombre más largo que aparezca en lo dicho
  const dicho = ` ${soloLetras(texto)} `;
  const pegado = dicho.replace(/\s+/g, "");
  const motivo = [...(opciones.motivos ?? [])]
    .sort((a, b) => b.nombre.length - a.nombre.length)
    .find((m) => {
      const n = soloLetras(m.nombre);
      return n.length > 3 && (dicho.includes(` ${n} `) || pegado.includes(n.replace(/\s+/g, "")));
    });
  d.motivoId = motivo?.id ?? null;
  return d;
}

// Campos que conviene revisar porque el dictado no los trajo (se marcan en ámbar; nunca bloquean)
export function faltantes(d: Dictado, opciones: { fisico: FilaExamen[]; preventivo: boolean }) {
  const falta: string[] = [];
  if (!opciones.preventivo && !d.textos.enfermedadActual) falta.push("Enfermedad actual");
  for (const [k, n] of [["ta", "Tensión"], ["fc", "Frecuencia cardíaca"], ["peso", "Peso"], ["talla", "Talla"]] as const)
    if (!d.signos[k]) falta.push(n);
  for (const f of opciones.fisico) if (!d.fisico[f.clave]) falta.push(f.nombre);
  if (!d.aptitud.clasificacion) falta.push("Aptitud");
  return falta;
}

// Lo que el médico deja marcado en la revisión
export type Aceptado = { textos: Partial<Record<CampoTexto, string>>; signos: Partial<SignosVitales>; funcional: Record<string, string>; fisico: Record<string, string>; aptitud: { clasificacion: Aptitud | ""; observacion: string } };

const agregar = (actual: string, nuevo: string) => {
  if (!nuevo.trim()) return actual;
  if (!actual.trim()) return nuevo.trim();
  return actual.includes(nuevo.trim()) ? actual : `${actual.trimEnd()}\n${nuevo.trim()}`;
};

// Agrega lo aceptado sin borrar lo escrito: los textos se suman al final, los signos y la aptitud solo llenan
// lo vacío y las filas del examen se reemplazan solo si seguían en su valor normal (sin tocar)
export function aplicarDictado(c: DatosConsulta, a: Aceptado): DatosConsulta {
  const filas = (lista: FilaExamen[], dict: Record<string, string>) =>
    lista.map((f) => (dict[f.clave] ? { ...f, valor: !f.valor.trim() || f.valor.trim() === f.normal.trim() ? dict[f.clave] : agregar(f.valor, dict[f.clave]) } : f));
  const signos = { ...c.signos };
  for (const [k, v] of Object.entries(a.signos) as [keyof SignosVitales, string][]) if (v && !signos[k]) signos[k] = v;
  const textos = Object.fromEntries((Object.entries(a.textos) as [CampoTexto, string][]).map(([k, v]) => [k, agregar(c[k], v)]));
  return {
    ...c,
    ...textos,
    signos,
    examenFuncional: filas(c.examenFuncional, a.funcional),
    examenFisico: filas(c.examenFisico, a.fisico),
    aptitud: {
      ...c.aptitud,
      clasificacion: c.aptitud.clasificacion || a.aptitud.clasificacion,
      observacion: agregar(c.aptitud.observacion, a.aptitud.observacion),
    },
  };
}
