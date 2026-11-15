// Valores sugeridos para el catálogo de paraclínicos: unidad, rango de referencia en adultos (hombre / mujer) y otros
// nombres con que los escriben los laboratorios. Lo importado del SAME no trae unidades ni rangos, así que esta lista
// sirve para empezar. «Completar con valores sugeridos» (Configuración › Listas › Paraclínicos) solo llena lo vacío:
// nunca pisa lo que el médico escribió. Tabla confirmada por Cesar: /mnt/project-files/paraclinicos/catalogo-sugerido.md
import { normalizar, sinonimosDe } from "@/lib/ocr/interpretar";

export type Sugerido = {
  nombre: string;
  tipo: "numero" | "informe";
  unidad?: string;
  min?: number; max?: number; minF?: number; maxF?: number; // minF/maxF: solo si cambia en la mujer
  sinonimos: string[];
  fuente: string; // de dónde sale el rango (sociedad o guía y año): se ve y se edita en Configuración
};

// Los límites «menor que» de las guías van como el entero anterior (p. ej. < 200 → hasta 199), porque el semáforo marca
// fuera de rango lo que pasa del máximo. Donde ninguna sociedad fija el rango (hemograma, urea, creatinina, AST), se usa
// la referencia de laboratorio en adultos, que cada laboratorio establece según CLSI EP28-A3c: ajustarla al de uso.
const LAB = "Referencia de laboratorio en adultos (CLSI EP28-A3c, 2010): ajustar al laboratorio de uso";
export const SUGERIDOS: Sugerido[] = [
  { nombre: "Hemoglobina", tipo: "numero", unidad: "g/dL", min: 13, max: 16.5, minF: 12, maxF: 16, sinonimos: ["Hb", "HGB"],
    fuente: "Mínimo: OMS 2024, umbrales de anemia (hombre 13, mujer no embarazada 12). Máximo: OMS 2016, criterio de policitemia vera (16,5 y 16)" },
  { nombre: "Hematocrito", tipo: "numero", unidad: "%", min: 40, max: 49, minF: 36, maxF: 48, sinonimos: ["Hto", "HCT"],
    fuente: "Mínimo: referencia de laboratorio (CLSI EP28-A3c). Máximo: OMS 2016, criterio de policitemia vera (49 % y 48 %)" },
  { nombre: "Glóbulos blancos", tipo: "numero", unidad: "/mm³", min: 4500, max: 11000, sinonimos: ["Leucocitos", "WBC", "Contaje blanco"], fuente: LAB },
  { nombre: "Plaquetas", tipo: "numero", unidad: "/mm³", min: 150000, max: 450000, sinonimos: ["PLT", "Contaje plaquetario"],
    fuente: "ISTH/ASH: trombocitopenia por debajo de 150.000/mm³. Máximo: referencia de laboratorio (CLSI EP28-A3c)" },
  { nombre: "VSG", tipo: "numero", unidad: "mm/h", min: 0, max: 15, minF: 0, maxF: 20, sinonimos: ["Eritrosedimentación", "Velocidad de sedimentación"],
    fuente: "ICSH 2017, método de Westergren, adultos menores de 50 años (después, el límite sube con la edad)" },
  { nombre: "Glicemia", tipo: "numero", unidad: "mg/dL", min: 70, max: 99, sinonimos: ["Glucosa", "Glicemia basal", "Glucosa en ayunas"],
    fuente: "ADA, Standards of Care in Diabetes 2025: ayunas normal < 100 (100 a 125 prediabetes, ≥ 126 diabetes); hipoglucemia < 70" },
  { nombre: "Urea", tipo: "numero", unidad: "mg/dL", min: 15, max: 45, sinonimos: ["Urea sérica"], fuente: `${LAB}. No es el BUN (nitrógeno ureico, 7 a 20)` },
  { nombre: "Creatinina", tipo: "numero", unidad: "mg/dL", min: 0.7, max: 1.3, minF: 0.6, maxF: 1.1, sinonimos: ["Creatinina sérica", "CREA"],
    fuente: `${LAB}. KDIGO 2024 evalúa la función renal con la TFGe (< 60 mL/min/1,73 m² por más de 3 meses), no con un rango de creatinina` },
  { nombre: "Ácido úrico", tipo: "numero", unidad: "mg/dL", min: 3.5, max: 6.8, minF: 2.6, maxF: 6.8, sinonimos: ["Uricemia"],
    fuente: "EULAR 2016 y ACR 2020: hiperuricemia por encima de 6,8 (saturación del urato). Mínimo: referencia de laboratorio" },
  { nombre: "Colesterol total", tipo: "numero", unidad: "mg/dL", max: 199, sinonimos: ["Colesterol", "CHOL"], fuente: "NCEP ATP III (2002): deseable < 200; 200 a 239 limítrofe" },
  { nombre: "Triglicéridos", tipo: "numero", unidad: "mg/dL", max: 149, sinonimos: ["TG", "TRIG"], fuente: "NCEP ATP III (2002): normal < 150" },
  { nombre: "HDL colesterol", tipo: "numero", unidad: "mg/dL", min: 40, minF: 50, sinonimos: ["HDL", "Colesterol HDL"],
    fuente: "NCEP ATP III (2002) y criterios armonizados de síndrome metabólico (IDF/AHA/NHLBI, 2009): bajo < 40 en el hombre y < 50 en la mujer" },
  { nombre: "LDL colesterol", tipo: "numero", unidad: "mg/dL", max: 129, sinonimos: ["LDL", "Colesterol LDL"],
    fuente: "NCEP ATP III (2002): óptimo < 100, casi óptimo 100 a 129. La meta de cada paciente depende de su riesgo (ACC/AHA 2018)" },
  { nombre: "TGO (AST)", tipo: "numero", unidad: "U/L", max: 40, maxF: 32, sinonimos: ["AST", "GOT", "TGO", "Transaminasa oxalacética"], fuente: LAB },
  { nombre: "TGP (ALT)", tipo: "numero", unidad: "U/L", max: 33, maxF: 25, sinonimos: ["ALT", "GPT", "TGP", "Transaminasa pirúvica"],
    fuente: "ACG 2017, guía de pruebas hepáticas alteradas: ALT normal 29 a 33 U/L en el hombre y 19 a 25 U/L en la mujer" },
  { nombre: "VDRL", tipo: "informe", sinonimos: ["Serología", "RPR"], fuente: "CDC, guía de ITS 2021: normal «no reactivo»; un reactivo se confirma con prueba treponémica" },
  { nombre: "HIV", tipo: "informe", sinonimos: ["VIH", "Anticuerpos anti-HIV"], fuente: "OMS 2019 y CDC: normal «no reactivo»; un reactivo se confirma con el algoritmo de pruebas" },
  { nombre: "Examen de orina", tipo: "informe", sinonimos: ["Uroanálisis", "Orina completa", "EGO", "Orina"], fuente: "Informe del laboratorio: normal / alterado según el médico" },
  { nombre: "Examen de heces", tipo: "informe", sinonimos: ["Coproanálisis", "Heces directo", "Heces"], fuente: "Informe del laboratorio: normal / alterado según el médico" },
  { nombre: "Grupo sanguíneo y factor Rh", tipo: "informe", sinonimos: ["Grupo y Rh", "Tipiaje", "Grupo sanguíneo"], fuente: "Dato del paciente: no tiene rango" },
];

