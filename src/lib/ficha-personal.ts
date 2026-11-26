import { normalizarCedula } from "@/lib/importar";
import { lateralidadValida, normalizarLateralidad } from "@/lib/lateralidad";
import type { Rol } from "@/lib/sesion-roles";

const ROLES = new Set<Rol>(["administrador", "gerente_medico", "medico", "enfermeria", "recepcion", "coordinador_sst"]);
export const puedeEditarFichaPersonal = (rol: Rol | null) => rol !== null && ROLES.has(rol);

const CAMPOS = {
  nombres: ["Nombres", 120],
  apellidos: ["Apellidos", 120],
  cedula: ["Cédula", 24],
  telefono: ["Teléfono", 60],
  correo: ["Correo", 254],
  fecha_nacimiento: ["Fecha de nacimiento", 10],
  sexo: ["Sexo", 1],
  lugar_nacimiento: ["Lugar de nacimiento", 160],
  direccion: ["Dirección", 500],
  profesion: ["Profesión", 160],
  nivel_educativo: ["Nivel educativo", 160],
  lateralidad: ["Lateralidad", 20],
} as const;

type Campo = keyof typeof CAMPOS;
export type DatosFichaPersonal = Record<Campo, string | null> & { version: number };
const claves = Object.keys(CAMPOS) as Campo[];
export const COLUMNAS_FICHA_PERSONAL = ["version", ...claves].join(", ");

export function cambiosFichaPersonal(formulario: FormData, actual: DatosFichaPersonal, hoy: string):
  { ok: true; cambios: Partial<Record<Campo, string | null>> } | { ok: false; mensaje: string } {
  const cambios: Partial<Record<Campo, string | null>> = {};
  for (const campo of claves) {
    if (!formulario.has(campo)) continue;
    const valor = formulario.get(campo);
    const [etiqueta, max] = CAMPOS[campo];
    if (typeof valor !== "string") return { ok: false, mensaje: `Revisa el campo «${etiqueta}».` };
    let nuevo: string | null = valor.trim() || null;
    // Una edición de contacto también debe funcionar para fichas importadas con datos antiguos.
    if (nuevo === (actual[campo]?.trim() || null)) continue;
    if (nuevo && nuevo.length > max) return { ok: false, mensaje: `«${etiqueta}» admite hasta ${max} caracteres.` };
    if ((campo === "nombres" || campo === "apellidos") && !nuevo) return { ok: false, mensaje: "Escribe nombres y apellidos." };
    if (campo === "cedula") {
      nuevo = normalizarCedula(nuevo ?? "");
      if (!nuevo) return { ok: false, mensaje: "Cédula inválida. Ejemplo: V-12345678." };
    }
    if (campo === "correo" && nuevo && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(nuevo)) {
      return { ok: false, mensaje: "Escribe un correo válido." };
    }
    if (campo === "sexo" && nuevo && nuevo !== "F" && nuevo !== "M") return { ok: false, mensaje: "Elige un sexo válido." };
    if (campo === "fecha_nacimiento" && nuevo) {
      const dia = new Date(`${nuevo}T00:00:00Z`);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(nuevo) || nuevo.startsWith("0000") || !Number.isFinite(dia.getTime()) || dia.toISOString().split("T")[0] !== nuevo) {
        return { ok: false, mensaje: "La fecha de nacimiento no es válida." };
      }
      if (nuevo > hoy) return { ok: false, mensaje: "La fecha de nacimiento no puede ser futura." };
    }
    if (campo === "lateralidad") {
      nuevo = normalizarLateralidad(nuevo);
      if (!lateralidadValida(nuevo)) return { ok: false, mensaje: "Elige una lateralidad válida." };
    }
    if (nuevo !== actual[campo]) cambios[campo] = nuevo;
  }
  return { ok: true, cambios };
}
