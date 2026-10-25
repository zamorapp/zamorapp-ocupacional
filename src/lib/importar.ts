// Lectura y validación de nómina desde Excel o CSV para la carga masiva de pacientes.
// Acepta el formato MATRIZ REGISTRO SISTEMA (CEDULA, NOMBRE, APELLIDO, CARGO_ACTUAL…) y variantes.

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
  direccion: string;
  telefono: string;
  correo: string;
  lugarNacimiento: string;
  ficha: string;
  tipoPaciente: string;
  turno: string;
  estado: string;
  errores: string[];
};

type Campo = Exclude<keyof FilaImportada, "fila" | "errores">;
type CampoLeido = Campo | "telefonoHab" | "telefonoOfi" | "pais" | "ciudad";

// Encabezados aceptados para cada campo (sin acentos, en minúscula, "_" como espacio)
const ALIAS: Partial<Record<CampoLeido, string[]>> = {
  cedula: ["cedula", "ci", "c.i.", "cedula de identidad", "documento"],
  nombres: ["nombres", "nombre"],
  apellidos: ["apellidos", "apellido"],
  sexo: ["sexo", "genero"],
  fechaNacimiento: ["fecha nacimiento", "fecha de nacimiento", "nacimiento", "f. nacimiento"],
  cargo: ["cargo actual", "cargo", "puesto", "ocupacion"],
  dependencia: ["nombre dependencia", "dependencia", "departamento", "area", "gerencia"],
  fechaIngreso: ["fecha ingreso empresa", "fecha de ingreso", "fecha ingreso", "ingreso", "f. ingreso"],
  direccion: ["direccion habitacion", "direccion"],
  telefono: ["telf movil", "telefono movil", "celular", "telefono"],
  telefonoHab: ["telf habitacion", "telefono habitacion"],
  telefonoOfi: ["telf oficina", "telefono oficina"],
  correo: ["email", "correo", "correo electronico"],
  pais: ["pais nacimiento"],
  ciudad: ["ciudad nacimiento", "lugar de nacimiento", "lugar nacimiento"],
  ficha: ["ficha trabajador", "ficha", "nro ficha"],
  tipoPaciente: ["tipo paciente", "tipo de paciente", "tipo"],
  turno: ["turno trabajo", "turno"],
  estado: ["status", "estatus", "estado"],
};

export const COLUMNAS_PLANTILLA = [
  "CEDULA", "NOMBRE", "APELLIDO", "FECHA_NACIMIENTO", "SEXO", "DIRECCION_HABITACION", "TELF_HABITACION", "TELF_OFICINA",
  "TELF_MOVIL", "EMAIL", "PAIS_NACIMIENTO", "CIUDAD_NACIMIENTO", "FECHA_INGRESO_EMPRESA", "CARGO_ACTUAL", "ANTIGUEDAD_CARGO",
  "FICHA_TRABAJADOR", "TIPO_PACIENTE", "TURNO_TRABAJO", "NOMBRE_EMPRESA", "NOMBRE_DEPENDENCIA", "STATUS",
];

const sinAcentos = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/_/g, " ").replace(/\s+/g, " ").trim().toLowerCase();

// Valores que en las matrices significan "vacío"
const VACIOS = new Set(["n/a", "na", "no posee", "no aplica", "-", "--", "s/n", "ninguno"]);

function aTexto(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const t = String(v).trim();
  return VACIOS.has(t.toLowerCase()) ? "" : t;
}

// Acepta dd/mm/aaaa, dd-mm-aaaa, aaaa-mm-dd y fechas de Excel ya convertidas
function aFechaISO(v: string): string | null {
  if (!v) return null;
  // Número de serie de Excel (días desde 1899-12-30)
  if (/^\d{4,5}$/.test(v) && Number(v) > 3000 && Number(v) < 80000) {
    return new Date(Date.UTC(1899, 11, 30) + Number(v) * 864e5).toISOString().slice(0, 10);
  }
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

function normalizarEstado(v: string): string {
  const t = sinAcentos(v);
  if (!t) return "activo";
  if (t.startsWith("activ")) return "activo";
  if (t.startsWith("aspir")) return "aspirante";
  if (t.startsWith("egres") || t.startsWith("retir")) return "egresado";
  if (t.startsWith("repos")) return "reposo";
  if (t.startsWith("inact")) return "inactivo";
  return "";
}

export function validarFilas(filas: unknown[][], cedulasExistentes: Set<string>): { filas: FilaImportada[]; faltantes: string[] } {
  if (filas.length === 0) return { filas: [], faltantes: ["CEDULA", "NOMBRE", "APELLIDO"] };
  const encabezado = filas[0].map((c) => sinAcentos(aTexto(c)));
  const indice = {} as Record<CampoLeido, number>;
  for (const campo of Object.keys(ALIAS) as CampoLeido[]) {
    indice[campo] = ALIAS[campo]!.map((a) => encabezado.indexOf(a)).find((i) => i >= 0) ?? -1;
  }
  const faltantes = (["cedula", "nombres", "apellidos"] as const)
    .filter((c) => indice[c] < 0)
    .map((c) => ({ cedula: "CEDULA", nombres: "NOMBRE", apellidos: "APELLIDO" })[c]);
  if (faltantes.length) return { filas: [], faltantes };

  const vistas = new Map<string, number>();
  const resultado: FilaImportada[] = [];

  filas.slice(1).forEach((celdas, i) => {
    const leer = (c: CampoLeido) => (indice[c] >= 0 ? aTexto(celdas[indice[c]]) : "");
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

    const estadoTxt = leer("estado");
    const estado = normalizarEstado(estadoTxt);
    if (!estado) errores.push(`Status desconocido: ${estadoTxt}`);

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
      direccion: leer("direccion"),
      telefono: leer("telefono") || leer("telefonoHab") || leer("telefonoOfi"),
      correo: leer("correo").toLowerCase(),
      lugarNacimiento: [leer("ciudad"), leer("pais")].filter(Boolean).join(", "),
      ficha: leer("ficha"),
      tipoPaciente: leer("tipoPaciente"),
      turno: leer("turno"),
      estado: estado || "activo",
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
