// Perfiles de paraclínicos (lista «grupo_paraclinicos») por empresa y tipo de examen (motivo de consulta).
// lista_items.datos = { empresas: [id de empresa], motivos: [id del motivo] }; vacío = sirve para todas o todos.
// Compatibilidad: los perfiles viejos guardaban el nombre de la empresa en «grupo».
import type { Item } from "@/lib/listas";

export type AlcancePerfil = { empresas: string[]; motivos: string[] };
// Casilla empresa × motivo elegida en el asistente de Ajustes clínicos. null = cualquiera (todas las empresas / todo motivo).
export type Casilla = { e: string | null; m: string | null };

const ids = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.length > 0) : []);
const casillas = (v: unknown): Casilla[] =>
  Array.isArray(v)
    ? v.flatMap((x) => {
        const c = x as Record<string, unknown> | null;
        if (!c || typeof c !== "object") return [];
        const e = typeof c.e === "string" && c.e ? c.e : null;
        const m = typeof c.m === "string" && c.m ? c.m : null;
        return [{ e, m }];
      })
    : [];

export const alcancePerfil = (p: Pick<Item, "datos">): AlcancePerfil => ({ empresas: ids(p.datos?.empresas), motivos: ids(p.datos?.motivos) });
// pares: «usar este perfil en esta empresa y motivo» · excluir: «no sugerirlo en esta empresa y motivo».
export const casillasPerfil = (p: Pick<Item, "datos">) => ({ pares: casillas(p.datos?.pares), excluir: casillas(p.datos?.excluir) });
const precision = (c: Casilla) => (c.e ? 2 : 0) + (c.m ? 1 : 0);
const cubre = (c: Casilla, empresaId: string | null, motivoId: string | null) =>
  (c.e === null || c.e === empresaId) && (c.m === null || c.m === motivoId);

// Perfiles que corresponden a esta consulta, del más específico (empresa y motivo) al menos específico.
// Un perfil sin empresa ni motivo es genérico: se puede aplicar a mano, pero no se sugiere.
// Lo elegido en el asistente manda: «excluir» lo saca de esa casilla y «pares» lo pone primero.
export function perfilesSugeridos(perfiles: Item[], consulta: { empresaId: string | null; empresa: string; motivoId: string | null }) {
  const nombreEmpresa = consulta.empresa.toLowerCase();
  return perfiles
    .map((p) => {
      // Gana la casilla más precisa: «COSAPI · Pre-empleo» manda sobre «todas las empresas · Pre-empleo». A igual precisión, excluir.
      const { pares, excluir } = casillasPerfil(p);
      const mejor = (cs: Casilla[]) => Math.max(-1, ...cs.filter((c) => cubre(c, consulta.empresaId, consulta.motivoId)).map(precision));
      const par = mejor(pares);
      const fuera = mejor(excluir);
      if (fuera >= 0 && fuera >= par) return null;
      // Mismo orden que el alcance (empresa > motivo); a igual precisión, lo elegido en el asistente va primero
      if (par >= 0) return { perfil: p, puntos: 2 * par + 1 };
      const a = alcancePerfil(p);
      const porNombre = !a.empresas.length && Boolean(p.grupo && nombreEmpresa.includes(p.grupo.toLowerCase()));
      const empresa = a.empresas.length ? Boolean(consulta.empresaId && a.empresas.includes(consulta.empresaId)) : porNombre ? true : null;
      const motivo = a.motivos.length ? Boolean(consulta.motivoId && a.motivos.includes(consulta.motivoId)) : null;
      if (empresa === false || motivo === false || (empresa === null && motivo === null)) return null;
      return { perfil: p, puntos: 2 * ((empresa ? 2 : 0) + (motivo ? 1 : 0)) };
    })
    .filter((x): x is { perfil: Item; puntos: number } => x !== null)
    .sort((x, y) => y.puntos - x.puntos)
    .map((x) => x.perfil);
}

// Líneas del perfil que no coinciden con ningún examen del catálogo (mismo criterio que aplicarPerfilParaclinicos):
// se agregan igual como examen libre, pero sin rango ni semáforo. Solo se avisa; no bloquea el guardado.
const clave = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
export function examenesNoEncontrados(texto: string, catalogo: string[]) {
  const nombres = new Set(catalogo.map(clave));
  return texto.split("\n").map((l) => l.trim()).filter((l) => l && !nombres.has(clave(l)));
}