type ItemCatalogo = { id: string; nombre: string; datos?: Record<string, unknown> | null };
export type Cambio = { id: string; nombre: string; sugerido: string; datos: Record<string, unknown>; resumen: string[] };

const vacio = (v: unknown) => v === null || v === undefined || v === "";
const RANGOS = ["rango_min", "rango_max", "rango_min_f", "rango_max_f"] as const;

// El sugerido de un examen del catálogo: por su nombre o por cualquiera de los otros nombres (sin acentos ni mayúsculas)
export function sugeridoPara(nombre: string): Sugerido | null {
  const n = normalizar(nombre);
  return SUGERIDOS.find((s) => [s.nombre, ...s.sinonimos].some((x) => normalizar(x) === n)) ?? null;
}

// Qué cambiaría en cada examen: solo lo que está vacío. Si ya tiene algún rango, no se toca ningún rango; si ya tiene
// unidad, no se cambia; si ya es «informe» o «número» con rango, el tipo queda. Los otros nombres se suman.
export function cambiosSugeridos(items: ItemCatalogo[]): { cambios: Cambio[]; sinCatalogo: Sugerido[] } {
  const usados = new Set<string>();
  const cambios: Cambio[] = [];
  for (const it of items) {
    const s = sugeridoPara(it.nombre);
    if (!s) continue;
    usados.add(s.nombre);
    const d = { ...(it.datos ?? {}) } as Record<string, unknown>;
    const resumen: string[] = [];
    const sinRango = RANGOS.every((k) => vacio(d[k]));
    if (vacio(d.tipo) && sinRango && vacio(d.unidad)) { d.tipo = s.tipo; if (s.tipo === "informe") resumen.push("tipo informe"); }
    if (s.tipo === "numero" && d.tipo !== "informe") {
      if (vacio(d.unidad) && s.unidad) { d.unidad = s.unidad; resumen.push(`unidad ${s.unidad}`); }
      if (sinRango && (s.min !== undefined || s.max !== undefined)) {
        d.rango_min = s.min ?? null; d.rango_max = s.max ?? null;
        d.rango_min_f = s.minF ?? null; d.rango_max_f = s.maxF ?? null;
        resumen.push("rango de referencia");
      }
    }
    if (vacio(d.fuente) && resumen.length) d.fuente = s.fuente; // la fuente acompaña a lo que se llenó
    const antes = sinonimosDe(d);
    const nuevos = s.sinonimos.filter((x) => normalizar(x) !== normalizar(it.nombre) && !antes.some((a) => normalizar(a) === normalizar(x)));
    if (nuevos.length) { d.sinonimos = [...antes, ...nuevos].slice(0, 20); resumen.push(`otros nombres: ${nuevos.join(", ")}`); }
    if (resumen.length) cambios.push({ id: it.id, nombre: it.nombre, sugerido: s.nombre, datos: d, resumen });
  }
  return { cambios, sinCatalogo: SUGERIDOS.filter((s) => !usados.has(s.nombre)) };
}

// «Volver al valor sugerido» en el formulario de un examen: lo que la tabla trae para él (se revisa y se guarda a mano)
export function datosSugeridos(s: Sugerido) {
  return { tipo: s.tipo, unidad: s.unidad ?? "", rango_min: s.min ?? null, rango_max: s.max ?? null, rango_min_f: s.minF ?? null, rango_max_f: s.maxF ?? null, sinonimos: s.sinonimos, fuente: s.fuente };
}
