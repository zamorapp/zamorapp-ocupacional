// Cargos (puestos): comparar nombres sin que importen mayúsculas, acentos, signos ni «de/del/la…», sugerir el
// parecido antes de crear uno nuevo y agrupar los repetidos para «Unir cargos». La base usa la misma clave
// (public.clave_cargo, migración 20261030630000) y rechaza un cargo con la clave de otro activo de la empresa.

const VACIAS = new Set(["de", "del", "la", "las", "el", "los", "y", "e", "en", "para", "al"]);

export function claveCargo(s: string | null | undefined): string {
  const base = (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  // Singular: «Operador De Equipos» = «Operador De Equipo» (palabras de 5 letras o más que terminan en s)
  const sin = base.split(" ").filter((p) => p && !VACIAS.has(p)).map((p) => p.replace(/^([a-z]{4,})s$/, "$1")).join(" ");
  return sin || base;
}

// Números, romanos y rangos distinguen cargos de verdad: «Operador I» no es «Operador II», ni «Junior» es «Senior»
const GRADO = /^(\d+|[ivx]+|[a-d]|junior|senior|jr|sr)$/;
const grados = (k: string) => k.split(" ").filter((p) => GRADO.test(p)).join(" ");

// «adm contrato» ↔ «administracion contrato», «aux enfermeria» ↔ «auxiliar enfermeria», «operado» ↔ «operador».
// La forma corta es abreviatura si tiene hasta 6 letras o le falta solo la última: «almacen» no es «almacenista».
// Abreviaturas de uso común que no son el comienzo de la palabra
const SIGLAS: Record<string, string> = { admon: "administracion", adm: "administracion", asist: "asistente", spte: "soporte", sup: "supervisor", tec: "tecnico", tecn: "tecnico", mtto: "mantenimiento", mant: "mantenimiento", ing: "ingeniero", lic: "licenciado" };
function esAbreviatura(a: string, b: string) {
  const x = a.split(" ").map((p) => SIGLAS[p] ?? p), y = b.split(" ").map((p) => SIGLAS[p] ?? p);
  if (x.length !== y.length || a === b) return false;
  // Le falta solo la última letra, salvo a/o/e: «Contador» y «Contadora» pueden ser dos cargos (lo decide el médico)
  const abrevia = (c: string, l: string) => c.length >= 2 && l.startsWith(c) && (c.length <= 6 || (l.length - c.length === 1 && !"aoe".includes(l.at(-1)!)));
  return x.every((p, i) => p === y[i] || abrevia(p, y[i]) || abrevia(y[i], p));
}

// Mismas palabras salvo una o dos con una letra de más, de menos o cambiada (dos si la palabra es larga).
// «tipeo» si el cambio está en medio de la palabra («Clinete»); «parecido» si solo cambia el final («Cajera» /
// «Cajero», «Ambiente» / «Ambiental»), que puede ser otro cargo y lo decide el médico.
const FINALES = new Set(["", "a", "o", "e", "al", "es"]);
function tipeoOParecido(a: string, b: string): "tipeo" | "parecido" | null {
  const x = a.split(" "), y = b.split(" ");
  if (x.length !== y.length) return null;
  let distintas = 0, final = true;
  for (let i = 0; i < x.length; i++) {
    if (x[i] === y[i]) continue;
    if (++distintas > 2 || Math.min(x[i].length, y[i].length) < 3) return null;
    const tope = Math.max(x[i].length, y[i].length) >= 7 ? 2 : 1;
    if (distancia(x[i], y[i], tope) > tope) return null;
    let comun = 0;
    while (comun < Math.min(x[i].length, y[i].length) && x[i][comun] === y[i][comun]) comun++;
    if (!FINALES.has(x[i].slice(comun)) || !FINALES.has(y[i].slice(comun))) final = false;
  }
  return distintas === 0 ? null : final ? "parecido" : "tipeo";
}

function distancia(a: string, b: string, tope: number) {
  if (Math.abs(a.length - b.length) > tope) return tope + 1;
  let previa = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const fila = [i];
    let menor = i;
    for (let j = 1; j <= b.length; j++) {
      fila[j] = Math.min(previa[j] + 1, fila[j - 1] + 1, previa[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      menor = Math.min(menor, fila[j]);
    }
    if (menor > tope) return tope + 1;
    previa = fila;
  }
  return previa[b.length];
}

export type Parecido = "igual" | "abreviatura" | "tipeo" | "parecido";

// Qué tan parecidas son dos claves (null: distintas)
export function parecido(a: string, b: string): Parecido | null {
  if (!a || !b) return null;
  // «Sub Gerente» = «Subgerente», «Electro-Mecanico» = «Electromecanico»
  if (a === b || a.replace(/ /g, "") === b.replace(/ /g, "")) return "igual";
  if (grados(a) !== grados(b)) return null;
  if (esAbreviatura(a, b)) return "abreviatura";
  return tipeoOParecido(a, b);
}

// Al escribir un cargo: el que ya existe con la misma clave (se usará ese) o el más parecido (se sugiere).
// Entre varios parecidos gana la forma más completa (con acentos, sin MAYÚSCULAS sostenidas, la más larga), no una
// abreviatura que se está limpiando con «Unir cargos».
const RANGO: Record<Parecido, number> = { igual: 4, abreviatura: 3, tipeo: 2, parecido: 1 };
const completo = (n: string) => Number(/[^\x00-\x7f]/.test(n)) * 1000 + Number(n !== n.toUpperCase()) * 500 + n.length;
export function cargoParecido(texto: string, cargos: string[]): { nombre: string; tipo: Parecido } | null {
  const k = claveCargo(texto);
  if (k.length < 3) return null;
  let mejor: { nombre: string; tipo: Parecido } | null = null;
  for (const c of cargos) {
    const t = parecido(k, claveCargo(c));
    if (!t) continue;
    if (!mejor || RANGO[t] > RANGO[mejor.tipo] || (RANGO[t] === RANGO[mejor.tipo] && completo(c) > completo(mejor.nombre))) mejor = { nombre: c, tipo: t };
  }
  // Lo escrito ya es la mejor forma de la lista: nada que sugerir
  return mejor && mejor.nombre.trim() !== texto.trim() ? mejor : null;
}

// Nombre sugerido al unir: mayúscula solo al inicio, «de/del/la…» en minúscula, siglas conocidas (IT, RRHH, SIHO) en mayúscula
// y las tildes de las palabras de cargo más comunes. El médico lo puede cambiar antes de unir.
const TILDES: Record<string, string> = Object.fromEntries(("atención administración carnicería charcutería pescadería técnico mecánico eléctrico " +
  "electromecánico hidráulico refrigeración información gestión producción recepción sección operación logística químico médico " +
  "análisis almacén construcción supervisión educación prevención protección tecnología línea vehículo panadería tráfico " +
  "mecánica jardinería eléctrica dirección coordinación planificación ingeniería auditoría económico").split(" ").map((w) => [w.normalize("NFD").replace(/[\u0300-\u036f]/g, ""), w]));
const MAYUSCULAS = new Set(["it", "ti", "rrhh", "siho", "siaho", "sihoa", "sst", "hse", "atc", "sap", "cnc"]);
export function nombreSugerido(n: string): string {
  const palabras = n.trim().replace(/\s+/g, " ").split(" ");
  return palabras.map((p, i) => {
    if (MAYUSCULAS.has(p.toLowerCase())) return p.toUpperCase();
    const con = p.toLowerCase().split("-").map((b) => TILDES[b] ?? b).join("-");
    return i === 0 ? con.charAt(0).toUpperCase() + con.slice(1) : con;
  }).join(" ");
}

export type CargoOrg = { id: string; empresaId: string; empresa: string; nombre: string; trabajadores: number };
export type Variante = CargoOrg & { tipo: Parecido };
export type GrupoCargos = { clave: string; propuesto: string; variantes: Variante[]; trabajadores: number; empresas: number };

// Repetidos de toda la organización: mismo nombre escrito distinto, en una o varias empresas.
// Un grupo con el nombre idéntico y uno por empresa no es repetido (cada empresa tiene su cargo).
export function agruparRepetidos(cargos: CargoOrg[]): GrupoCargos[] {
  const claves = new Map<string, CargoOrg[]>();
  for (const c of cargos) {
    const k = claveCargo(c.nombre);
    claves.set(k, [...(claves.get(k) ?? []), c]);
  }
  // Une claves parecidas (abreviatura o tipeo); por inicial para no comparar todas contra todas
  const lista = [...claves.keys()];
  const padre = new Map(lista.map((k) => [k, k]));
  const raiz = (k: string): string => (padre.get(k) === k ? k : raiz(padre.get(k)!));
  const porInicial = new Map<string, string[]>();
  for (const k of lista) porInicial.set(k[0] ?? "", [...(porInicial.get(k[0] ?? "") ?? []), k]);
  for (const grupo of porInicial.values()) {
    for (let i = 0; i < grupo.length; i++) for (let j = i + 1; j < grupo.length; j++) {
      if (parecido(grupo[i], grupo[j])) padre.set(raiz(grupo[j]), raiz(grupo[i]));
    }
  }
  const juntas = new Map<string, string[]>();
  for (const k of lista) juntas.set(raiz(k), [...(juntas.get(raiz(k)) ?? []), k]);

  const grupos: GrupoCargos[] = [];
  for (const ks of juntas.values()) {
    const todos = ks.flatMap((k) => claves.get(k)!);
    const nombres = new Set(todos.map((c) => c.nombre.trim()));
    const empresas = new Set(todos.map((c) => c.empresaId));
    if (nombres.size === 1 && empresas.size === todos.length) continue;
    // Propuesto: el nombre con más trabajadores; a igualdad, el que lleva acentos y luego el más largo (el más completo)
    const porNombre = new Map<string, number>();
    for (const c of todos) porNombre.set(c.nombre.trim(), (porNombre.get(c.nombre.trim()) ?? 0) + c.trabajadores);
    const propuesto = [...porNombre].sort((a, b) => b[1] - a[1] || Number(/[^\x00-\x7f]/.test(b[0])) - Number(/[^\x00-\x7f]/.test(a[0])) || b[0].length - a[0].length)[0][0];
    const kp = claveCargo(propuesto);
    grupos.push({
      clave: kp,
      propuesto: nombreSugerido(propuesto),
      variantes: todos.map((c) => ({ ...c, tipo: parecido(kp, claveCargo(c.nombre)) ?? "parecido" }))
        .sort((a, b) => b.trabajadores - a.trabajadores || a.empresa.localeCompare(b.empresa)),
      trabajadores: todos.reduce((s, c) => s + c.trabajadores, 0),
      empresas: empresas.size,
    });
  }
  return grupos.sort((a, b) => b.trabajadores - a.trabajadores);
}
