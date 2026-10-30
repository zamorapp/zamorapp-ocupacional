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
