// Actualizar la nómina con la plantilla de RR. HH. (Cesar, 04-nov-2026): leer el Excel y compararlo, por cédula EXACTA,
// con la nómina actual de la empresa. Funciones puras: la pantalla las usa para la vista previa y el servidor las vuelve
// a correr al aplicar (no confía en lo que mande el navegador).

import { claveCargo } from "@/lib/cargos";
import { claveCedula, esEncabezadoSigue, leerSigue } from "@/lib/depurar";
import { sumarDias } from "@/lib/fecha";

/** Columnas de la plantilla, en orden. RR. HH. puede traer su propio formato: se reconocen también otros nombres. */
export const COLUMNAS_NOMINA = [
  "Cédula", "Apellidos", "Nombres", "Sexo (F/M)", "Fecha de nacimiento", "Fecha de ingreso", "Cargo", "Departamento", "Turno",
  "Tipo de trabajador", "Teléfono", "Correo", "Dirección", "N.º de ficha", "¿Sigue en la empresa? (SÍ / NO)",
] as const;

export type CampoNomina =
  | "apellidos" | "nombres" | "sexo" | "fechaNacimiento" | "fechaIngreso" | "cargo" | "dependencia" | "turno" | "tipo"
  | "telefono" | "correo" | "direccion" | "ficha";

export const ETIQUETA: Record<CampoNomina, string> = {
  apellidos: "Apellidos", nombres: "Nombres", sexo: "Sexo", fechaNacimiento: "Nacimiento", fechaIngreso: "Ingreso", cargo: "Cargo",
  dependencia: "Departamento", turno: "Turno", tipo: "Tipo", telefono: "Teléfono", correo: "Correo", direccion: "Dirección", ficha: "Ficha",
};

/** Datos de la persona: un cambio aquí suele ser un error de tipeo de la planilla. No se aplica salvo que Cesar lo marque. */
export const IDENTIDAD: CampoNomina[] = ["apellidos", "nombres", "sexo", "fechaNacimiento"];

/** Lo que la vigilancia necesita de cada trabajador para que la población salga completa (pirámide, sexo, áreas). */
export const PARA_VIGILANCIA: CampoNomina[] = ["sexo", "fechaNacimiento", "cargo", "dependencia", "fechaIngreso"];

const ALIAS: Record<CampoNomina | "cedula", string[]> = {
  cedula: ["cedula", "ci", "c.i.", "c.i", "cedula de identidad", "documento", "nro cedula", "n de cedula"],
  apellidos: ["apellidos", "apellido"],
  nombres: ["nombres", "nombre"],
  sexo: ["sexo", "genero", "sexo (f/m)"],
  fechaNacimiento: ["fecha de nacimiento", "fecha nacimiento", "nacimiento", "f. nacimiento", "f nacimiento"],
  fechaIngreso: ["fecha de ingreso", "fecha ingreso", "fecha ingreso empresa", "ingreso", "f. ingreso", "f ingreso"],
  cargo: ["cargo", "cargo actual", "puesto", "ocupacion"],
  dependencia: ["departamento", "dependencia", "nombre dependencia", "area", "gerencia", "unidad"],
  turno: ["turno", "turno trabajo", "turno de trabajo"],
  tipo: ["tipo de trabajador", "tipo trabajador", "tipo paciente", "tipo de paciente", "tipo", "nomina", "tipo de nomina"],
  telefono: ["telefono", "celular", "telf movil", "telefono movil", "telefono celular", "telf"],
  correo: ["correo", "email", "correo electronico", "e-mail"],
  direccion: ["direccion", "direccion habitacion", "domicilio"],
  ficha: ["n.o de ficha", "n.º de ficha", "no de ficha", "nro de ficha", "ficha", "ficha trabajador", "nro ficha", "codigo"],
};

const norm = (s: unknown) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[_º°]/g, (c) => (c === "_" ? " " : "o"))
  .replace(/\s+/g, " ").trim().toLowerCase();
const VACIOS = new Set(["n/a", "na", "no posee", "no aplica", "-", "--", "s/n", "ninguno", "sin dato", "."]);

