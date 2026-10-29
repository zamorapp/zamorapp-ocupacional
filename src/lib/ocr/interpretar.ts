// Lector de laboratorio: convierte las líneas leídas (texto de un PDF o de Tesseract) en una propuesta de resultados.
// Solo propone: el médico revisa cada fila y nada se guarda sin su confirmación. Compartido entre cliente y pruebas.

export type Caja = { x0: number; y0: number; x1: number; y1: number };
export type Linea = { texto: string; confianza: number; pagina: number; caja?: Caja };

export type ExamenCatalogo = { id: string; nombre: string; grupo: string | null; sinonimos: string[]; unidad: string; max: number | null };

export type Cabecera = { laboratorio: string; fecha: string; cedula: string; nombre: string };

export type FilaLeida = {
  linea: number; // índice en las líneas leídas (para resaltarla en la imagen)
  texto: string; // la línea tal cual se leyó
  examenId: string | null;
  examen: string; // nombre del catálogo, o el texto leído si no está en el catálogo
  valor: string;
  unidad: string;
  referencia: string; // rango que trae el laboratorio, tal cual
  min: number | null;
  max: number | null;
  marca: "" | "H" | "L";
  dudas: string[]; // por qué hay que revisarla; vacío = segura
};

export type Lectura = { cabecera: Cabecera; filas: FilaLeida[] };

const MAX_SINONIMOS = 20;
const MAX_LARGO_SINONIMO = 60;
const CONFIANZA_MINIMA = 80;

// Minúsculas, sin acentos, sin signos sueltos y con espacios simples
export const normalizar = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9%/.,<>\-\s]/g, " ").replace(/\s+/g, " ").trim();

// Sinónimos guardados en el catálogo (lista_items.datos.sinonimos): con tope de cantidad y de largo
export function sinonimosDe(datos: Record<string, unknown> | null | undefined): string[] {
  const v = datos?.sinonimos;
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === "string").map((x) => x.trim().slice(0, MAX_LARGO_SINONIMO)).filter(Boolean).slice(0, MAX_SINONIMOS);
}

// Cédula venezolana: sin V-/E-, puntos ni espacios (solo los dígitos)
export const normalizarCedula = (s: string) => s.replace(/^\s*[VEJPGvejpg]\s*[-.:]?\s*/, "").replace(/\D/g, "");

const NUMERO = String.raw`[<>≤≥]?\s*\d+(?:[.,]\d+)*`;
const RANGO = new RegExp(String.raw`(\d+(?:[.,]\d+)?)\s*(?:-|–|—|a|al)\s*(\d+(?:[.,]\d+)?)`);
const HASTA = new RegExp(String.raw`(?:<|≤|hasta|menor de|menor a)\s*(\d+(?:[.,]\d+)?)`, "i");
const DESDE = new RegExp(String.raw`(?:>|≥|mayor de|mayor a)\s*(\d+(?:[.,]\d+)?)`, "i");
const UNIDAD = /^(%|[a-zµμ/][a-zµμ0-9/^.³]*(?:\/[a-zµμ0-9^.³]+)?|x\s?10\^?\d+\/[a-zµμ]+)$/i;
const CUALITATIVO = /^(negativo|positivo|no reactivo|reactivo|normal|anormal|ausente|presente|escaso|escasa|abundante|moderado|moderada|trazas|turbio|claro|amarillo|ambar)\b/i;

const aNumero = (s: string) => {
  const n = Number(s.replace(",", "."));
  return Number.isFinite(n) ? n : null;
};

// Busca en la línea el examen del catálogo más largo que aparezca como palabras completas (sin RegExp del usuario).
// Devuelve lo que sigue al nombre tal como se leyó (con µ, ^ y mayúsculas, que la normalización borraría).
function buscarExamen(linea: string, catalogo: ExamenCatalogo[]) {
  const palabras = linea.trim().split(/\s+/);
  const norm = palabras.map((w) => normalizar(w).replace(/^[.,:\-]+|[.,:\-]+$/g, ""));
  let mejor: { examen: ExamenCatalogo; fin: number; largo: number } | null = null;
  for (const e of catalogo) {
    for (const nombre of [e.nombre, ...e.sinonimos]) {
      const n = normalizar(nombre).split(" ").filter(Boolean);
      const largo = n.join(" ").length;
      if (largo < 2 || (mejor && largo <= mejor.largo)) continue;
      for (let i = 0; i + n.length <= norm.length; i++) {
        if (n.every((w, j) => norm[i + j] === w)) { mejor = { examen: e, fin: i + n.length, largo }; break; }
      }
    }
  }
  return mejor && { examen: mejor.examen, resto: palabras.slice(mejor.fin).join(" ") };
}

