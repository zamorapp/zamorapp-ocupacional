// Perfiles de paraclínicos (lista «grupo_paraclinicos») por empresa y tipo de examen (motivo de consulta).
// lista_items.datos = { empresas: [id de empresa], motivos: [id del motivo] }; vacío = sirve para todas o todos.
// Compatibilidad: los perfiles viejos guardaban el nombre de la empresa en «grupo».
import type { Item } from "@/lib/listas";

export type AlcancePerfil = { empresas: string[]; motivos: string[] };

const ids = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.length > 0) : []);

export const alcancePerfil = (p: Pick<Item, "datos">): AlcancePerfil => ({ empresas: ids(p.datos?.empresas), motivos: ids(p.datos?.motivos) });

// Perfiles que corresponden a esta consulta, del más específico (empresa y motivo) al menos específico.
// Un perfil sin empresa ni motivo es genérico: se puede aplicar a mano, pero no se sugiere.
export function perfilesSugeridos(perfiles: Item[], consulta: { empresaId: string | null; empresa: string; motivoId: string | null }) {
  const nombreEmpresa = consulta.empresa.toLowerCase();
  return perfiles
    .map((p) => {
      const a = alcancePerfil(p);
      const porNombre = !a.empresas.length && Boolean(p.grupo && nombreEmpresa.includes(p.grupo.toLowerCase()));
      const empresa = a.empresas.length ? Boolean(consulta.empresaId && a.empresas.includes(consulta.empresaId)) : porNombre ? true : null;
      const motivo = a.motivos.length ? Boolean(consulta.motivoId && a.motivos.includes(consulta.motivoId)) : null;
      if (empresa === false || motivo === false || (empresa === null && motivo === null)) return null;
      return { perfil: p, puntos: (empresa ? 2 : 0) + (motivo ? 1 : 0) };
    })
    .filter((x): x is { perfil: Item; puntos: number } => x !== null)
    .sort((x, y) => y.puntos - x.puntos)
    .map((x) => x.perfil);
}
