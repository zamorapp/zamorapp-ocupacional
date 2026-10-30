// Un diagnóstico agregado sin código se guarda con «—»: en lo impreso sale «sin CIE-10», nunca un código inventado
export const sinCodigo = (cie10: string | null | undefined) => !cie10 || cie10.trim() === "" || cie10.trim() === "—";

export const textoDiagnostico = (cie10: string | null | undefined, descripcion: string | null | undefined) =>
  sinCodigo(cie10) ? `${descripcion ?? ""} (sin CIE-10)`.trim() : `${cie10} ${descripcion ?? ""}`.trim();

// En los conteos (vigilancia, causas) todos los «sin código» suman juntos: no se muestra un nombre al azar
export const textoCausa = (cie10: string | null | undefined, descripcion: string | null | undefined) =>
  sinCodigo(cie10) ? "Sin CIE-10 (varios diagnósticos)" : `${cie10} ${descripcion ?? ""}`.trim();
