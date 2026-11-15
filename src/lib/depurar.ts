// Depurar trabajadores con RR. HH. (Cesar, 31-oct): la columna que RR. HH. llena en el Excel y cómo se lee al subirlo
export const COLUMNA_SIGUE = "¿Sigue en la empresa? (SÍ / NO)";

const sinAcentos = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/** «NO», «no», «N», «ya no» → false; «SÍ», «si», «S», «x»… → true; vacío o ilegible → null (queda sin marcar). */
export function leerSigue(v: unknown): boolean | null {
  const t = sinAcentos(String(v ?? ""));
  if (!t) return null;
  if (/^(no|n|ya no|no esta|inactivo|egresado)\b/.test(t)) return false;
  if (/^(si|s|x|activo|sigue)\b/.test(t)) return true;
  return null;
}

/** Cédula comparable: «V-12.345.678», «12345678» y «v12345678» son la misma. */
export const claveCedula = (v: unknown) => {
  const m = String(v ?? "").toUpperCase().replace(/[.\s-]/g, "").match(/^([VEP])?(\d{5,9})$/);
  return m ? `${m[1] ?? "V"}${m[2]}` : "";
};

export const esEncabezadoCedula = (v: unknown) => sinAcentos(String(v ?? "")).startsWith("cedula");
export const esEncabezadoSigue = (v: unknown) => sinAcentos(String(v ?? "")).includes("sigue");