// Valor, unidad, rango y marca H/L en el resto de la línea (lo que sigue al nombre del examen)
function leerValor(resto: string) {
  const r = resto.replace(/\s+/g, " ").trim();
  const cual = r.replace(/^[:.\-\s]+/, "").match(CUALITATIVO);
  const rango = r.match(RANGO);
  const hasta = rango ? null : r.match(HASTA);
  const desde = rango || hasta ? null : r.match(DESDE);
  const sinRango = rango ? r.replace(rango[0], " ") : hasta ? r.replace(hasta[0], " ") : desde ? r.replace(desde[0], " ") : r;
  const marca: "" | "H" | "L" = /(^|\s)(h|alto|\*)(\s|$)/i.test(sinRango) ? "H" : /(^|\s)(l|bajo)(\s|$)/i.test(sinRango) ? "L" : "";
  let valor = cual ? cual[0] : "";
  let unidad = "";
  if (!valor) {
    const m = sinRango.match(new RegExp(NUMERO));
    if (m) {
      valor = m[0].replace(/\s+/g, "");
      const despues = sinRango.slice((m.index ?? 0) + m[0].length).trim().split(" ")[0] ?? "";
      if (UNIDAD.test(despues) && !/^(h|l|alto|bajo)$/i.test(despues)) unidad = despues;
    }
  }
  return {
    valor,
    unidad,
    referencia: rango ? `${rango[1]}–${rango[2]}` : hasta ? `< ${hasta[1]}` : desde ? `> ${desde[1]}` : "",
    min: rango ? aNumero(rango[1]) : desde ? aNumero(desde[1]) : null,
    max: rango ? aNumero(rango[2]) : hasta ? aNumero(hasta[1]) : null,
    marca,
  };
}

// «1.250»: ¿mil doscientos cincuenta o uno coma veinticinco? Se decide con el rango del catálogo o se marca para revisar
function separadorDeMiles(valor: string, maxCatalogo: number | null): { valor: string; duda: boolean } {
  if (!/^\d{1,3}(\.\d{3})+$/.test(valor)) return { valor, duda: false };
  if (maxCatalogo !== null && maxCatalogo >= 1000) return { valor: valor.replace(/\./g, ""), duda: false };
  if (maxCatalogo !== null && maxCatalogo < 100) return { valor, duda: false };
  return { valor, duda: true };
}