function texto(v: unknown): string {
  if (v === null || v === undefined) return "";
  // eslint-disable-next-line no-restricted-syntax -- fecha leída de una celda de Excel, no «hoy»
  if (v instanceof Date) return isNaN(v.getTime()) ? "" : v.toISOString().slice(0, 10);
  const t = String(v).replace(/\s+/g, " ").trim();
  return VACIOS.has(t.toLowerCase()) ? "" : t;
}

/** dd/mm/aaaa, dd-mm-aaaa, aaaa-mm-dd, número de serie de Excel → aaaa-mm-dd (o null si no es una fecha real). */
export function fechaISO(v: string): string | null {
  if (!v) return null;
  let iso: string | null = null;
  if (/^\d{4,5}(\.\d+)?$/.test(v) && Number(v) > 3000 && Number(v) < 80000) iso = sumarDias("1899-12-30", Math.floor(Number(v)));
  let m = v.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) iso = `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  m = v.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/);
  if (m) {
    const anio = m[3].length === 2 ? (Number(m[3]) > 30 ? "19" : "20") + m[3] : m[3];
    iso = `${anio}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  }
  if (!iso) return null;
  const [a, me, d] = iso.split("-").map(Number);
  const f = new Date(Date.UTC(a, me - 1, d));
  return f.getUTCFullYear() === a && f.getUTCMonth() === me - 1 && f.getUTCDate() === d && a >= 1900 ? iso : null;
}

/** «V-12.345.678», «12345678», «e 8123456» → «V-12345678» / «E-8123456». */
export function cedulaNomina(v: unknown): string | null {
  const k = claveCedula(v);
  return k ? `${k[0]}-${k.slice(1)}` : null;
}

const CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type FilaNomina = {
  fila: number;
  cedula: string; // normalizada (V-123…) o lo que vino si no es válida
  valida: boolean;
  datos: Partial<Record<CampoNomina, string>>; // solo lo que vino con valor (lo vacío nunca borra)
  sigue: boolean | null;
  avisos: string[]; // valores que no se pudieron leer (ese campo se ignora, el resto de la fila sigue)
};

export type Lectura = { filas: FilaNomina[]; faltan: string[]; repetidas: number; invalidas: number };

/** Lee la hoja: busca la fila de encabezados (la plantilla trae títulos arriba) y reconoce las columnas por su nombre. */
export function leerNomina(celdas: unknown[][], hoy: string): Lectura {
  const buscar = (fila: unknown[], campo: keyof typeof ALIAS) => fila.findIndex((c) => ALIAS[campo].includes(norm(c)));
  const enc = celdas.slice(0, 20).findIndex((f) => buscar(f, "cedula") >= 0);
  if (enc < 0) return { filas: [], faltan: ["Cédula"], repetidas: 0, invalidas: 0 };
  const cab = celdas[enc];
  const col = Object.fromEntries((Object.keys(ALIAS) as (keyof typeof ALIAS)[]).map((c) => [c, buscar(cab, c)])) as Record<keyof typeof ALIAS, number>;
  const cSigue = cab.findIndex(esEncabezadoSigue);

  const vistas = new Map<string, number>();
  const filas: FilaNomina[] = [];
  let repetidas = 0;
  let invalidas = 0;
  celdas.slice(enc + 1).forEach((c, i) => {
    if (c.every((x) => texto(x) === "")) return;
    const n = enc + i + 2;
    const leer = (k: keyof typeof ALIAS) => (col[k] >= 0 ? texto(c[col[k]]) : "");
    const crudo = leer("cedula");
    const cedula = cedulaNomina(crudo);
    if (!cedula) { invalidas++; filas.push({ fila: n, cedula: crudo, valida: false, datos: {}, sigue: null, avisos: [crudo ? "Cédula no válida" : "Sin cédula"] }); return; }
    if (vistas.has(cedula)) { repetidas++; filas.push({ fila: n, cedula, valida: false, datos: {}, sigue: null, avisos: [`Repetida (fila ${vistas.get(cedula)})`] }); return; }
    vistas.set(cedula, n);

    const avisos: string[] = [];
    const datos: FilaNomina["datos"] = {};
    for (const k of ["apellidos", "nombres", "cargo", "dependencia", "turno", "tipo", "direccion", "ficha"] as const) {
      const v = leer(k);
      if (v) datos[k] = v.slice(0, 200);
    }
    const sexo = norm(leer("sexo"));
    if (sexo) {
      if (/^(f|fem|femenino|mujer)$/.test(sexo)) datos.sexo = "F";
      else if (/^(m|masc|masculino|hombre|varon)$/.test(sexo)) datos.sexo = "M";
      else avisos.push(`Sexo «${leer("sexo")}» no se entiende (use F o M)`);
    }
    for (const [k, nombre] of [["fechaNacimiento", "nacimiento"], ["fechaIngreso", "ingreso"]] as const) {
      const v = leer(k);
      if (!v) continue;
      const f = fechaISO(v);
      if (!f) avisos.push(`Fecha de ${nombre} «${v}» no es válida`);
      else if (f > hoy) avisos.push(`Fecha de ${nombre} futura (${f.split("-").reverse().join("/")})`);
      else datos[k] = f;
    }
    const tel = leer("telefono").replace(/[^\d+]/g, "");
    if (tel.length >= 7) datos.telefono = tel.slice(0, 20);
    else if (leer("telefono")) avisos.push(`Teléfono «${leer("telefono")}» incompleto`);
    const correo = leer("correo").toLowerCase();
    if (correo && CORREO.test(correo)) datos.correo = correo.slice(0, 120);
    else if (correo) avisos.push(`Correo «${correo}» no es válido`);
    filas.push({ fila: n, cedula, valida: true, datos, sigue: cSigue >= 0 ? leerSigue(c[cSigue]) : null, avisos });
  });
  return { filas, faltan: [], repetidas, invalidas };
}

