// Bandeja de salida (fase A, local primero): lo que la app guardó en la base local sube a la nube con
// aplicar_cambios(), con la sesión del usuario que lo guardó (la nube vuelve a aplicar sus reglas de acceso).
// Lo aplicado se borra de la bandeja; un conflicto o rechazo queda anotado y nunca se pierde (la nube lo guarda
// en sync.conflictos y la PC conserva el cambio con su motivo).
import pg from "./pg-local.mjs";

const LOTE = 200;
const REINTENTOS = 5;
const TABLA = /^(public|clinico)\.[a-z_0-9]+$/; // nombre de tabla seguro para armar la consulta
const RESUELVEN = ["administrador", "gerente_medico"]; // además del autor

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

  // Una constancia validada en la copia sin internet (servidor.mjs): queda para subir con la hora de la PC
  async anotarConstancia(autor, rpc, args) {
    const c = new pg.Client({ connectionString: this.motor.url() });
    try {
      await c.connect();
      await c.query("insert into local.constancias (rpc, args, autor, hora, hora_verificada) values ($1, $2, $3, $4, $5)",
        [rpc, JSON.stringify(args), autor, this.nube.reloj.iso(), this.nube.reloj.verificada]);
    } finally { await c.end().catch(() => {}); }
  }

  // La campana de resultados sin internet: una sola constancia pendiente por usuario (abrir Inicio diez veces no sube
  // diez); junta los avisos que la copia creó, para borrarlos cuando la nube haga los suyos
  async anotarCampana(autor, locales) {
    const c = new pg.Client({ connectionString: this.motor.url() });
    try {
      await c.connect();
      const { rowCount } = await c.query(`update local.constancias set args = jsonb_build_object('locales', coalesce(args -> 'locales', '[]') || to_jsonb($2::uuid[]))
        where rpc = 'recordar_resultados' and autor = $1 and estado = 'pendiente'`, [autor, locales]);
      if (!rowCount) await c.query("insert into local.constancias (rpc, args, autor, hora, hora_verificada) values ('recordar_resultados', $1, $2, $3, $4)",
        [JSON.stringify({ locales }), autor, this.nube.reloj.iso(), this.nube.reloj.verificada]);
    } finally { await c.end().catch(() => {}); }
  }

  // Después de las filas (la consulta y el adjunto ya están en la nube): cada constancia con la sesión de su autor.
  // Un rechazo de la nube queda anotado (nunca se reintenta para siempre); sin sesión o sin red, espera.
  async #subirConstancias(c) {
    const eq = this.estado.d.equipo;
    const { rows } = await c.query("select id, rpc, args, autor, hora, hora_verificada from local.constancias where estado = 'pendiente' order by creado limit 200");
    for (const k of rows) {
      if (!(await this.nube.token(k.autor).catch(() => null))) continue;
      try {
        await this.nube.rpc(k.autor, "constancia_diferida", { p_equipo: eq.id, p_secreto: eq.secreto, p_id: k.id, p_rpc: k.rpc, p_args: k.args, p_hora: new Date(k.hora).toISOString(), p_hora_verificada: k.hora_verificada });
        // returning: los args al borrar (si llegó otro aviso mientras subía, también se borra con esta pasada)
        const { rows: [hecha] } = await c.query("delete from local.constancias where id = $1 returning args", [k.id]);
        // La nube ya hizo sus avisos (bajan con la sincronía): fuera los que la PC había creado sin internet
        const locales = k.rpc === "recordar_resultados" ? hecha?.args?.locales : null;
        if (Array.isArray(locales) && locales.length) {
          await c.query("delete from public.notificaciones where usuario_id = $1 and id = any($2::uuid[])", [k.autor, locales]);
        }
      } catch (e) {
        if (!e.status || e.status >= 500) throw e; // sin red o la nube caída: otra pasada
        await c.query("update local.constancias set intentos = intentos + 1, estado = case when intentos + 1 >= $2 then 'rechazado' else estado end, motivo = $3 where id = $1", [k.id, REINTENTOS, e.message]);
        this.registro(`[bandeja] constancia ${k.rpc} no aceptada por la nube: ${e.message}`);
      }
    }
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

  // Filas que aún esperan en la bandeja (de esas `filas`): sirve para saber si una ya llegó a la nube
  async esperando(filas) {
    if (!filas.length) return [];
    const c = new pg.Client({ connectionString: this.motor.url() });
    try {
      await c.connect();
      const { rows } = await c.query("select distinct fila_id::text as id from local.bandeja where fila_id::text = any($1)", [filas]);
      return rows.map((r) => r.id);
    } finally { await c.end().catch(() => {}); }
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
      await this.#subirConstancias(c);
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

  // Lista «Conflictos/Rechazados» (y lo pendiente) para la pantalla: qué, de quién, cuándo y por qué.
  // Solo los casos que quien pregunta puede resolver: los suyos, y los de otros si es administrador o gerente médico
  // Y su propia RLS le deja ver esa fila (un administrador sin acceso clínico no ve casos de clinico.*). La versión de
  // la nube (la fila en conflicto ya volvió a bajar a la copia) se lee también con su RLS y solo con los campos del
  // cambio. Sin `quien` es solo para uso interno de la puerta (nunca para responder a una ventana).
  async lista(quien = null) {
    const c = new pg.Client({ connectionString: this.motor.url() });
    try {
      await c.connect();
      const { rows } = await c.query(
        "select id, tabla, fila_id, op, estado, motivo, autor, creado, intentos, datos from local.bandeja where estado <> 'pendiente' order by creado desc limit 500");
      const { rows: [p] } = await c.query("select count(*)::int as n from local.bandeja where estado = 'pendiente'");
      const candidatos = rows.filter((f) => !quien || f.autor === quien.uid || RESUELVEN.includes(quien.rol));
      const revisar = [];
      await this.#comoUsuario(c, quien, async () => {
        for (const f of candidatos) {
          const fila = await this.#fila(c, f, Boolean(quien));
          if (quien && f.autor !== quien.uid && !fila) continue;
          const nube = fila ? Object.fromEntries(Object.keys(f.datos || {}).map((k) => [k, fila[k] ?? null])) : null;
          revisar.push({ ...f, nube, autorNombre: this.estado.d.usuarios[f.autor]?.user?.email || null });
        }
      });
      return { pendientes: p.n, revisar };
    } finally { await c.end().catch(() => {}); }
  }

  // Corre `fn` con la identidad y la RLS de quien pregunta (como lo haría PostgREST) y deshace todo al final
  async #comoUsuario(c, quien, fn) {
    if (!quien) return fn();
    await c.query("begin");
    try {
      await c.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: quien.uid, role: "authenticated", aal: quien.aal })]);
      await c.query("set local role authenticated");
      return await fn();
    } finally { await c.query("rollback").catch(() => {}); }
  }

  // La fila tal como está en la copia; dentro de #comoUsuario, con su RLS (un error de permiso cuenta como «no la ve»)
  async #fila(c, f, enTx = false) {
    if (!TABLA.test(f.tabla)) return null;
    if (enTx) await c.query("savepoint fila");
    try {
      const { rows: [n] } = await c.query(`select to_jsonb(t) as fila from ${f.tabla} t where id = $1`, [f.fila_id]);
      if (enTx) await c.query("release savepoint fila");
      return n?.fila ?? null;
    } catch {
      if (enTx) await c.query("rollback to savepoint fila").catch(() => {});
      return null;
    }
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
      // De otro autor, solo si su propia RLS le deja ver esa fila (lo mismo que en la lista)
      if (f.autor !== quien.uid && !(await this.#comoUsuario(c, quien, () => this.#fila(c, f, true)))) return { error: "No tienes acceso a ese registro" };
      if (accion === "descartar") { await c.query("delete from local.bandeja where id = $1", [id]); return { hecho: "descartado" }; }
      if (accion === "reintentar") {
        // Sobre la versión que la nube tiene ahora (la que la copia repuso tras el conflicto), nunca la de la copia,
        // que el disparador local sube en cada guardado
        const { rows: [n] } = await c.query("select version from local.version_nube where tabla = $1 and fila_id = $2", [f.tabla, f.fila_id]);
        const { rows: [v] } = n ? { rows: [n] } : await c.query(`select version from ${TABLA.test(f.tabla) ? f.tabla : "local.bandeja"} where id = $1`, [f.fila_id]).catch(() => ({ rows: [] }));
        await c.query("update local.bandeja set estado = 'pendiente', motivo = null, intentos = 0, version_base = coalesce($2, version_base) where id = $1", [id, v?.version ?? null]);
        return { hecho: "pendiente" };
      }
      return { error: "Acción desconocida" };
    } finally { await c.end().catch(() => {}); }
  }
}

