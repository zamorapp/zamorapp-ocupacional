// Motor local: PostgreSQL portátil y PostgREST, solo en 127.0.0.1 y en puertos propios.
// No instala servicios de Windows ni toca SQL Server: son procesos hijos de zamorApp.
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import pg from "pg";
import { CONFIG } from "./config.mjs";
import { desempaquetar } from "./tar.mjs";

const MARCA_ESCRITURA_LOCAL = "marca_escritura_local_1";
const exe = (nombre) => path.join(CONFIG.pgBin, process.platform === "win32" ? `${nombre}.exe` : nombre);

// Si el puerto está ocupado, toma el siguiente libre (hasta 20 intentos).
export async function puertoLibre(desde) {
  for (let p = desde; p < desde + 20; p++) {
    const libre = await new Promise((ok) => {
      const s = net.createServer().once("error", () => ok(false)).once("listening", () => s.close(() => ok(true)));
      s.listen(p, "127.0.0.1");
    });
    if (libre) return p;
  }
  throw new Error(`No hay puertos libres desde ${desde}`);
}

export class Motor {
  constructor(estado) {
    this.estado = estado;
    this.carpetaBase = path.join(CONFIG.datos, "base");
    this.hijos = [];
  }

  url(usuario = "postgres", clave = this.estado.d.claveBase) {
    return `postgresql://${usuario}:${encodeURIComponent(clave)}@127.0.0.1:${this.puertoBase}/zamorapp`;
  }

  async iniciar() {
    this.puertoBase = await puertoLibre(CONFIG.puertoBase);
    await this.#iniciarPostgres();
    await this.#migrar();
    // Fase C: una restauración pedida desde la app (respaldo.mjs) se aplica aquí, con PostgREST aún apagado
    if (this.estado.d.restaurar) await this.restaurarSiPedida();
    await this.limpiarBloquesAjenos();
    // Se elige con la base ya escuchando: si 54329 estaba ocupado y la base tomó 54330, PostgREST no lo pisa
    this.puertoPostgrest = await puertoLibre(CONFIG.puertoPostgrest);
    await this.#iniciarPostgrest();
  }

