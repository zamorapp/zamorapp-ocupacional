import "server-only";

// Memoria corta en el servidor para cálculos pesados de reportes (p. ej. volver al trimestre que se acaba de ver).
// La clave debe incluir al usuario: lo que devuelve la base depende de sus permisos (RLS).
const almacen = new Map<string, { vence: number; valor: Promise<unknown> }>();
const MAXIMO = 300;

export function recordar<T>(clave: string, ms: number, calcular: () => Promise<T>): Promise<T> {
  const ahora = performance.now();
  const guardado = almacen.get(clave);
  if (guardado && guardado.vence > ahora) return guardado.valor as Promise<T>;
  const valor = calcular();
  // Un error no se recuerda: el próximo intento vuelve a la base
  valor.catch(() => almacen.delete(clave));
  almacen.set(clave, { vence: ahora + ms, valor });
  if (almacen.size > MAXIMO) {
    for (const [k, v] of almacen) if (v.vence <= ahora || almacen.size > MAXIMO) almacen.delete(k);
  }
  return valor;
}

// Borra lo recordado de una organización (al guardar datos que cambian los reportes)
export function olvidar(prefijo: string) {
  for (const k of almacen.keys()) if (k.startsWith(prefijo)) almacen.delete(k);
}
