// Copia local: primera descarga completa (instantánea) y luego solo los cambios (cambios_desde).
// Se aplica como superusuario local con session_replication_role = replica: no corren disparadores
// (ni avisos ni bitácora duplicados) y el orden de llegada no importa para las llaves foráneas.
import crypto from "node:crypto";
import pg from "./pg-local.mjs";
import { CATALOGOS } from "./config.mjs";

const ROLES_ACCESO_AMPLIO = ["administrador", "gerente_medico", "medico", "enfermeria", "recepcion", "coordinador_sst", "auditor"];

// Cambios por pedido a la nube. Si la nube corta el pedido por tiempo (8 s del rol authenticated, código 57014) o la PC
// deja de esperar (60 s), el lote se achica a la mitad y se repite en el acto: repetir el MISMO pedido dejaba la bajada
// trancada para siempre (30-oct-2026, PC apagada unas horas con miles de cambios en la nube).
const LOTE_MAX = 1000;
const LOTE_MIN = 50;
const esDemora = (e) => e?.code === "57014" || e?.name === "TimeoutError" || /statement timeout/i.test(e?.message || "");
// Error de la base local (SQLSTATE de 5 letras): un dato que la copia no acepta. Otro error (conexión cortada) no es
// culpa de una fila y no se aparta nada; tampoco los pasajeros de clase 40 (bloqueo mutuo con la bandeja) ni 57 (la
// base cortó la conexión en un respaldo o restauración): esos se reintentan en el ciclo siguiente (Arquitecto).
const esDeLaBase = (e) => /^[0-9A-Z]{5}$/.test(e?.code || "") && !/^(40|57)/.test(e.code);
const APARTADAS_POR_CICLO = 50;

// Lo que ve la persona en el botón «Sincronizar ahora»: qué falló, en palabras simples (sin el texto técnico, que
// puede traer datos del paciente)
export function motivoDe(e) {
  if (esDemora(e)) return "La nube tardó demasiado en enviar los cambios. Se vuelve a pedir sola, en partes más pequeñas.";
  if (e?.status === 401 || e?.status === 403 || /Sin sesión en la nube/.test(e?.message || "")) return "La sesión en la nube venció: sal y vuelve a entrar con internet.";
  if (/versión nueva|actualiza/i.test(e?.message || "")) return "Hay una versión nueva de zamorApp Escritorio: actualízala para seguir bajando los cambios.";
  if (esDeLaBase(e)) return "Esta PC no aceptó un dato que bajó de la nube. Se aparta y se reintenta sola; lo demás sigue bajando.";
  return "La nube no respondió bien. Se reintenta sola cada 30 segundos.";
}
const claseDe = (e) => (e?.status ? `HTTP ${e.status}` : e?.code ? String(e.code) : e?.name || "error");

export class Replica {
  constructor(estado, nube, motor, registro = () => {}) {
    Object.assign(this, { estado, nube, motor, registro });
    this.ocupada = false;
    this.ultima = null;
    this.ultimaMs = null; // cuándo terminó bien el último ciclo, con performance.now(): Cesar cambia la fecha de Windows
    this.inicioCiclo = 0; // cuándo empezó el último ciclo que terminó bien (performance.now()): una escritura anterior ya bajó
    this.error = null;
    this.motivo = null; // el error de arriba en palabras para la persona
    this.lote = LOTE_MAX;
    this.progreso = null; // durante la copia completa: { hechas, total, filas } para la primera pantalla
  }

  // Usuario cuya sesión baja los datos: el último interno con sesión válida en la nube.
  usuarioSincronia() {
    const lista = Object.entries(this.estado.d.usuarios)
      .filter(([, u]) => u.nube && !u.bloqueado && ROLES_ACCESO_AMPLIO.includes(u.rol))
      .sort(([, a], [, b]) => (b.ultimoOnline || 0) - (a.ultimoOnline || 0));
    return lista[0]?.[0] || null;
  }

  // Un solo ciclo a la vez: si ya hay uno en curso, se espera ese mismo.
  ciclo() {
    this.enCurso ??= this.#ciclo().finally(() => { this.enCurso = null; });
    return this.enCurso;
  }

