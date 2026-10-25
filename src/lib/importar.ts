// Lectura y validación de nómina desde Excel o CSV para la carga masiva de pacientes.

export type FilaImportada = {
  fila: number;
  cedula: string;
  nombres: string;
  apellidos: string;
  sexo: string;
  fechaNacimiento: string;
  cargo: string;
  dependencia: string;
  fechaIngreso: string;
  errores: string[];
};

type Campo = Exclude<keyof FilaImportada, "fila" | "errores">;

// Encabezados aceptados para cada campo (sin acentos, en minúscula)
const ALIAS: Record<Campo, string[]> = {
  cedula: ["cedula", "ci", "c.i.", "cedula de identidad", "documento"],
  nombres: ["nombres", "nombre"],
  apellidos: ["apellidos", "apellido"],
  sexo: ["sexo", "genero"],
  fechaNacimiento: ["fecha de nacimiento", "fecha nacimiento", "nacimiento", "f. nacimiento"],
  cargo: ["cargo", "puesto", "ocupacion"],
  dependencia: ["dependencia", "departamento", "area", "gerencia"],
  fechaIngreso: ["fecha de ingreso", "fecha ingreso", "ingreso", "f. ingreso"],
};

export const COLUMNAS_PLANTILLA = ["Cédula", "Nombres", "Apellidos", "Sexo", "Fecha de nacimiento", "Cargo", "Dependencia", "Fecha de ingreso"];

const sinAcentos = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();

function aTexto(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).trim();
}

// Acepta dd/mm/aaaa, dd-mm-aaaa, aaaa-mm-dd y fechas de Excel ya convertidas
function aFechaISO(v: string): string | null {
  if (!v) return null;
  let m = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = v.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (m) {
    const iso = `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
    return isNaN(Date.parse(iso)) ? null : iso;
  }
  return null;
}

function normalizarCedula(v: string): string | null {
  const limpio = v.toUpperCase().replace(/[.\s]/g, "");
  const m = limpio.match(/^([VEP])?-?(\d{5,9})$/);
  return m ? `${m[1] ?? "V"}-${m[2]}` : null;
}

export function validarFilas(filas: unknown[][], cedulasExistentes: Set<string>): { filas: FilaImportada[]; faltantes: string[] } {
  if (filas.length === 0) return { filas: [], faltantes: COLUMNAS_PLANTILLA };
  const encabezado = filas[0].map((c) => sinAcentos(aTexto(c)));
  const indice = {} as Record<Campo, number>;
  for (const campo of Object.keys(ALIAS) as Campo[]) {
    indice[campo] = encabezado.findIndex((h) => ALIAS[campo].includes(h));
  }
  const obligatorios: Campo[] = ["cedula", "nombres", "apellidos"];
  const faltantes = obligatorios.filter((c) => indice[c] < 0).map((c) => COLUMNAS_PLANTILLA[Object.keys(ALIAS).indexOf(c)]);
  if (faltantes.length) return { filas: [], faltantes };

  const vistas = new Map<string, number>();
  const resultado: FilaImportada[] = [];

  filas.slice(1).forEach((celdas, i) => {
    const leer = (c: Campo) => (indice[c] >= 0 ? aTexto(celdas[indice[c]]) : "");
    if (celdas.every((c) => aTexto(c) === "")) return; // fila vacía
    const errores: string[] = [];

    const cedula = normalizarCedula(leer("cedula"));
    if (!cedula) errores.push("Cédula inválida");
    else if (cedulasExistentes.has(cedula)) errores.push("Ya existe en el expediente");
    else if (vistas.has(cedula)) errores.push(`Repetida (fila ${vistas.get(cedula)})`);
    if (cedula && !vistas.has(cedula)) vistas.set(cedula, i + 2);

    const nombres = leer("nombres");
    const apellidos = leer("apellidos");
    if (!nombres) errores.push("Falta el nombre");
    if (!apellidos) errores.push("Falta el apellido");

    const sexoTxt = sinAcentos(leer("sexo"));
    const sexo = sexoTxt.startsWith("f") ? "F" : sexoTxt.startsWith("m") ? "M" : "";
    if (sexoTxt && !sexo) errores.push("Sexo inválido (use F o M)");

    const nacTxt = leer("fechaNacimiento");
    const fechaNacimiento = aFechaISO(nacTxt);
    if (nacTxt && !fechaNacimiento) errores.push("Fecha de nacimiento inválida");

    const ingTxt = leer("fechaIngreso");
    const fechaIngreso = aFechaISO(ingTxt);
    if (ingTxt && !fechaIngreso) errores.push("Fecha de ingreso inválida");

    resultado.push({
      fila: i + 2,
      cedula: cedula ?? leer("cedula"),
      nombres,
      apellidos,
      sexo,
      fechaNacimiento: fechaNacimiento ?? nacTxt,
      cargo: leer("cargo"),
      dependencia: leer("dependencia"),
      fechaIngreso: fechaIngreso ?? ingTxt,
      errores,
    });
  });

  return { filas: resultado, faltantes: [] };
}

export function leerCSV(texto: string): string[][] {
  const lineas = texto.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim());
  const sep = (lineas[0]?.match(/;/g)?.length ?? 0) > (lineas[0]?.match(/,/g)?.length ?? 0) ? ";" : ",";
  return lineas.map((l) => {
    const celdas: string[] = [];
    let actual = "";
    let comillas = false;
    for (const ch of l) {
      if (ch === '"') comillas = !comillas;
      else if (ch === sep && !comillas) { celdas.push(actual); actual = ""; }
      else actual += ch;
    }
    celdas.push(actual);
    return celdas;
  });
}
