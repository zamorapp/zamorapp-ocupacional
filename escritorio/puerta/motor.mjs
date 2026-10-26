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
    this.puertoPostgrest = await puertoLibre(CONFIG.puertoPostgrest);
    await this.#iniciarPostgres();
    await this.#migrar();
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
    // pg_ctl (y no postgres.exe directo): en Windows arranca con permisos reducidos aunque el usuario sea administrador.
    // Sin tuberías: en Windows el servidor hereda las de pg_ctl y la espera no terminaría nunca.
    const log = path.join(CONFIG.datos, "base.log");
    const r = spawnSync(exe("pg_ctl"), ["start", "-D", this.carpetaBase, "-w", "-t", "60", "-l", log,
      "-o", `-p ${this.puertoBase} -c listen_addresses=127.0.0.1 -c max_connections=40 -c shared_buffers=64MB`],
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

  async #iniciarPostgrest() {
    const conf = path.join(CONFIG.datos, "postgrest.conf");
    fs.writeFileSync(conf, [
      `db-uri = "${this.url("authenticator", this.estado.d.claveAutenticador)}"`,
      `db-schemas = "public,clinico"`,
      `db-pool = 10`,
      `server-host = "127.0.0.1"`,
      `server-port = ${this.puertoPostgrest}`,
      `jwt-secret = "${this.estado.d.jwtSecreto}"`,
      `db-max-rows = 5000`,
      // sin db-anon-role: sin sesión no se lee nada
    ].join("\n"), { mode: 0o600 });
    const p = spawn(CONFIG.postgrest, [conf], { stdio: ["ignore", "ignore", "pipe"], windowsHide: true });
    p.stderr.on("data", (b) => this.registro?.(`[postgrest] ${b}`));
    this.hijos.push(p);
    await this.#esperar(async () => {
      const r = await fetch(`http://127.0.0.1:${this.puertoPostgrest}/`, { headers: { Accept: "application/json" } });
      if (r.status >= 500) throw new Error(`PostgREST ${r.status}`);
    }, "PostgREST");
  }

  async #esperar(prueba, que, intentos = 60) {
    for (let i = 0; i < intentos; i++) {
      try { await prueba(); return; } catch { await new Promise((r) => setTimeout(r, 500)); }
    }
    throw new Error(`No arrancó ${que}`);
  }

  detener() {
    for (const h of this.hijos.reverse()) {
      try { h.kill(); } catch { /* ya terminó */ }
    }
    if (this.baseIniciada) {
      spawnSync(exe("pg_ctl"), ["stop", "-D", this.carpetaBase, "-m", "fast", "-w"], { stdio: "ignore", windowsHide: true, timeout: 60_000 });
      this.baseIniciada = false;
    }
  }
}
