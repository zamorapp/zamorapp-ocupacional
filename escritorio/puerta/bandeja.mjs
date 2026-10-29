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

  // Una subida a la vez. Si ya hay una en curso, se encadena UNA pasada más al terminar (la comparten todos los que
  // pidieron mientras tanto): lo guardado después del último select de la pasada en curso también sube
  // («Sincronizar ahora» no espera al ciclo de 30 s).
  subir() {
    if (!this.enCurso) {
      this.enCurso = this.#subir().finally(() => { this.enCurso = null; });
      return this.enCurso;
    }
    this.otraVez ??= this.enCurso.catch(() => {}).then(() => { this.otraVez = null; return this.subir(); });
    return this.otraVez;
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
          const { rows: todos } = await c.query(
            "select id, tabla, fila_id, op, version_base, datos, hora_verificada from local.bandeja where estado = 'pendiente' and autor = $1 order by orden limit $2", [autor, LOTE]);
          if (!todos.length) break;
          // Un solo cambio por fila en cada envío: el siguiente de la misma fila sale en el próximo, sobre la versión
          // que deje este (si fueran juntos, el segundo llevaría una base ya vieja y sería un conflicto falso)
          const vistas = new Set();
          const lote = todos.filter((f) => { const k = `${f.tabla}:${f.fila_id}`; if (vistas.has(k)) return false; vistas.add(k); return true; });
          const r = await this.nube.rpc(autor, "aplicar_cambios", {
            p_equipo: eq.id, p_secreto: eq.secreto,
            p_lote: lote.map((f) => ({ id: f.id, tabla: f.tabla, fila_id: f.fila_id, op: f.op, version_base: f.version_base, datos: f.datos, hora_verificada: f.hora_verificada })),
          });
          const resultados = new Map((Array.isArray(r) ? r : []).map((x) => [x.id, x]));
          const reponer = [];
          let quedaron = 0; // cambios que siguieron pendientes porque se guardó otra vez mientras subían
          await c.query("begin");
          try {
            for (const f of lote) {
              const x = resultados.get(f.id);
              if (!x) { // la nube no respondió por este cambio: se reintenta unas veces y luego queda anotado, nunca se reintenta para siempre
                await c.query("update local.bandeja set intentos = intentos + 1, estado = case when intentos + 1 >= $2 then 'rechazado' else estado end, motivo = case when intentos + 1 >= $2 then 'La nube no respondió por este cambio' else motivo end where id = $1", [f.id, REINTENTOS]);
                continue;
              }
              // «duplicado» solo llega por el mismo cambio o por una fila igual con el mismo id: no hay nada que conservar
              if (x.estado === "aplicado" || x.estado === "duplicado") {
                // La versión que dejó este cambio es la base de los siguientes de esta PC en la misma fila (la copia
                // aún no la bajó). Solo si es justo la siguiente de su base: así nadie más la tocó en medio y no se
                // salta un conflicto de verdad. Si otro la cambió en medio, la base no avanza y la nube decide.
                const propia = x.estado === "aplicado" && x.version != null &&
                  (f.op === "I" ? Number(x.version) === 1 : f.version_base != null && Number(x.version) === Number(f.version_base) + 1);
                if (f.op === "D") await c.query("delete from local.version_nube where tabla = $1 and fila_id = $2", [f.tabla, f.fila_id]);
                else if (propia) {
                  await c.query("insert into local.version_nube (tabla, fila_id, version) values ($1, $2, $3) on conflict (tabla, fila_id) do update set version = greatest(local.version_nube.version, excluded.version)", [f.tabla, f.fila_id, x.version]);
                }
                // Si mientras subía se guardó otra vez la misma fila, ese guardado se fundió en este cambio: no se
                // borra, queda pendiente con todo lo que falta subir. Lleva un id nuevo: la nube ya anotó este id como
                // aplicado y lo volvería a contestar «duplicado» (se perdería lo fundido)
                const { rowCount } = await c.query("delete from local.bandeja where id = $1 and datos is not distinct from $2::jsonb", [f.id, f.datos == null ? null : JSON.stringify(f.datos)]);
                if (!rowCount) quedaron += 1;
                if (!rowCount) await c.query("update local.bandeja set id = gen_random_uuid(), op = case when op = 'I' then 'U' else op end, version_base = case when $2::bigint is null then version_base else $2::bigint end, intentos = 0 where id = $1", [f.id, propia ? x.version : null]);
                // La nube ya tenía esa fila con otro id (misma clave natural, p. ej. el informe de vigilancia de la empresa
                // y el período hecho también en la web) y fundió ahí lo de esta PC: la copia local pasa a ese id, lo que
                // quedó pendiente apunta a él (sobre la versión fundida) y la fila completa vuelve a bajar
                if (x.fusionado_en && x.fusionado_en !== f.fila_id) {
                  const tabla = f.tabla.split(".").map((p) => `"${p.replace(/"/g, '""')}"`).join(".");
                  await c.query("set local session_replication_role = replica"); // sin disparadores: no vuelve a la bandeja
                  await c.query(`delete from ${tabla} where id = $1`, [x.fusionado_en]);
                  await c.query(`update ${tabla} set id = $2 where id = $1`, [f.fila_id, x.fusionado_en]);
                  await c.query("set local session_replication_role = origin");
                  await c.query(`update local.bandeja set fila_id = $3, version_base = case when estado = 'pendiente' then $4::bigint else version_base end,
                                   datos = case when datos ? 'id' then jsonb_set(datos, '{id}', to_jsonb($5::text)) else datos end
                                 where tabla = $1 and fila_id = $2`, [f.tabla, f.fila_id, x.fusionado_en, x.version, x.fusionado_en]);
                  await c.query("delete from local.version_nube where tabla = $1 and fila_id = $2", [f.tabla, f.fila_id]);
                  reponer.push({ ...f, fila_id: x.fusionado_en });
                }
              } else {
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
          // Lo que se fundió mientras viajaba sube en esta misma pasada (sin esperar a otro guardado o al ciclo)
          if (todos.length < LOTE && lote.length === todos.length && !quedaron) break;
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
  async lista() {
    const c = new pg.Client({ connectionString: this.motor.url() });
    try {
      await c.connect();
      const { rows } = await c.query(
        "select id, tabla, fila_id, op, estado, motivo, autor, creado, intentos, datos from local.bandeja where estado <> 'pendiente' order by creado desc limit 500");
      const { rows: [p] } = await c.query("select count(*)::int as n from local.bandeja where estado = 'pendiente'");
      return { pendientes: p.n, revisar: rows.map((f) => ({ ...f, autorNombre: this.estado.d.usuarios[f.autor]?.user?.email || null })) };
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
      if (f.autor !== quien.uid && !["administrador", "gerente_medico"].includes(quien.rol)) return { error: "Solo el autor, un administrador o el gerente médico lo resuelven" };
      if (accion === "descartar") { await c.query("delete from local.bandeja where id = $1", [id]); return { hecho: "descartado" }; }
      if (accion === "reintentar") {
        // Sobre la versión que la nube tiene ahora (la que la copia repuso tras el conflicto), nunca la de la copia,
        // que el disparador local sube en cada guardado
        const { rows: [n] } = await c.query("select version from local.version_nube where tabla = $1 and fila_id = $2", [f.tabla, f.fila_id]);
        const { rows: [v] } = n ? { rows: [n] } : await c.query(`select version from ${/^(public|clinico)\.[a-z_0-9]+$/.test(f.tabla) ? f.tabla : "local.bandeja"} where id = $1`, [f.fila_id]).catch(() => ({ rows: [] }));
        await c.query("update local.bandeja set estado = 'pendiente', motivo = null, intentos = 0, version_base = coalesce($2, version_base) where id = $1", [id, v?.version ?? null]);
        return { hecho: "pendiente" };
      }
      return { error: "Acción desconocida" };
    } finally { await c.end().catch(() => {}); }
  }
}