  async #iniciarPostgres() {
    if (!fs.existsSync(path.join(this.carpetaBase, "PG_VERSION"))) {
      const archivoClave = path.join(CONFIG.datos, ".clave-inicial");
      fs.writeFileSync(archivoClave, this.estado.d.claveBase, { mode: 0o600 });
      const r = spawnSync(exe("initdb"), ["-D", this.carpetaBase, "-U", "postgres", "-E", "UTF8", "--locale=C",
        "-A", "scram-sha-256", `--pwfile=${archivoClave}`], { encoding: "utf8", windowsHide: true, timeout: 180_000 });
      fs.rmSync(archivoClave, { force: true });
      if (r.status !== 0) throw new Error(`initdb falló: ${r.stderr || r.error}`);
    }
    // Si quedó viva una base de una sesión anterior (el programa se cerró a la fuerza, se apagó la PC o se instaló
    // una versión nueva encima), se detiene con calma antes de arrancar: dos servidores no pueden usar los mismos datos.
    const previa = spawnSync(exe("pg_ctl"), ["status", "-D", this.carpetaBase], { stdio: "ignore", windowsHide: true, timeout: 30_000 });
    if (previa.status === 0) {
      this.registro?.("[base] había una base local abierta de una sesión anterior; se detiene antes de arrancar");
      spawnSync(exe("pg_ctl"), ["stop", "-D", this.carpetaBase, "-m", "fast", "-w", "-t", "60"], { stdio: "ignore", windowsHide: true, timeout: 90_000 });
    }
    // pg_ctl (y no postgres.exe directo): en Windows arranca con permisos reducidos aunque el usuario sea administrador.
    // Sin tuberías: en Windows el servidor hereda las de pg_ctl y la espera no terminaría nunca.
    // Junto a su carpeta de datos (en la PC real es CONFIG.datos/base.log). Dos bases no comparten registro: en Windows
    // la segunda base no arrancó con el registro de la primera abierto (la «PC nueva» de las pruebas).
    const log = path.join(path.dirname(this.carpetaBase), "base.log");
    const r = spawnSync(exe("pg_ctl"), ["start", "-D", this.carpetaBase, "-w", "-t", "60", "-l", log,
      // En Linux (pruebas) el socket local va en la carpeta de datos: el /var/run/postgresql del sistema no es nuestro
      "-o", `-p ${this.puertoBase} -c listen_addresses=127.0.0.1 -c max_connections=40 -c shared_buffers=64MB${process.platform === "win32" ? "" : ` -c unix_socket_directories=${JSON.stringify(this.carpetaBase)}`}`],
      { stdio: "ignore", windowsHide: true, timeout: 90_000 });
    if (r.status !== 0) {
      const cola = fs.existsSync(log) ? fs.readFileSync(log, "utf8").slice(-800) : String(r.error || "");
      throw new Error(`No arrancó la base local: ${cola}`);
    }
    this.baseIniciada = true;
    await this.#esperar(async () => {
      const c = new pg.Client({ connectionString: this.url().replace("/zamorapp", "/postgres") });
      await c.connect();
      const { rowCount } = await c.query("select 1 from pg_database where datname = 'zamorapp'");
      if (!rowCount) await c.query("create database zamorapp");
      await c.end();
    }, "la base local");
  }

  // Mismas migraciones que la nube, en orden, una sola vez cada una; más los ajustes propios de la PC.
  async #migrar() {
    const TABLA = "create schema if not exists local; create table if not exists local.migraciones (nombre text primary key, en timestamptz default now())";
    const hechasEn = async () => {
      const c0 = new pg.Client({ connectionString: this.url() });
      await c0.connect();
      try { await c0.query(TABLA); return new Set((await c0.query("select nombre from local.migraciones")).rows.map((r) => r.nombre)); } finally { await c0.end(); }
    };
    let hechas = await hechasEn();
    // Una base de antes de la fase A quedó sin permisos de escritura (la copia era de solo lectura) y no hay forma
    // de reponerlos uno a uno: se rehace desde cero y la copia completa vuelve a bajar. Solo pasa una vez.
    if (hechas.size && !hechas.has(MARCA_ESCRITURA_LOCAL)) {
      this.registro?.("[base] la copia local es de una versión anterior: se rehace para poder guardar en la PC");
      await this.#rehacerBase();
      hechas = await hechasEn();
    }
    const c = new pg.Client({ connectionString: this.url() });
    await c.connect();
    try {
      await c.query("insert into local.migraciones (nombre) values ($1) on conflict do nothing", [MARCA_ESCRITURA_LOCAL]);
      const pasos = [
        ["000_stubs_supabase.sql", CONFIG.stubs],
        ...fs.readdirSync(CONFIG.migraciones).filter((f) => f.endsWith(".sql")).sort().map((f) => [f, path.join(CONFIG.migraciones, f)]),
        ...fs.readdirSync(CONFIG.baseExtra).filter((f) => f.endsWith(".sql")).sort().map((f) => [`zz_local_${f}`, path.join(CONFIG.baseExtra, f)]),
      ];
      for (const [nombre, archivo] of pasos) {
        const local = nombre.startsWith("zz_local_");
        if (hechas.has(nombre) && !local) continue; // los ajustes locales se reaplican siempre (son idempotentes)
        await c.query("begin");
        try {
          await c.query(fs.readFileSync(archivo, "utf8"));
          await c.query("insert into local.migraciones (nombre) values ($1) on conflict do nothing", [nombre]);
          await c.query("commit");
        } catch (e) {
          await c.query("rollback");
          throw new Error(`Migración local ${nombre}: ${e.message}`);
        }
      }
      await c.query(`alter role authenticator with login password '${this.estado.d.claveAutenticador.replace(/'/g, "")}'`);
    } finally {
      await c.end();
    }
  }

  // Una restauración que falla (archivo dañado, clave equivocada, disco lleno) NO deja al programa sin abrir
  // (Analizar): se sigue con la base actual, se borra la base a medias y el error queda a la vista en la pantalla
  // de respaldos (estado.respaldo.restauracionFallida).
  async restaurarSiPedida() {
    const origen = this.estado.d.restaurar?.origen || this.estado.d.restaurar?.archivo;
    try {
      return await this.aplicarRestauracion();
    } catch (e) {
      this.registro?.(`[base] la restauración falló y se sigue con la base actual: ${e.message}`);
      const c = new pg.Client({ connectionString: this.url().replace("/zamorapp", "/postgres") });
      try { await c.connect(); await c.query("drop database if exists zamorapp_restaurada with (force)"); }
      catch (e2) { this.registro?.(`[base] no se pudo borrar zamorapp_restaurada: ${e2.message}`); }
      finally { await c.end().catch(() => {}); }
      (this.estado.d.respaldo ??= {}).restauracionFallida = { origen, mensaje: e.message, fecha: null };
      this.estado.d.restaurar = null;
      this.estado.guardar();
      return false;
    }
  }

  // Los bloques de números de historia son de UN equipo (condición 7 de Analizar): los que trae un respaldo
  // restaurado en otra PC, o los de un registro de equipo anterior, se borran; con internet se pide uno nuevo.
  async limpiarBloquesAjenos() {
    const c = new pg.Client({ connectionString: this.url() });
    try {
      await c.connect();
      const { rowCount } = await c.query("delete from local.bloques where equipo_id is distinct from $1::uuid", [this.estado.d.equipo?.id || null]);
      if (rowCount) this.registro?.(`[base] ${rowCount} bloque(s) de números de historia de otro equipo borrados`);
    } catch (e) { this.registro?.(`[base] no se pudieron revisar los bloques: ${e.message}`); }
    finally { await c.end().catch(() => {}); }
  }

  // Borra y crea de nuevo la base local (sin PostgREST ni réplica en marcha). El estado olvida el cursor y la copia.
  // OJO: la copia local baja de la nube; una fila borrada FÍSICAMENTE en la nube (no soft delete) después del respaldo
  // revive al restaurar hasta que la nube la vuelva a bajar... y como ya no existe allá, se queda. Por eso los datos
  // clínicos solo se borran con soft delete (condición de Analizar) y la restauración es un paso excepcional.
  // Carga el volcado en una base aparte y la cambia por la actual (la vieja queda como zamorapp_anterior por si
  // hace falta volver). Después, #migrar aplica lo que le falte al respaldo y el cursor en cero vuelve a bajar la nube.
  async aplicarRestauracion() {
    const pedido = this.estado.d.restaurar;
    this.estado.d.restaurar = null;
    this.estado.guardar();
    if (!pedido?.archivo || !fs.existsSync(pedido.archivo)) { this.registro?.("[base] restauración pedida sin archivo: se omite"); return false; }
    try { return await this.#restaurar(pedido); } finally { fs.rmSync(pedido.archivo, { force: true }); if (pedido.adjuntos) fs.rmSync(pedido.adjuntos, { force: true }); }
  }

  async #restaurar(pedido) {
    const admin = () => new pg.Client({ connectionString: this.url().replace("/zamorapp", "/postgres") });
    let c = admin();
    await c.connect();
    try {
      await c.query("drop database if exists zamorapp_restaurada with (force)");
      await c.query("create database zamorapp_restaurada");
    } finally { await c.end(); }
    // Estructura y datos con --exit-on-error. Las llaves foráneas (post-data) pueden fallar: la copia baja de la nube
    // en modo réplica, sin comprobar llaves, y puede tener hijos sin padre; esas se vuelven a crear NOT VALID abajo.
    const urlRest = this.url().replace("/zamorapp", "/zamorapp_restaurada");
    for (const seccion of ["pre-data", "data", "post-data"]) {
      const args = ["--no-owner", `--section=${seccion}`, ...(seccion === "post-data" ? [] : ["--exit-on-error"]), ...(seccion === "data" ? ["--disable-triggers"] : []), "--dbname", urlRest, pedido.archivo];
      const r = spawnSync(exe("pg_restore"), args, { encoding: "utf8", windowsHide: true, timeout: 1_800_000 });
      if (r.status !== 0 && seccion !== "post-data") {
        this.registro?.(`[base] pg_restore (${seccion}) falló (${r.status}): ${(r.stderr || "").trim().split("\n").slice(-3).join(" | ")}`);
        throw new Error(`No se pudo restaurar el respaldo: ${(r.stderr || r.error || "").toString().trim().split("\n").pop()}`);
      }
      if (r.status !== 0) this.registro?.(`[base] pg_restore (${seccion}) con avisos: ${(r.stderr || "").trim().split("\n").filter((l) => /error/i.test(l)).length} errores (llaves que se recrean NOT VALID)`);
    }
    // Llaves foráneas que no se pudieron crear: se agregan NOT VALID (valen para lo nuevo, toleran lo viejo)
    const viva = new pg.Client({ connectionString: this.url() }), rest = new pg.Client({ connectionString: urlRest });
    await viva.connect(); await rest.connect();
    try {
      const { rows: fks } = await viva.query("select conname, conrelid::regclass::text as tabla, pg_get_constraintdef(oid) as def from pg_constraint where contype = 'f'");
      const { rows: hay } = await rest.query("select conname, conrelid::regclass::text as tabla from pg_constraint where contype = 'f'");
      const tiene = new Set(hay.map((x) => `${x.tabla}.${x.conname}`));
      for (const f of fks) if (!tiene.has(`${f.tabla}.${f.conname}`)) {
        try { await rest.query(`alter table ${f.tabla} add constraint "${f.conname}" ${f.def} not valid`); this.registro?.(`[base] llave ${f.tabla}.${f.conname} recreada NOT VALID`); }
        catch (e) { this.registro?.(`[base] no se pudo recrear la llave ${f.tabla}.${f.conname}: ${e.message}`); }
      }
    } finally { await viva.end().catch(() => {}); await rest.end().catch(() => {}); }
    c = admin();
    await c.connect();
    try {
      await c.query("select pg_terminate_backend(pid) from pg_stat_activity where datname in ('zamorapp', 'zamorapp_anterior') and pid <> pg_backend_pid()");
      await c.query("drop database if exists zamorapp_anterior with (force)");
      // Los dos renombres juntos: si el segundo falla, no se queda la PC sin base «zamorapp»
      await c.query("begin");
      try {
        await c.query("alter database zamorapp rename to zamorapp_anterior");
        await c.query("alter database zamorapp_restaurada rename to zamorapp");
        await c.query("commit");
      } catch (e) { await c.query("rollback").catch(() => {}); throw e; }
    } finally { await c.end(); }
    // La nube manda: se vuelve a bajar todo; lo que el respaldo tenía pendiente en la bandeja sube con sus versiones
    this.estado.d.cursor = null;
    this.estado.d.copiaCompleta = null;
    this.estado.guardar();
    this.registro?.(`[base] respaldo restaurado desde ${pedido.origen || pedido.archivo}; la base anterior quedó como zamorapp_anterior`);
    await this.#migrar(); // lo que le falte al respaldo (migraciones nuevas) y los ajustes locales de escritorio/base
    await this.limpiarBloquesAjenos(); // los bloques del respaldo pueden ser de otra PC
    // Fase C.2: los adjuntos del paquete vuelven a datos/adjuntos; lo que ya está en disco no se pisa
    if (pedido.adjuntos && fs.existsSync(pedido.adjuntos)) {
      try {
        const r = desempaquetar(pedido.adjuntos, path.join(CONFIG.datos, "adjuntos"));
        this.registro?.(`[base] adjuntos restaurados: ${r.restaurados} nuevos, ${r.existentes} ya estaban${r.omitidos ? `, ${r.omitidos} con nombre no válido en Windows (omitidos)` : ""}`);
        if (r.omitidos) (this.estado.d.respaldo ??= {}).avisoRestauracion = `${r.omitidos} adjunto(s) del respaldo tienen nombres que Windows no acepta y no se restauraron`;
      } catch (e) { this.registro?.(`[base] los adjuntos del respaldo no se pudieron restaurar: ${e.message}`); (this.estado.d.respaldo ??= {}).avisoRestauracion = `Los adjuntos del respaldo no se pudieron restaurar: ${e.message}`; }
    } else if (pedido.avisoAdjuntos) {
      this.registro?.(`[base] ${pedido.avisoAdjuntos}`);
      (this.estado.d.respaldo ??= {}).avisoRestauracion = pedido.avisoAdjuntos;
    }
    (this.estado.d.respaldo ??= {}).restauracionFallida = null;
    this.estado.guardar();
    return true;
  }

  async #rehacerBase() {
    const c = new pg.Client({ connectionString: this.url().replace("/zamorapp", "/postgres") });
    await c.connect();
    try {
      await c.query("drop database if exists zamorapp with (force)");
      await c.query("create database zamorapp");
    } finally { await c.end(); }
    this.estado.d.cursor = null;
    this.estado.d.copiaCompleta = null;
    this.estado.guardar();
  }

  // La configuración va por variables de entorno del proceso hijo: el secreto JWT y la clave del rol
  // no quedan escritos en ningún archivo.
  // En Windows PostgREST a veces se cae en su primer segundo (código 3, sin mensaje: un abort nativo al abrir
  // las primeras conexiones a la vez). La base local no usa SSL ni Kerberos, así que se apagan en la conexión,
  // y si aun así se cae al arrancar se vuelve a lanzar solo, hasta 4 veces, antes de mostrar un error.
  async #iniciarPostgrest() {
    fs.rmSync(path.join(CONFIG.datos, "postgrest.conf"), { force: true }); // de versiones anteriores
    for (let intento = 1; ; intento++) {
      try {
        await this.#lanzarPostgrest();
        return;
      } catch (e) {
        if (!e.caida || intento >= 4) throw e;
        this.registro?.(`[postgrest] se cerró al arrancar (intento ${intento} de 4), se vuelve a lanzar: ${e.message}`);
        await new Promise((r) => setTimeout(r, 1500 * intento));
      }
    }
  }

  async #lanzarPostgrest() {
    const entorno = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith("PGRST_")));
    // postgrest.exe necesita libpq.dll y sus dependencias, que vienen con el PostgreSQL portátil: su carpeta
    // va primero en el PATH del proceso (en Windows la variable puede llamarse "Path").
    const clavePath = Object.keys(entorno).find((k) => k.toUpperCase() === "PATH") || "PATH";
    entorno[clavePath] = [CONFIG.pgBin, entorno[clavePath]].filter(Boolean).join(path.delimiter);
    Object.assign(entorno, {
      PGRST_DB_URI: `${this.url("authenticator", this.estado.d.claveAutenticador)}?sslmode=disable&gssencmode=disable`,
      PGRST_DB_SCHEMAS: "public,clinico",
      PGRST_DB_POOL: "10",
      PGRST_SERVER_HOST: "127.0.0.1",
      PGRST_SERVER_PORT: String(this.puertoPostgrest),
      PGRST_JWT_SECRET: this.estado.d.jwtSecreto,
      PGRST_DB_MAX_ROWS: "5000",
      // sin PGRST_DB_ANON_ROLE: sin sesión no se lee nada
    });
    const p = spawn(CONFIG.postgrest, [], { env: entorno, stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
    // Todo lo que diga PostgREST queda en puerta.log y, si no arranca, en el mensaje de error.
    let ultimas = [];
    let esquemaListo = false;
    const anotar = (b) => {
      // Nunca a disco ni a pantalla: claves de la base, secreto JWT ni credenciales en una URI
      let texto = String(b).trimEnd().replace(/postgresql:\/\/[^@\s]*@/g, "postgresql://***@");
      for (const secreto of [this.estado.d.claveAutenticador, this.estado.d.jwtSecreto, this.estado.d.claveBase]) {
        if (secreto) texto = texto.split(secreto).join("***");
      }
      this.registro?.(`[postgrest] ${texto}`);
      ultimas = [...ultimas, ...texto.split(/\r?\n/)].slice(-6);
      if (/Schema cache loaded/i.test(texto)) esquemaListo = true;
    };
    p.stdout.on("data", anotar);
    p.stderr.on("data", anotar);
    // "close" llega cuando el proceso terminó y ya se leyó toda su salida (con "exit" se perdía la última línea)
    let salida = null;
    p.on("close", (codigo, senal) => { salida = codigo ?? senal ?? "?"; this.hijos = this.hijos.filter((h) => h !== p); });
    p.on("error", (e) => { salida = e.message; });
    this.hijos.push(p);
    // En una PC real la primera vez puede tardar: el antivirus revisa postgrest.exe y PostgREST carga el
    // esquema. Se espera hasta 2 minutos, pero si el proceso se cae se avisa de inmediato con su motivo.
    const inicio = Date.now();
    for (;;) {
      if (salida !== null) {
        const e = new Error(`No arrancó PostgREST (salió con ${salida}): ${ultimas.join(" | ") || "sin mensajes"}`);
        e.caida = true;
        throw e;
      }
      // No se le pregunta nada hasta que diga que cargó el esquema (o pasen 10 s): sin pedidos durante su arranque
      if (esquemaListo || Date.now() - inicio > 10_000) try {
        const r = await fetch(`http://127.0.0.1:${this.puertoPostgrest}/`, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(3000) });
        if (r.status < 500) break;
      } catch { /* aún no escucha */ }
      if (Date.now() - inicio > 120_000) throw new Error(`No arrancó PostgREST en 2 minutos: ${ultimas.join(" | ") || "sin mensajes"}`);
      await new Promise((r) => setTimeout(r, 500));
    }
    this.registro?.(`[postgrest] listo en ${Math.round((Date.now() - inicio) / 1000)} s`);
    // Si después se cae mientras el programa está abierto, se vuelve a lanzar en el mismo puerto
    p.once("close", (codigo) => {
      if (this.deteniendo) return;
      this.registro?.(`[postgrest] se cerró (código ${codigo}), se vuelve a lanzar`);
      this.relanzando = this.#iniciarPostgrest().catch((e) => this.registro?.(`[postgrest] no se pudo relanzar: ${e.message}`));
    });
  }

  async #esperar(prueba, que, intentos = 240) {
    for (let i = 0; i < intentos; i++) {
      try { await prueba(); return; } catch { await new Promise((r) => setTimeout(r, 500)); }
    }
    throw new Error(`No arrancó ${que}`);
  }

  detener() {
    this.deteniendo = true;
    for (const h of this.hijos.reverse()) {
      try { h.kill(); } catch { /* ya terminó */ }
    }
    if (this.baseIniciada) {
      spawnSync(exe("pg_ctl"), ["stop", "-D", this.carpetaBase, "-m", "fast", "-w"], { stdio: "ignore", windowsHide: true, timeout: 60_000 });
      this.baseIniciada = false;
    }
  }
}
