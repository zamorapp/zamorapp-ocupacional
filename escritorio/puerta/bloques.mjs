// Fase B (local primero): bloques de números de historia. La nube los reserva a este equipo (reservar_bloque) y la
// PC numera desde ellos (escritorio/base/40_bloques.sql). Cuando quedan pocos se pide otro, siempre con internet.
import pg from "pg";

const TAMANO = 100; // números por bloque
const MINIMO = 20; // con menos libres se pide otro bloque

export class Bloques {
  constructor(estado, nube, motor, replica, registro = () => {}) {
    Object.assign(this, { estado, nube, motor, replica, registro });
    this.ultimoError = null;
  }

  async libres() {
    const c = new pg.Client({ connectionString: this.motor.url() });
    try {
      await c.connect();
      const { rows: [f] } = await c.query("select local.numeros_libres()::int as n");
      return f?.n || 0;
    } catch { return 0; } finally { await c.end().catch(() => {}); }
  }

  // Con internet: si quedan menos de MINIMO números, pide un bloque a la nube con la sesión de un usuario de la PC
  async reponer() {
    const eq = this.estado.d.equipo;
    if (!eq || !this.nube.enLinea) return false;
    if ((await this.libres()) >= MINIMO) return false;
    const uid = this.replica.usuarioSincronia();
    if (!uid) { this.ultimoError = "sin un usuario con sesión en la nube para pedir números de historia"; return false; }
    const c = new pg.Client({ connectionString: this.motor.url() });
    try {
      const r = await this.nube.rpc(uid, "reservar_bloque", { p_equipo: eq.id, p_secreto: eq.secreto, p_tamano: TAMANO });
      if (!r || typeof r.desde !== "number" && typeof r.desde !== "string") throw new Error("la nube no devolvió un bloque");
      await c.connect();
      await c.query("insert into local.bloques (desde, hasta, siguiente, equipo_id) values ($1, $2, $1, $3)", [r.desde, r.hasta, eq.id]);
      this.registro(`[bloques] números de historia ${r.desde} a ${r.hasta} reservados para esta PC`);
      this.ultimoError = null;
      return true;
    } catch (e) {
      this.ultimoError = e.message;
      this.registro(`[bloques] no se pudo reservar un bloque: ${e.message}`);
      return false;
    } finally { await c.end().catch(() => {}); }
  }
}