/** Un trabajador como está hoy en zamorApp (solo datos laborales y personales; nada clínico). */
export type Actual = {
  id: string;
  cedula: string;
  estado: string;
  empresaId: string;
  empresa: string;
} & Record<CampoNomina, string>;

export type Diferencia = { campo: CampoNomina; antes: string; despues: string; tipo: "completa" | "cambia" | "identidad" };
export type Cambio = { id: string; cedula: string; nombre: string; fila: number; difs: Diferencia[] };
export type Nuevo = { fila: number; cedula: string; datos: FilaNomina["datos"] };
export type Sale = { id: string; cedula: string; nombre: string; cargo: string; motivo: "no" | "ausente"; fila?: number };
export type Revisar = { fila: number; cedula: string; nombre: string; motivo: string; id?: string };
export type Completitud = { campo: CampoNomina; antes: number; despues: number };

export type Plan = {
  cambios: Cambio[];
  nuevos: Nuevo[];
  salen: Sale[];
  ausentes: Sale[];
  revisar: Revisar[];
  iguales: number;
  avisos: { fila: number; cedula: string; texto: string }[];
  completitud: Completitud[];
  poblacion: { antes: number; despues: number };
};

const ACTIVOS = new Set(["activo", "reposo", "aspirante"]);

/** Clave para comparar un valor: cargos y departamentos como la base (claveCargo); teléfonos solo dígitos. */
function comparable(campo: CampoNomina, v: string): string {
  if (!v) return "";
  if (campo === "cargo" || campo === "dependencia") return claveCargo(v);
  if (campo === "telefono") return v.replace(/\D/g, "").replace(/^58/, "0").replace(/^(?!0)/, "0");
  return norm(v);
}

/**
 * Compara la planilla con la nómina actual. `actuales` = los de esta empresa en la nómina (activo, reposo, aspirante);
 * `otros` = misma organización con esas cédulas pero en otra empresa o fuera de la nómina (van a «Revisar», nunca solos).
 */
