// Bandeja de salida (fase A, local primero): lo que la app guardó en la base local sube a la nube con
// aplicar_cambios(), con la sesión del usuario que lo guardó (la nube vuelve a aplicar sus reglas de acceso).
// Lo aplicado se borra de la bandeja; un conflicto o rechazo queda anotado y nunca se pierde (la nube lo guarda
// en sync.conflictos y la PC conserva el cambio con su motivo).
import pg from "pg";

const LOTE = 200;
const REINTENTOS = 5;
const TABLA = /^(public|clinico)\.[a-z_0-9]+$/; // nombre de tabla seguro para armar la consulta
const RESUELVEN = ["administrador", "gerente_medico"]; // además del autor

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
    const sinSesion = [];
    try {
      await c.connect();
      // El orden se respeta dentro de cada autor; un autor sin sesión en la nube (o sin su código) no detiene
      // a los demás: sus cambios esperan y se avisa (Analizar, 29-oct-2026). Entre autores distintos puede haber
      // un rechazo por llave foránea (B edita lo que A creó y A aún no subió): queda en Rechazados y se resuelve
      // con «reintentar» cuando lo de A ya subió.
      const { rows: autores } = await c.query("select autor, count(*)::int as n from local.bandeja where estado = 'pendiente' group by autor order by min(orden)");
      for (const { autor, n } of autores) {
        // token() renueva la sesión del autor; si la nube la rechazó (clave cambiada, sesión revocada) o le falta el
        // código, ese autor espera a entrar con internet y los demás siguen
        if (!autor || !(await this.nube.token(autor).catch(() => null))) { sinSesion.push({ autor, n }); continue; }
        for (;;) {
          const { rows: lote } = await c.query(
            "select id, tabla, fila_id, op, version_base, datos, hora_verificada from local.bandeja where estado = 'pendiente' and autor = $1 order by orden limit $2", [autor, LOTE]);
          if (!lote.length) break;
          const r = await this.nube.rpc(autor, "aplicar_cambios", {
            p_equipo: eq.id, p_secreto: eq.secreto,
            p_lote: lote.map((f) => ({ id: f.id, tabla: f.tabla, fila_id: f.fila_id, op: f.op, version_base: f.version_base, datos: f.datos, hora_verificada: f.hora_verificada })),
          });
          const resultados = new Map((Array.isArray(r) ? r : []).map((x) => [x.id, x]));
          const reponer = [];
          await c.query("begin");
          try {
            for (const f of lote) {
              const x = resultados.get(f.id);
              if (!x) { // la nube no respondió por este cambio: se reintenta unas veces y luego queda anotado, nunca se reintenta para siempre
                await c.query("update local.bandeja set intentos = intentos + 1, estado = case when intentos + 1 >= $2 then 'rechazado' else estado end, motivo = case when intentos + 1 >= $2 then 'La nube no respondió por este cambio' else motivo end where id = $1", [f.id, REINTENTOS]);
                continue;
              }
              // «duplicado» solo llega por el mismo cambio o por una fila igual con el mismo id: no hay nada que conservar
              if (x.estado === "aplicado" || x.estado === "duplicado") await c.query("delete from local.bandeja where id = $1", [f.id]);
              else {
                await c.query("update local.bandeja set estado = $2, motivo = $3 where id = $1", [f.id, x.estado === "conflicto" ? "conflicto" : "rechazado", x.motivo || null]);
                this.registro(`[bandeja] ${x.estado} en ${f.tabla} ${f.fila_id}: ${x.motivo || "sin motivo"}`);
                reponer.push(f);
              }
            }
            await c.query("commit");
          } catch (e) { await c.query("rollback"); throw e; }
          subio = true;
          // La copia local vuelve a mostrar lo que hay en la nube; lo escrito aquí queda en la bandeja para revisarlo
          for (const f of reponer) {
            try { await this.replica.reponerFila(autor, f.tabla, f.fila_id); } catch (e) { this.registro(`[bandeja] no se pudo volver a bajar ${f.tabla} ${f.fila_id}: ${e.message}`); }
          }
          if (lote.length < LOTE) break;
        }
      }
      this.ultimoError = sinSesion.length
        ? `${sinSesion.reduce((a, x) => a + x.n, 0)} cambios esperan: quien los guardó no tiene sesión en la nube (o le falta el código); que entre con internet`
        : null;
      if (sinSesion.length) this.registro(`[bandeja] ${this.ultimoError}`);
    } catch (e) {
      this.ultimoError = e.message;
      this.registro(`[bandeja] no se pudo subir: ${e.stack || e.message}`);
    } finally {
      await c.end().catch(() => {});
    }
    // Lo subido vuelve a bajar con su versión de la nube (y con lo que hayan cambiado otros)
    if (subio) await this.replica.ciclo().catch(() => {});
    return subio;
  }

  // Lista «Conflictos/Rechazados» (y lo pendiente) para la pantalla: qué, de quién, cuándo y por qué
  // Solo los casos que quien pregunta puede resolver (su autor, un administrador o el gerente médico), cada uno con
  // lo escrito en la PC (datos) y, para esos mismos campos, lo que hay ahora en la copia de la nube (nube: la fila en
  // conflicto volvió a bajar). Nunca columnas que no estén en el cambio.
  async lista(quien = null) {
    const c = new pg.Client({ connectionString: this.motor.url() });
    const puede = (f) => !quien || f.autor === quien.uid || RESUELVEN.includes(quien.rol);
    try {
      await c.connect();
      const { rows } = await c.query(
        "select id, tabla, fila_id, op, estado, motivo, autor, creado, intentos, datos from local.bandeja where estado <> 'pendiente' order by creado desc limit 500");
      const { rows: [p] } = await c.query("select count(*)::int as n from local.bandeja where estado = 'pendiente'");
      const revisar = [];
      for (const f of rows.filter(puede)) {
        let nube = null;
        if (TABLA.test(f.tabla)) {
          const { rows: [n] } = await c.query(`select to_jsonb(t) as fila from ${f.tabla} t where id = $1`, [f.fila_id]).catch(() => ({ rows: [] }));
          if (n?.fila) nube = Object.fromEntries(Object.keys(f.datos || {}).map((k) => [k, n.fila[k] ?? null]));
        }
        revisar.push({ ...f, nube, autorNombre: this.estado.d.usuarios[f.autor]?.user?.email || null });
      }
      return { pendientes: p.n, revisar };
    } finally { await c.end().catch(() => {}); }
  }

  // Decisión de quien revisa un conflicto: «descartar» (la nube manda; la copia ya la muestra) o «reintentar»
  // (lo escrito en la PC se vuelve a subir sobre la versión actual de la nube). Solo el autor, un administrador
  // o el gerente médico.
  async resolver(id, accion, quien) {
    const c = new pg.Client({ connectionString: this.motor.url() });
    try {
      await c.connect();
      const { rows: [f] } = await c.query("select id, tabla, fila_id, autor from local.bandeja where id = $1 and estado <> 'pendiente'", [id]);
      if (!f) return { error: "No existe ese cambio o ya está resuelto" };
      if (f.autor !== quien.uid && !RESUELVEN.includes(quien.rol)) return { error: "Solo el autor, un administrador o el gerente médico lo resuelven" };
      if (accion === "descartar") { await c.query("delete from local.bandeja where id = $1", [id]); return { hecho: "descartado" }; }
      if (accion === "reintentar") {
        const { rows: [v] } = await c.query(`select version from ${TABLA.test(f.tabla) ? f.tabla : "local.bandeja"} where id = $1`, [f.fila_id]).catch(() => ({ rows: [] }));
        await c.query("update local.bandeja set estado = 'pendiente', motivo = null, intentos = 0, version_base = coalesce($2, version_base) where id = $1", [id, v?.version ?? null]);
        return { hecho: "pendiente" };
      }
      return { error: "Acción desconocida" };
    } finally { await c.end().catch(() => {}); }
  }
}

