// Toda conexión de la puerta a una base pasa por aquí. Si PostgreSQL corta una conexión mientras está quieta
// (respaldo, restauración, reinicio de la base), pg emite «error» en el cliente y, sin quien lo escuche, Node
// cierra la puerta entera y la app deja de abrir. Con este oyente el corte queda en el registro y quien estaba
// usando la conexión recibe el error en su consulta, como siempre.
import pg from "pg";

class Client extends pg.Client {
  constructor(opciones) {
    super(opciones);
    this.on("error", (e) => console.error(`[base] conexión cortada: ${e.message}`));
  }
}

export default { ...pg, Client };

// Candado de escrituras (06-nov-2026, 40P01 en el CI de Windows del #306): cada guardado de la app (PostgREST, ver
// escritorio/base/50_candado_escrituras.sql) lo toma COMPARTIDO al empezar, antes de tocar una fila; la réplica y la
// bandeja lo toman EXCLUSIVO al abrir cada transacción. Así nunca se cruzan a mitad de camino: guardar_consulta toma la
// consulta y luego la aptitud, la réplica aplicaba la aptitud y luego la consulta, y cada uno esperaba al otro.
// Los guardados entre sí no se frenan (compartido con compartido) y la réplica espera a que terminen los que van.
export const CANDADO_ESCRITURAS = 7346298101;
export const tomarCandado = (c) => c.query("select pg_advisory_xact_lock($1)", [CANDADO_ESCRITURAS]);
// Error pasajero de la base (bloqueo mutuo o choque de serialización): la transacción se deshizo entera y repetirla
// es seguro
export const esPasajero = (e) => e?.code === "40P01" || e?.code === "40001";

// Abre una transacción con el candado exclusivo, corre `fn` y confirma. Si la base la deshace por un error pasajero,
// la repite (hasta `intentos` veces, con una espera corta y creciente); cualquier otro error sale como siempre.
export async function enTransaccion(c, fn, { intentos = 3 } = {}) {
  for (let i = 1; ; i++) {
    await c.query("begin");
    try {
      await tomarCandado(c);
      const r = await fn();
      await c.query("commit");
      return r;
    } catch (e) {
      await c.query("rollback").catch(() => {});
      if (!esPasajero(e) || i >= intentos) throw e;
      await new Promise((ok) => setTimeout(ok, 50 * i + Math.floor(Math.random() * 50)));
    }
  }
}