export function leerCabecera(lineas: Linea[]): Cabecera {
  const primera = lineas.filter((l) => l.pagina === 1);
  const cab: Cabecera = { laboratorio: "", fecha: "", cedula: "", nombre: "" };
  for (const l of primera) {
    const t = l.texto;
    if (!cab.cedula) {
      const m = t.match(/(?:c[eé]dula|\bc\.?\s?[il1|]\.?|identidad)\s*[:#.]?\s*([VEve]\s*[-.]?\s*)?(\d{1,2}[.\s]?\d{3}[.\s]?\d{3}|\d{6,9})/i);
      if (m) cab.cedula = `${(m[1] ?? "").replace(/[\s.-]/g, "").toUpperCase()}${m[1] ? "-" : ""}${m[2]}`;
    }
    if (!cab.fecha) {
      const m = t.match(/(\d{1,2})[/-](\d{1,2})[/-](\d{4}|\d{2})/);
      if (m && (/fecha|emisi|toma|recep/i.test(t) || !primera.some((x) => /fecha/i.test(x.texto)))) {
        const anio = m[3].length === 2 ? `20${m[3]}` : m[3];
        const d = Number(m[1]);
        const mes = Number(m[2]);
        if (d >= 1 && d <= 31 && mes >= 1 && mes <= 12) cab.fecha = `${anio}-${String(mes).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      }
    }
    if (!cab.nombre) {
      const m = t.match(/(?:paciente|nombres?(?: y apellidos)?)\s*[:.]\s*([A-Za-zÁÉÍÓÚÑáéíóúñ ,.'-]{4,80})/i);
      if (m) cab.nombre = m[1].replace(/\s+(c\.?\s?i|c[eé]dula|edad|sexo|fecha)\b.*$/i, "").trim();
    }
    if (!cab.laboratorio && /laboratorio|lab\.|cl[ií]nica|centro m[eé]dico|policl[ií]nica/i.test(t)) cab.laboratorio = t.trim().slice(0, 80);
  }
  if (!cab.laboratorio && primera[0]) cab.laboratorio = primera[0].texto.trim().slice(0, 80);
  return cab;
}

export function interpretar(lineas: Linea[], catalogo: ExamenCatalogo[]): Lectura {
  const filas: FilaLeida[] = [];
  const vistos = new Set<string>();
  lineas.forEach((l, i) => {
    const hallado = buscarExamen(l.texto, catalogo);
    if (!hallado) return;
    const v = leerValor(hallado.resto);
    if (!v.valor) return;
    const miles = separadorDeMiles(v.valor, hallado.examen.max);
    const dudas: string[] = [];
    if (l.confianza < CONFIANZA_MINIMA) dudas.push("Lectura poco clara");
    if (miles.duda) dudas.push("¿Punto de miles o decimal?");
    // Tesseract suele leer la barra de «/mm3» como I, l o |: si fuera de eso coincide con el catálogo, se toma la del catálogo
    if (hallado.examen.unidad.startsWith("/") && /^[Il|1]\/?/.test(v.unidad) && v.unidad.replace(/^[Il|1]\/?/, "/") === hallado.examen.unidad) v.unidad = hallado.examen.unidad;
    if (hallado.examen.unidad && v.unidad && normalizar(v.unidad) !== normalizar(hallado.examen.unidad)) dudas.push(`Unidad distinta a la del catálogo (${hallado.examen.unidad})`);
    if (vistos.has(hallado.examen.id)) dudas.push("Examen repetido en el informe");
    vistos.add(hallado.examen.id);
    filas.push({
      linea: i, texto: l.texto, examenId: hallado.examen.id, examen: hallado.examen.nombre,
      valor: miles.valor.replace(/^([<>≤≥])/, "$1 "), unidad: v.unidad || hallado.examen.unidad, referencia: v.referencia, min: v.min, max: v.max, marca: v.marca, dudas,
    });
  });
  return { cabecera: leerCabecera(lineas), filas };
}

// Aviso de identidad: verde si coincide la cédula; ámbar si no se leyó o no coincide; rojo si no coinciden ni cédula ni nombre
export function identidad(cab: Cabecera, paciente: { cedula: string; nombre: string }): { nivel: "ok" | "revisar" | "alerta"; texto: string } {
  const leida = normalizarCedula(cab.cedula);
  const propia = normalizarCedula(paciente.cedula);
  const palabras = normalizar(paciente.nombre).split(" ").filter((x) => x.length > 2);
  const nombreLeido = normalizar(cab.nombre);
  const coincideNombre = Boolean(nombreLeido) && palabras.filter((p) => nombreLeido.includes(p)).length >= Math.min(2, palabras.length);
  if (leida && leida === propia) return { nivel: "ok", texto: `Cédula ${cab.cedula}: coincide con el paciente.` };
  if (!leida) return { nivel: "revisar", texto: coincideNombre ? "No se leyó la cédula; el nombre coincide. Revisa que sea el paciente." : "No se leyó la cédula del informe. Revisa que sea el paciente." };
  if (coincideNombre) return { nivel: "revisar", texto: `La cédula leída (${cab.cedula}) no coincide, pero el nombre sí. Puede ser un error de lectura.` };
  return { nivel: "alerta", texto: `Ni la cédula (${cab.cedula}) ni el nombre coinciden con el paciente. ¿Es su informe?` };
}
