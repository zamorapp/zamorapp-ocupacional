// Motor local: PostgreSQL portátil y PostgREST, solo en 127.0.0.1 y en puertos propios.
// No instala servicios de Windows ni toca SQL Server: son procesos hijos de zamorApp.
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import pg from "pg";
import { CONFIG } from "./config.mjs";

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
    const log = path.join(CONFIG.datos, "base.log");
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
    const c = new pg.Client({ connectionString: this.url() });
    await c.connect();
    try {
      await c.query("create schema if not exists local; create table if not exists local.migraciones (nombre text primary key, en timestamptz default now())");
      const hechas = new Set((await c.query("select nombre from local.migraciones")).rows.map((r) => r.nombre));
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