export function planNomina(filas: FilaNomina[], actuales: Actual[], otros: Actual[], turnos: string[] = []): Plan {
  const porCedula = new Map(actuales.map((a) => [claveCedula(a.cedula), a]));
  const fuera = new Map(otros.map((a) => [claveCedula(a.cedula), a]));
  const turnoLista = new Map(turnos.map((t) => [norm(t), t]));
  const plan: Plan = { cambios: [], nuevos: [], salen: [], ausentes: [], revisar: [], iguales: 0, avisos: [], completitud: [], poblacion: { antes: actuales.length, despues: 0 } };
  const vistos = new Set<string>();

  for (const f of filas) {
    for (const a of f.avisos) plan.avisos.push({ fila: f.fila, cedula: f.cedula, texto: a });
    if (!f.valida) continue;
    const clave = claveCedula(f.cedula);
    // Turno escrito como la lista de zamorApp («diurno» → «Diurno»)
    const datos = { ...f.datos };
    if (datos.turno) datos.turno = turnoLista.get(norm(datos.turno)) ?? [...turnoLista.entries()].find(([k]) => k.startsWith(norm(datos.turno!)))?.[1] ?? datos.turno;
    const nombre = [datos.nombres, datos.apellidos].filter(Boolean).join(" ");
    const a = porCedula.get(clave);

    if (a) {
      vistos.add(clave);
      const nom = `${a.nombres} ${a.apellidos}`;
      if (f.sigue === false) { plan.salen.push({ id: a.id, cedula: a.cedula, nombre: nom, cargo: a.cargo, motivo: "no", fila: f.fila }); continue; }
      const difs: Diferencia[] = [];
      for (const campo of Object.keys(datos) as CampoNomina[]) {
        const nuevo = datos[campo]!;
        const antes = a[campo] ?? "";
        if (comparable(campo, nuevo) === comparable(campo, antes)) continue;
        difs.push({ campo, antes, despues: nuevo, tipo: !antes ? "completa" : IDENTIDAD.includes(campo) ? "identidad" : "cambia" });
      }
      if (difs.length) plan.cambios.push({ id: a.id, cedula: a.cedula, nombre: nom, fila: f.fila, difs });
      else plan.iguales++;
      continue;
    }

    const o = fuera.get(clave);
    if (o) {
      if (f.sigue === false) continue; // RR. HH. dice que no está y ya no está en esta empresa: nada que hacer
      const donde = ACTIVOS.has(o.estado) ? `Está en ${o.empresa}` : `Está ${o.estado === "egresado" ? "egresado" : "inactivo"} (${o.empresa})`;
      plan.revisar.push({ fila: f.fila, cedula: o.cedula, nombre: `${o.nombres} ${o.apellidos}`, motivo: `${donde}: ábrelo para ${ACTIVOS.has(o.estado) ? "pasarlo" : "reingresarlo"} a esta empresa`, id: o.id });
      continue;
    }
    if (f.sigue === false) continue; // no está en zamorApp y RR. HH. dice que no trabaja: no se registra
    if (!datos.nombres || !datos.apellidos) {
      plan.revisar.push({ fila: f.fila, cedula: f.cedula, nombre: nombre || "—", motivo: "Trabajador nuevo sin nombres o apellidos: complétalos en la planilla" });
      continue;
    }
    plan.nuevos.push({ fila: f.fila, cedula: f.cedula, datos });
  }

  for (const a of actuales) {
    if (!vistos.has(claveCedula(a.cedula))) plan.ausentes.push({ id: a.id, cedula: a.cedula, nombre: `${a.nombres} ${a.apellidos}`, cargo: a.cargo, motivo: "ausente" });
  }
  plan.poblacion.despues = actuales.length - plan.salen.length + plan.nuevos.length;

  // Datos completos para la vigilancia, antes y después (sin contar a los ausentes: Cesar decide si salen)
  const salen = new Set(plan.salen.map((s) => s.id));
  const porId = new Map(plan.cambios.map((c) => [c.id, c]));
  plan.completitud = PARA_VIGILANCIA.map((campo) => ({
    campo,
    antes: actuales.filter((a) => a[campo]).length,
    despues: actuales.filter((a) => !salen.has(a.id) && (a[campo] || porId.get(a.id)?.difs.some((d) => d.campo === campo))).length
      + plan.nuevos.filter((n) => n.datos[campo]).length,
  }));
  return plan;
}

/** Porcentaje entero (0 si no hay población). */
export const pct = (n: number, total: number) => (total ? Math.round((n * 100) / total) : 0);

/** El dato que se escribe en la planilla para cada campo (fechas dd/mm/aaaa). */
export const mostrar = (campo: CampoNomina, v: string) => (v && (campo === "fechaNacimiento" || campo === "fechaIngreso") ? v.split("-").reverse().join("/") : v || "—");