  async #ciclo() {
    const eq = this.estado.d.equipo;
    if (!this.nube.enLinea) return;
    await this.vigilarUsuarios();
    if (!eq) return;
    const uid = this.usuarioSincronia();
    if (!uid) return;
    this.ocupada = true;
    const inicio = performance.now();
    const c = new pg.Client({ connectionString: this.motor.url() });
    // Una conexión cortada por fuera (restauración, base detenida) no tumba la puerta: se anota y el ciclo falla solo
    c.on("error", (e) => this.registro(`[réplica] conexión local perdida: ${e.message}`));
    try {
      await c.connect();
      await c.query("set session_replication_role = replica");
      await this.#vigilarPermisos(uid);
      if (this.estado.d.cursor === null) await this.#copiaCompleta(c, uid);
      await this.#cambios(c, uid);
      await this.#reintentarApartadas(uid);
      this.ultima = this.nube.reloj.iso();
      this.ultimaMs = performance.now();
      this.inicioCiclo = inicio;
      this.error = null;
      this.motivo = null;
    } catch (e) {
      this.error = e.message;
      this.motivo = motivoDe(e);
      // Solo la clase en puerta.log: el texto de la nube o de PG puede traer datos («Key (cedula)=(…)»)
      this.registro(`[réplica] falló (${claseDe(e)}): ${this.motivo}`);
    } finally {
      this.ocupada = false;
      await c.end().catch(() => {});
    }
  }

  // Si cambia el rol o las empresas permitidas del usuario, lo visible cambia: se repite la copia completa.
  async #vigilarPermisos(uid) {
    const filas = await this.nube.leer(uid, `miembros?usuario_id=eq.${uid}&select=org_id,rol,empresas_permitidas,acceso_clinico,activo`);
    const huella = crypto.createHash("sha256").update(JSON.stringify(filas)).digest("hex");
    const anterior = this.estado.d.firmasPermisos[uid];
    if (anterior && anterior !== huella) {
      this.registro("[réplica] cambiaron los permisos: se repite la copia completa");
      this.estado.d.cursor = null;
    }
    this.estado.d.firmasPermisos[uid] = huella;
    if (!filas.some((f) => f.activo)) this.nube.exigirNube(uid, true);
    this.estado.guardar();
  }

  // Cada ciclo con internet se confirma en la nube a TODOS los usuarios que han entrado en esta PC:
  // sesión vigente (si cambió la clave o la revocaron, la renovación falla) y miembro activo.
  async vigilarUsuarios() {
    for (const [uid, u] of Object.entries(this.estado.d.usuarios)) {
      if (u.bloqueado) continue;
      if (!u.nube) { if (!u.requiereNube) this.nube.exigirNube(uid); continue; }
      try {
        if (!(await this.nube.token(uid))) continue; // rechazada: token() ya exigió entrar con internet
        const filas = await this.nube.leer(uid, `miembros?usuario_id=eq.${uid}&activo=is.true&select=rol`);
        if (!filas.length) this.nube.exigirNube(uid, true);
        else if (u.rol !== filas[0].rol) { u.rol = filas[0].rol; this.estado.guardar(); }
      } catch (e) {
        this.registro(`[réplica] no se pudo confirmar un usuario: ${e.message}`);
      }
    }
  }

  async #copiaCompleta(c, uid) {
    const eq = this.estado.d.equipo;
    const tablas = [...await this.#tablasSync(c), ...CATALOGOS];
    let seq = null;
    // Avance para la pantalla «Copiando los datos» (C13): grupos de datos hechos y registros copiados
    this.progreso = { hechas: 0, total: tablas.length, filas: 0 };
    await c.query("begin");
    try {
      for (const tabla of tablas) {
        let despues = null;
        const conId = await this.#tieneId(c, tabla);
        await c.query(`delete from ${this.#seguro(tabla)}`);
        // La copia completa es la verdad de la nube: las versiones anotadas se rehacen con lo que baja (si la nube volvió
        // a una versión anterior, la fila no queda congelada). Las filas con un cambio por subir conservan su base.
        const { rowCount: viejas } = await c.query("delete from local.version_nube v where v.tabla = $1 and not exists (select 1 from local.bandeja b where b.tabla = v.tabla and b.fila_id = v.fila_id and b.estado = 'pendiente')", [tabla]);
        if (viejas) this.registro(`[réplica] copia completa de ${tabla}: ${viejas} versiones anotadas se toman de nuevo de la nube`);
        for (;;) {
          const r = await this.nube.rpc(uid, "instantanea", { p_equipo: eq.id, p_secreto: eq.secreto, p_tabla: tabla, p_despues: despues, p_limite: 2000 });
          if (seq === null) seq = r.seq;
          if (r.filas.length) await this.#insertar(c, tabla, r.filas);
          this.progreso.filas += r.filas.length;
          if (!conId || !r.ultimo || r.filas.length < 2000) break;
          despues = r.ultimo;
        }
        this.progreso.hechas += 1;
      }
      await c.query("commit");
    } catch (e) {
      await c.query("rollback");
      this.progreso = null;
      throw e;
    }
    // Queda con hechas = total: la pantalla llega al final antes de abrir la app
    this.estado.d.cursor = seq ?? 0;
    this.estado.d.copiaCompleta = this.nube.reloj.iso();
    this.estado.guardar();
    this.registro(`[réplica] copia completa lista (${tablas.length} tablas)`);
  }

  async #cambios(c, uid) {
    const eq = this.estado.d.equipo;
    for (;;) {
      let r;
      try {
        r = await this.nube.rpc(uid, "cambios_desde", { p_equipo: eq.id, p_secreto: eq.secreto, p_desde: this.estado.d.cursor, p_limite: this.lote });
      } catch (e) {
        if (!esDemora(e) || this.lote <= LOTE_MIN) throw e;
        this.lote = Math.max(LOTE_MIN, Math.floor(this.lote / 2));
        this.registro(`[réplica] la nube tardó demasiado: se piden ${this.lote} cambios por vez`);
        continue;
      }
      if (r.cambios.length) await this.#aplicar(c, r.cambios);
      if (r.hasta === this.estado.d.cursor) break;
      this.estado.d.cursor = r.hasta;
      this.estado.guardar();
      // Pasó bien: el lote vuelve a crecer de a poco (de golpe volvería a cortarse con la nube cargada)
      if (this.lote < LOTE_MAX) this.lote = Math.min(LOTE_MAX, Math.ceil(this.lote * 1.25));
    }
  }

  // Un lote en una sola transacción, por tramos de la misma tabla (una consulta por tramo, no una por fila). Si la copia
  // no acepta algo, se repite de a una fila: la que falla se aparta y se reintenta en los ciclos siguientes, y las
  // demás entran. Antes, una sola fila rechazada (p. ej. una columna calculada o un valor fuera del check) dejaba todo
  // el lote sin aplicar y el cursor sin avanzar.
  async #aplicar(c, cambios) {
    try {
      await c.query("begin");
      for (const tramo of tramos(cambios)) await this.#aplicarTramo(c, tramo);
      await c.query("commit");
      return;
    } catch (e) {
      await c.query("rollback").catch(() => {});
      if (!esDeLaBase(e)) throw e;
    }
    for (const k of cambios) {
      try {
        await c.query("begin");
        await this.#aplicarTramo(c, [k]);
        await c.query("commit");
      } catch (e) {
        await c.query("rollback").catch(() => {});
        if (!esDeLaBase(e)) throw e;
        this.#apartar(k.tabla, k.fila_id, e);
      }
    }
  }

  async #aplicarTramo(c, tramo) {
    const tabla = this.#seguro(tramo[0].tabla);
    if (tramo[0].op === "D") {
      const ids = tramo.map((k) => k.fila_id);
      await c.query(`delete from ${tabla} where id = any($1::uuid[])`, [ids]);
      await c.query("delete from local.version_nube where tabla = $1 and fila_id = any($2::uuid[])", [tabla, ids]);
      return;
    }
    // La misma fila puede venir varias veces en el lote: queda la última (un insert no puede tocarla dos veces)
    const filas = new Map();
    for (const k of tramo) filas.set(k.fila_id, k.fila);
    await this.#insertar(c, tabla, [...filas.values()]);
  }

  #apartar(tabla, id, e) {
    const clave = `${tabla}|${id}`;
    const a = this.estado.d.apartadas;
    a[clave] = { tabla, id, clase: claseDe(e), veces: (a[clave]?.veces || 0) + 1 };
    this.estado.guardar();
    this.registro(`[réplica] ${tabla} ${id}: la copia no la aceptó (${claseDe(e)}); queda apartada y se reintenta en cada ciclo`);
  }

  // Las apartadas se vuelven a bajar tal como están en la nube: entran cuando se corrige la causa (una versión nueva
  // del programa o un dato corregido en la nube). Si ya no existe en la nube, se quita de la copia.
  async #reintentarApartadas(uid) {
    const a = this.estado.d.apartadas;
    for (const [clave, f] of Object.entries(a).slice(0, APARTADAS_POR_CICLO)) {
      try {
        await this.reponerFila(uid, f.tabla, f.id);
        delete a[clave];
        this.registro(`[réplica] ${f.tabla} ${f.id}: ya entró en la copia`);
      } catch (e) {
        if (!esDeLaBase(e)) break; // sin conexión o la nube no responde: se sigue en el próximo ciclo
        f.veces += 1;
      }
    }
    this.estado.guardar();
  }

  apartadas() {
    return Object.keys(this.estado.d.apartadas || {}).length;
  }

  async #tablasSync(c) {
    return (await c.query("select nombre from sync.tablas order by nombre")).rows.map((r) => r.nombre);
  }

  // Vuelve a bajar UNA fila tal como está en la nube (tras un conflicto o rechazo de la bandeja), con los
  // disparadores apagados para que no vuelva a la bandeja. Si en la nube no existe (o no hay acceso), se quita
  // de la copia: lo que escribió el equipo queda guardado en la bandeja, en «Conflictos/Rechazados».
  async reponerFila(uid, tabla, id) {
    tabla = this.#seguro(tabla);
    const [esquema, nombre] = tabla.split(".");
    const c = new pg.Client({ connectionString: this.motor.url() });
    c.on("error", (e) => this.registro(`[réplica] conexión local perdida: ${e.message}`));
    try {
      await c.connect();
      // Se piden las columnas que la copia tiene y el rol puede leer (sin «*»: una columna de salud oculta a un rol
      // haría fallar el pedido entero y la fila no se repondría)
      const { rows: cols } = await c.query(
        `select column_name from information_schema.columns where table_schema = $1 and table_name = $2 and is_generated = 'NEVER'
            and has_column_privilege('authenticated', ($1 || '.' || $2)::regclass, column_name::text, 'SELECT') order by ordinal_position`, [esquema, nombre]);
      const select = cols.map((x) => x.column_name).join(",") || "*";
      const filas = await this.nube.leer(uid, `${nombre}?id=eq.${encodeURIComponent(id)}&select=${select}`, { "Accept-Profile": esquema });
      await c.query("set session_replication_role = replica");
      // Si la nube tiene una versión MENOR que la anotada (p. ej. se restauró un respaldo de la nube), manda la nube:
      // si no, la réplica dejaría esa fila congelada en la PC (Analizar)
      if (Array.isArray(filas) && filas.length && filas[0].version != null) {
        const { rowCount } = await c.query("update local.version_nube set version = $3 where tabla = $1 and fila_id = $2 and version > $3", [tabla, id, filas[0].version]);
        if (rowCount) this.registro(`[réplica] ${tabla} ${id}: la nube volvió a una versión anterior (${filas[0].version}); se toma la de la nube`);
      }
      if (Array.isArray(filas) && filas.length) await this.#insertar(c, tabla, filas);
      else {
        await c.query(`delete from ${tabla} where id = $1`, [id]);
        await c.query("delete from local.version_nube where tabla = $1 and fila_id = $2", [tabla, id]);
      }
      return Array.isArray(filas) ? filas.length : 0;
    } finally { await c.end().catch(() => {}); }
  }

  async #tieneId(c, tabla) {
    const [esquema, nombre] = this.#seguro(tabla).split(".");
    const { rowCount } = await c.query("select 1 from information_schema.columns where table_schema=$1 and table_name=$2 and column_name='id'", [esquema, nombre]);
    return rowCount > 0;
  }

  // Inserta o reemplaza filas completas (solo columnas que existen localmente; las calculadas las calcula la base).
  async #insertar(c, tabla, filas) {
    tabla = this.#seguro(tabla);
    const conId = await this.#tieneId(c, tabla);
    const cols = (await c.query(
      "select column_name from information_schema.columns where table_schema || '.' || table_name = $1 and is_generated = 'NEVER' order by ordinal_position", [tabla],
    )).rows.map((r) => r.column_name).filter((col) => col in filas[0]);
    const lista = cols.map((x) => `"${x}"`).join(", ");
    const actualizar = cols.filter((x) => x !== "id").map((x) => `"${x}" = excluded."${x}"`).join(", ");
    if (!conId) {
      await c.query(`insert into ${tabla} (${lista}) select ${lista} from jsonb_populate_recordset(null::${tabla}, $1)`, [JSON.stringify(filas)]);
      return;
    }
    // Una fila con un cambio de esta PC por subir no se pisa: la copia muestra lo último que se guardó aquí y la
    // nube decide al subir (si otro la cambió, es conflicto y se repone). Las demás quedan como en la nube, y su
    // versión pasa a ser la base de los próximos cambios (local.version_nube).
    const pendiente = "exists (select 1 from local.bandeja b where b.tabla = $2 and b.fila_id = r.id and b.estado = 'pendiente')";
    // Tampoco se pisa con una lectura vieja: si esta PC ya subió una versión más nueva (la leyó antes de que subiera
    // lo último y llega después de borrarse de la bandeja), la copia se queda con lo último que se guardó aquí
    const vieja = "version" in filas[0]
      ? " and not exists (select 1 from local.version_nube v where v.tabla = $2 and v.fila_id = r.id and v.version > r.version)" : "";
    // La misma revisión se repite al actualizar, DESPUÉS de esperar el bloqueo de la fila (ver local.replica_puede): la
    // de arriba usa la foto del inicio y no ve un guardado de la PC que la tomó mientras tanto
    const aun = ` where local.replica_puede($2, excluded.id, ${"version" in filas[0] ? "excluded.version" : "null"})`;
    await c.query(
      `insert into ${tabla} (${lista}) select ${lista} from jsonb_populate_recordset(null::${tabla}, $1) r where not ${pendiente}${vieja}
       on conflict (id) do update set ${actualizar}${aun}`,
      [JSON.stringify(filas), tabla],
    );
    if ("version" in filas[0]) {
      await c.query(
        `insert into local.version_nube (tabla, fila_id, version)
         select $2, r.id, r.version from jsonb_to_recordset($1) as r(id uuid, version bigint) where r.version is not null and not ${pendiente}
         on conflict (tabla, fila_id) do update set version = greatest(local.version_nube.version, excluded.version)`,
        [JSON.stringify(filas.map((f) => ({ id: f.id, version: f.version }))), tabla],
      );
    }
  }

  #seguro(tabla) {
    if (!/^(public|clinico)\.[a-z_0-9]+$/.test(tabla)) throw new Error(`Tabla inválida: ${tabla}`);
    return tabla;
  }
}

// Tramos consecutivos de la misma tabla y la misma clase (borrado o alta/cambio): respetan el orden del registro
function tramos(cambios) {
  const salida = [];
  for (const k of cambios) {
    const ultimo = salida.at(-1);
    if (ultimo && ultimo[0].tabla === k.tabla && (ultimo[0].op === "D") === (k.op === "D")) ultimo.push(k);
    else salida.push([k]);
  }
  return salida;
}
