// Cargos (puestos): comparar nombres sin que importen mayúsculas, acentos, signos ni «de/del/la…», sugerir el
// parecido antes de crear uno nuevo y agrupar los repetidos para «Unir cargos». La base usa la misma clave
// (public.clave_cargo, migración 20261030630000) y rechaza un cargo con la clave de otro activo de la empresa.

const VACIAS = new Set(["de", "del", "la", "las", "el", "los", "y", "e", "en", "para", "al"]);

export function claveCargo(s: string | null | undefined): string {
  const base = (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const sin = base.split(" ").filter((p) => p && !VACIAS.has(p)).join(" ");
  return sin || base;
}

// Números y romanos distinguen cargos de verdad: «Operador I» no es «Operador II»
const GRADO = /^(\d+|[ivx]+|[a-d])$/;
const grados = (k: string) => k.split(" ").filter((p) => GRADO.test(p)).join(" ");

// «adm contrato» ↔ «administracion contrato», «aux enfermeria» ↔ «auxiliar enfermeria»
function esAbreviatura(a: string, b: string) {
  const x = a.split(" "), y = b.split(" ");
  if (x.length !== y.length || a === b) return false;
  return x.every((p, i) => p === y[i] || (p.length >= 2 && y[i].startsWith(p)) || (y[i].length >= 2 && p.startsWith(y[i])));
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

export type Parecido = "igual" | "abreviatura" | "tipeo";

// Qué tan parecidas son dos claves (null: distintas)
export function parecido(a: string, b: string): Parecido | null {
  if (!a || !b) return null;
  if (a === b) return "igual";
  if (grados(a) !== grados(b)) return null;
  if (esAbreviatura(a, b)) return "abreviatura";
  const tope = Math.max(a.length, b.length) >= 12 ? 2 : 1;
  return Math.min(a.length, b.length) >= 5 && distancia(a, b, tope) <= tope ? "tipeo" : null;
}

// Al escribir un cargo: el que ya existe con la misma clave (se usará ese) o el más parecido (se sugiere).
// Entre varios parecidos gana la forma más completa (con acentos, sin MAYÚSCULAS sostenidas, la más larga), no una
// abreviatura que se está limpiando con «Unir cargos».
const RANGO: Record<Parecido, number> = { igual: 3, abreviatura: 2, tipeo: 1 };
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
      propuesto,
      variantes: todos.map((c) => ({ ...c, tipo: parecido(kp, claveCargo(c.nombre)) ?? "tipeo" }))
        .sort((a, b) => b.trabajadores - a.trabajadores || a.empresa.localeCompare(b.empresa)),
      trabajadores: todos.reduce((s, c) => s + c.trabajadores, 0),
      empresas: empresas.size,
    });
  }
  return grupos.sort((a, b) => b.trabajadores - a.trabajadores);
}
