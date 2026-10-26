// Supabase entrega como máximo 1.000 filas por pedido: se piden las páginas en paralelo
export const PAGINA = 1000;
export async function todas<T>(pedir: (desde: number, hasta: number) => PromiseLike<{ data: unknown; count?: number | null; error: unknown }>): Promise<T[]> {
  const primera = await pedir(0, PAGINA - 1);
  if (primera.error) throw primera.error;
  const filas = (primera.data ?? []) as T[];
  const total = primera.count ?? filas.length;
  const resto = await Promise.all(
    Array.from({ length: Math.max(0, Math.ceil(total / PAGINA) - 1) }, (_, i) => pedir((i + 1) * PAGINA, (i + 2) * PAGINA - 1)),
  );
  for (const r of resto) { if (r.error) throw r.error; filas.push(...((r.data ?? []) as T[])); }
  return filas;
}
