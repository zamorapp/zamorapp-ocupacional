// Copia local: primera descarga completa (instantánea) y luego solo los cambios (cambios_desde).
// Se aplica como superusuario local con session_replication_role = replica: no corren disparadores
// (ni avisos ni bitácora duplicados) y el orden de llegada no importa para las llaves foráneas.
import crypto from "node:crypto";
import pg from "pg";
import { CATALOGOS } from "./config.mjs";

const ROLES_ACCESO_AMPLIO = ["administrador", "gerente_medico", "medico", "enfermeria", "recepcion", "coordinador_sst", "auditor"];

export class Replica {
  constructor(estado, nube, motor, registro = () => {}) {
    Object.assign(this, { estado, nube, motor, registro });
    this.ocupada = false;
    this.ultima = null;
    this.error = null;
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
    const c = new pg.Client({ connectionString: this.motor.url() });
    try {
      await c.connect();
      await c.query("set session_replication_role = replica");
      await this.#vigilarPermisos(uid);
      if (this.estado.d.cursor === null) await this.#copiaCompleta(c, uid);
      await this.#cambios(c, uid);
      this.ultima = new Date().toISOString();
      this.error = null;
    } catch (e) {
      this.error = e.message;
      this.registro(`[réplica] ${e.message}`);
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
    await c.query("begin");
    try {
      for (const tabla of tablas) {
        let despues = null;
        const conId = await this.#tieneId(c, tabla);
        await c.query(`delete from ${this.#seguro(tabla)}`);
        for (;;) {
          const r = await this.nube.rpc(uid, "instantanea", { p_equipo: eq.id, p_secreto: eq.secreto, p_tabla: tabla, p_despues: despues, p_limite: 2000 });
          if (seq === null) seq = r.seq;
          if (r.filas.length) await this.#insertar(c, tabla, r.filas);
          if (!conId || !r.ultimo || r.filas.length < 2000) break;
          despues = r.ultimo;
        }
      }
      await c.query("commit");
    } catch (e) {
      await c.query("rollback");
      throw e;
    }
    this.estado.d.cursor = seq ?? 0;
    this.estado.d.copiaCompleta = new Date().toISOString();
    this.estado.guardar();
    this.registro(`[réplica] copia completa lista (${tablas.length} tablas)`);
  }

  async #cambios(c, uid) {
    const eq = this.estado.d.equipo;
    for (;;) {
      const r = await this.nube.rpc(uid, "cambios_desde", { p_equipo: eq.id, p_secreto: eq.secreto, p_desde: this.estado.d.cursor, p_limite: 1000 });
      if (r.cambios.length) {
        await c.query("begin");
        try {
          for (const k of r.cambios) {
            if (k.op === "D") await c.query(`delete from ${this.#seguro(k.tabla)} where id = $1`, [k.fila_id]);
            else await this.#insertar(c, k.tabla, [k.fila]);
          }
          await c.query("commit");
        } catch (e) {
          await c.query("rollback");
          throw e;
        }
      }
      if (r.hasta === this.estado.d.cursor) break;
      this.estado.d.cursor = r.hasta;
      this.estado.guardar();
    }
  }

  async #tablasSync(c) {
    return (await c.query("select nombre from sync.tablas order by nombre")).rows.map((r) => r.nombre);
  }

  async #tieneId(c, tabla) {
    const [esquema, nombre] = this.#seguro(tabla).split(".");
    const { rowCount } = await c.query("select 1 from information_schema.columns where table_schema=$1 and table_name=$2 and column_name='id'", [esquema, nombre]);
    return rowCount > 0;
  }

  // Inserta o reemplaza filas completas (solo columnas que existen localmente).
  async #insertar(c, tabla, filas) {
    tabla = this.#seguro(tabla);
    const conId = await this.#tieneId(c, tabla);
    const cols = (await c.query(
      "select column_name from information_schema.columns where table_schema || '.' || table_name = $1 order by ordinal_position", [tabla],
    )).rows.map((r) => r.column_name).filter((col) => col in filas[0]);
    const lista = cols.map((x) => `"${x}"`).join(", ");
    const actualizar = cols.filter((x) => x !== "id").map((x) => `"${x}" = excluded."${x}"`).join(", ");
    await c.query(
      `insert into ${tabla} (${lista}) select ${lista} from jsonb_populate_recordset(null::${tabla}, $1)` +
      (conId ? ` on conflict (id) do update set ${actualizar}` : ""),
      [JSON.stringify(filas)],
    );
  }

  #seguro(tabla) {
    if (!/^(public|clinico)\.[a-z_0-9]+$/.test(tabla)) throw new Error(`Tabla inválida: ${tabla}`);
    return tabla;
  }
}
