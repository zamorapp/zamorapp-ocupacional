export const CUBETA_VIGILANCIA_PROYECTOS = "vigilancia-proyectos";
export const MAX_PDF_PROYECTO = 10 * 1024 * 1024;
export const ROLES_VIGILANCIA_PROYECTOS: readonly string[] = ["administrador", "gerente_medico", "medico"];
export const CONTRATO_VIGILANCIA = /^[A-Z0-9][A-Z0-9-]{0,39}$/;
const ARCHIVO_VIGILANCIA = /^([A-Z0-9][A-Z0-9-]{0,39})--(20[0-9]{2})-T([1-4])\.pdf$/;

export function datosBorradorProyecto(archivo: string) {
  const m = ARCHIVO_VIGILANCIA.exec(archivo);
  if (!m || m[0] !== archivo) return null;
  const [, contrato, anio, trimestre] = m;
  const nombre = `${["", "I", "II", "III", "IV"][Number(trimestre)]} trimestre de ${anio}`;
  return { contrato, anio, trimestre, nombre };
}
