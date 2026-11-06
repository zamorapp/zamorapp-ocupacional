// Pacientes particulares (Cesar, 05-nov-2026): «Particular no es una empresa». La organización guarda a sus pacientes
// particulares en una bolsa (empresas.es_particular, migración 20261030894000). Hasta que esa migración llegue a una
// base, la bolsa se reconoce por el nombre o el RIF que trajo del SAME; así los impresos ya salen bien en ambos casos.
// Nunca se muestra como empresa: en pantalla y en papel dice «Paciente particular».

export const NOMBRE_PARTICULARES = "Pacientes particulares";
export const ETIQUETA_PARTICULAR = "Particular (sin empresa)";

const NOMBRES = new Set(["PARTICULAR", "PARTICULARES", "PACIENTES PARTICULARES"]);
const RIFS = new Set(["PARTICULR", "PARTICULARES"]);

export function esParticular(e: { es_particular?: boolean | null; razon_social?: string | null; razonSocial?: string | null; rif?: string | null } | null | undefined) {
  if (!e) return false;
  if (e.es_particular) return true;
  const nombre = (e.razon_social ?? e.razonSocial ?? "").trim().toUpperCase();
  return NOMBRES.has(nombre) || RIFS.has((e.rif ?? "").trim().toUpperCase());
}

// La certificación que firma el paciente particular: sin «empresa empleadora» (no la tiene)
export const CERTIFICACION_PARTICULAR =
  "Para todos los efectos legales certifico que he sido examinado, que toda la información que suministré es veraz en lo que a mis conocimientos se refiere, y que autorizo la realización de los exámenes médicos, de laboratorio clínico y de radiología necesarios para mi evaluación.";
