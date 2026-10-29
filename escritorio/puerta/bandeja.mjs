// Bandeja de salida (fase A, local primero): lo que la app guardó en la base local sube a la nube con
// aplicar_cambios(), con la sesión del usuario que lo guardó (la nube vuelve a aplicar sus reglas de acceso).
// Lo aplicado se borra de la bandeja; un conflicto o rechazo queda anotado y nunca se pierde (la nube lo guarda
// en sync.conflictos y la PC conserva el cambio con su motivo).
import pg from "pg";

const LOTE = 200;
const REINTENTOS = 5;

export class Bandeja {
  constructor(estado, nube, motor, replica, registro = () => {}) {
    Object.assign(this, { estado, nube, motor, replica, registro });
    this.ultimoError = null;
  }

  // Una subida a la vez; si ya hay una en curso, se espera esa misma.
  subir() {
    this.enCurso ??= this.#subir().finally(() => { this.enCurso = null; });
    return this.enCurso;
  }

  async resumen() {
    const c = new pg.Client({ connectionString: this.motor.url() });
    try {
      await c.connect();
      const { rows } = await c.query("select estado, count(*)::int n from local.bandeja group by estado");
      const r = { pendientes: 0, conflictos: 0, rechazados: 0 };
      for (const f of rows) r[f.estado === "pendiente" ? "pendientes" : f.estado === "conflicto" ? "conflictos" : "rechazados"] = f.n;
      return r;
    } catch { return { pendientes: 0, conflictos: 0, rechazados: 0 }; } finally { await c.end().catch(() => {}); }
  }

  async #subir() {
    const eq = this.estado.d.equipo;
    if (!eq || !this.nube.enLinea) return false;
    const c = new pg.Client({ connectionString: this.motor.url() });
    let subio = false;
    try {
      await c.connect();
      for (;;) {
        const { rows } = await c.query(
          "select id, tabla, fila_id, op, version_base, datos, autor from local.bandeja where estado = 'pendiente' order by orden limit $1", [LOTE]);
        if (!rows.length) break;
        // Se sube en orden y con la sesión de cada autor: un lote termina donde cambia el autor
        const autor = rows[0].autor;
        const lote = [];
        for (const f of rows) { if (f.autor !== autor) break; lote.push(f); }
        if (!autor || !this.estado.d.usuarios[autor]?.nube) {
          this.ultimoError = "quien guardó no tiene sesión en la nube; entra con internet para subir sus cambios";
          this.registro(`[bandeja] ${lote.length} cambios esperan: ${this.ultimoError}`);
          return subio;
        }
        const r = await this.nube.rpc(autor, "aplicar_cambios", {
          p_equipo: eq.id, p_secreto: eq.secreto,
          p_lote: lote.map((f) => ({ id: f.id, tabla: f.tabla, fila_id: f.fila_id, op: f.op, version_base: f.version_base, datos: f.datos })),
        });
        const resultados = new Map((Array.isArray(r) ? r : []).map((x) => [x.id, x]));
        await c.query("begin");
        try {
          for (const f of lote) {
            const x = resultados.get(f.id);
            if (!x) { // la nube no respondió por este cambio: se reintenta unas veces y luego queda anotado, nunca se reintenta para siempre
              await c.query("update local.bandeja set intentos = intentos + 1, estado = case when intentos + 1 >= $2 then 'rechazado' else estado end, motivo = case when intentos + 1 >= $2 then 'La nube no respondió por este cambio' else motivo end where id = $1", [f.id, REINTENTOS]);
              continue;
            }
            if (x.estado === "aplicado" || x.estado === "duplicado") await c.query("delete from local.bandeja where id = $1", [f.id]);
            else {
              await c.query("update local.bandeja set estado = $2, motivo = $3 where id = $1", [f.id, x.estado === "conflicto" ? "conflicto" : "rechazado", x.motivo || null]);
              this.registro(`[bandeja] ${x.estado} en ${f.tabla} ${f.fila_id}: ${x.motivo || "sin motivo"}`);
            }
          }
          await c.query("commit");
        } catch (e) { await c.query("rollback"); throw e; }
        subio = true;
        this.ultimoError = null;
        if (lote.length < rows.length || rows.length < LOTE) { if (lote.length === rows.length) break; }
      }
    } catch (e) {
      this.ultimoError = e.message;
      this.registro(`[bandeja] no se pudo subir: ${e.message}`);
    } finally {
      await c.end().catch(() => {});
    }
    // Lo subido vuelve a bajar con su versión de la nube (y con lo que hayan cambiado otros)
    if (subio) await this.replica.ciclo().catch(() => {});
    return subio;
  }
}
