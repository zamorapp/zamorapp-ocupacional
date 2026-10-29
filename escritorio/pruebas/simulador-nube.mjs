// Simulador de la nube para las pruebas: Auth básico y PostgREST sobre una base de prueba con las
// migraciones reales (la de supabase/pruebas/correr.sh). Las RPC corren con el usuario del token.
// Con `postgrest` (ruta del binario) la parte REST la atiende un PostgREST real sobre esa base, con tokens
// JWT firmados como los de Supabase: así la prueba de la ventana ve respuestas idénticas a las de la nube
// (select=, embebidos como trabajadores(count), Prefer, Range). Sin él queda el mini REST de abajo.
import http from "node:http";
import net from "node:net";
import { spawn } from "node:child_process";
import crypto from "node:crypto";
import pg from "pg";
import { firmar, verificar } from "../puerta/jwt.mjs";

const PASAR = ["authorization", "accept", "content-type", "prefer", "range", "range-unit", "accept-profile", "content-profile", "if-none-match"];
const DEVOLVER = ["content-type", "content-range", "content-location", "preference-applied", "location", "etag"];

const puertoLibre = () => new Promise((resolver, rechazar) => {
  const s = net.createServer().listen(0, "127.0.0.1", () => { const { port } = s.address(); s.close(() => resolver(port)); }).on("error", rechazar);
});

// Lanza PostgREST sobre la base de la nube y espera a que responda (hasta 30 s)
async function lanzarPostgrest(binario, baseUrl, secreto) {
  const puerto = await puertoLibre();
  const entorno = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith("PGRST_")));
  const uri = `${baseUrl}${baseUrl.includes("?") ? "&" : "?"}sslmode=disable&gssencmode=disable`;
  const proceso = spawn(binario, [], {
    env: { ...entorno, PGRST_DB_URI: uri, PGRST_DB_SCHEMAS: "public,clinico", PGRST_DB_POOL: "4", PGRST_SERVER_HOST: "127.0.0.1", PGRST_SERVER_PORT: String(puerto), PGRST_JWT_SECRET: secreto, PGRST_LOG_LEVEL: "warn" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let salida = "";
  proceso.stdout.on("data", (d) => { salida += d; });
  proceso.stderr.on("data", (d) => { salida += d; });
  const limite = Date.now() + 30_000;
  const sonda = firmar({ role: "authenticated", exp: Math.floor(Date.now() / 1000) + 60 }, secreto);
  for (;;) {
    if (proceso.exitCode !== null) throw new Error(`El PostgREST de la nube simulada salió con ${proceso.exitCode}: ${salida.trim()}`);
    try {
      const r = await fetch(`http://127.0.0.1:${puerto}/`, { headers: { Authorization: `Bearer ${sonda}` } });
      if (r.status < 500) break;
    } catch { /* todavía no escucha */ }
    if (Date.now() > limite) throw new Error(`El PostgREST de la nube simulada no respondió en 30 s: ${salida.trim()}`);
    await new Promise((r) => setTimeout(r, 300));
  }
  return { puerto, proceso, salida: () => salida };
}

export function simularNube({ baseUrl, usuarios, postgrest }) {
  // usuarios: { "correo": { id, clave } }
  const sesiones = new Map(); // token → uid
  const pool = new pg.Pool({ connectionString: baseUrl, max: 4 });
  // conAal: los tokens llevan "aal" como los de Supabase (verificación en dos pasos); usuarios[correo].factor = id
  // de su autenticador ya activado, que se verifica con el código 123456
  const estado = { caida: false, vencerTokens: false, conAal: false, rest: [], archivos: new Map(), storageRechaza: 0 }; // rest: rutas REST que llegaron a la nube (para saber qué se leyó de la copia)
  const aales = new Map(); // token → aal
  const secreto = postgrest ? crypto.randomBytes(32).toString("hex") : null;
  const pgrst = postgrest ? lanzarPostgrest(postgrest, baseUrl, secreto) : null;
  if (pgrst) pgrst.catch(() => {}); // se informa al atender la primera petición REST, no como rechazo suelto
  const correoDe = (uid) => [...Object.entries(usuarios)].find(([, u]) => u.id === uid)?.[0];
  const usuarioDe = (uid) => {
    const factor = usuarios[correoDe(uid)]?.factor;
    return { id: uid, email: correoDe(uid), aud: "authenticated", role: "authenticated",
      ...(factor ? { factors: [{ id: factor, factor_type: "totp", status: "verified" }] } : {}) };
  };
  const emitir = (uid, aal = "aal1") => {
    const ahora = Math.floor(Date.now() / 1000);
    const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
    const access_token = secreto
      ? firmar({ sub: uid, role: "authenticated", aud: "authenticated", email: correoDe(uid), iat: ahora, exp: ahora + 3600, ...(estado.conAal ? { aal } : {}) }, secreto)
      : estado.conAal ? `${b64({ alg: "none" })}.${b64({ sub: uid, role: "authenticated", aal })}.${Math.random().toString(36).slice(2)}`
      : `nube-${uid}-${Math.random().toString(36).slice(2)}`;
    const refresh_token = `ref-${uid}-${Math.random().toString(36).slice(2)}`;
    sesiones.set(access_token, uid); sesiones.set(refresh_token, uid);
    if (estado.conAal) { aales.set(access_token, aal); aales.set(refresh_token, aal); }
    return { access_token, refresh_token, token_type: "bearer", expires_in: 3600, expires_at: ahora + 3600, user: usuarioDe(uid) };
  };
  const uidDe = (token) => (secreto ? verificar(token, secreto)?.sub : sesiones.get(token)) || null;
  const servidor = http.createServer(async (req, res) => {
    if (estado.caida) return req.socket.destroy();
    if (estado.latenciaMs) await new Promise((r) => setTimeout(r, estado.latenciaMs)); // ida y vuelta a la nube (Venezuela: 108-380 ms)
    let cuerpo = ""; for await (const p of req) cuerpo += p;
    const url = new URL(req.url, "http://x");
    const enviar = (s, j) => { res.writeHead(s, { "content-type": "application/json" }); res.end(JSON.stringify(j)); };
    if (url.pathname === "/auth/v1/health") return enviar(200, {});
    if (url.pathname === "/auth/v1/recover") { estado.ultimoRecuperar = url.searchParams.get("redirect_to"); return enviar(200, {}); }
    // Usuario corto: correo_para_ingreso se llama sin sesión y da el correo solo con la clave correcta
    if (url.pathname === "/rest/v1/rpc/correo_para_ingreso") {
      const b = JSON.parse(cuerpo || "{}");
      const [email, u] = Object.entries(usuarios).find(([, u]) => u?.usuario && u.usuario === b.p_usuario) || [];
      return enviar(200, u && u.clave === b.p_clave ? email : null);
    }
    if (url.pathname === "/auth/v1/token") {
      const b = JSON.parse(cuerpo || "{}");
      if (url.searchParams.get("grant_type") === "password") {
        const u = usuarios[b.email];
        return u && u.clave === b.password ? enviar(200, emitir(u.id)) : enviar(400, { error_code: "invalid_credentials", msg: "Invalid login credentials" });
      }
      const uid = sesiones.get(b.refresh_token);
      return uid && !usuarios._revocados?.includes(uid) ? enviar(200, emitir(uid, aales.get(b.refresh_token))) : enviar(400, { error_code: "refresh_token_not_found", msg: "Invalid Refresh Token" });
    }
    const token = (req.headers.authorization || "").replace(/^Bearer /, "");
    const uid = uidDe(token);
    if (!uid) return enviar(401, { message: "JWT inválido" });
    if (url.pathname === "/auth/v1/user" && req.method === "GET") return enviar(200, usuarioDe(uid));
    const factor = /^\/auth\/v1\/factors\/([^/]+)\/(challenge|verify)$/.exec(url.pathname);
    if (factor) {
      if (factor[2] === "challenge") return enviar(200, { id: "reto-1", type: "totp", expires_at: Math.floor(Date.now() / 1000) + 300 });
      const b = JSON.parse(cuerpo || "{}");
      return factor[1] === usuarios[correoDe(uid)]?.factor && b.code === "123456"
        ? enviar(200, emitir(uid, "aal2")) : enviar(422, { error_code: "mfa_verification_failed", msg: "Invalid TOTP code entered" });
    }
    // Storage mínimo (fase B): guarda en memoria lo que sube la puerta y lo devuelve. storageRechaza: cuántos 400 dar
    const objeto = /^\/storage\/v1\/object\/(?:authenticated\/)?([a-z0-9_-]+)\/(.+)$/.exec(url.pathname);
    if (objeto) {
      const clave = `${objeto[1]}/${decodeURIComponent(objeto[2])}`;
      if (req.method === "PUT" || req.method === "POST") {
        if (estado.storageRechaza > 0) { estado.storageRechaza--; return enviar(400, { statusCode: "400", error: "invalid_mime_type", message: "mime type not supported" }); }
        estado.archivos.set(clave, { cuerpo, tipo: req.headers["content-type"], uid });
        return enviar(200, { Key: clave });
      }
      if (req.method === "GET") {
        const a = estado.archivos.get(clave);
        if (!a) return enviar(400, { statusCode: "404", error: "not_found", message: "Object not found" });
        res.writeHead(200, { "content-type": a.tipo }); return res.end(a.cuerpo);
      }
    }
    // Simula una nube migrada por delante del programa: ya no deja leer la tabla entera (como PostgREST ante 42501)
    // Simula una RLS que niega una escritura con razón (mismo código 42501): NO es «hay que actualizar»
    if (url.pathname.startsWith("/rest/v1/")) estado.rest.push(url.pathname);
    if (estado.rlsNiega && url.pathname.startsWith("/rest/v1/")) {
      return enviar(403, { code: "42501", details: null, hint: null, message: 'new row violates row-level security policy for table "consultas"' });
    }
    if (estado.migradaPorDelante && url.pathname.startsWith("/rest/v1/")) {
      return enviar(403, { code: "42501", details: null, hint: "Grant the required privileges to the current role with: GRANT SELECT ON public.trabajadores TO authenticated;", message: "permission denied for table trabajadores" });
    }
    if (pgrst && url.pathname.startsWith("/rest/v1/")) {
      // PostgREST real: se le pasa la petición tal cual (el token ya va firmado con su secreto)
      let p;
      try { p = await pgrst; } catch (e) { return enviar(503, { message: e.message }); }
      const cab = {}; for (const h of PASAR) if (req.headers[h]) cab[h] = req.headers[h];
      const r = await fetch(`http://127.0.0.1:${p.puerto}${url.pathname.slice(8)}${url.search}`, { method: req.method, headers: cab, body: ["GET", "HEAD"].includes(req.method) ? undefined : cuerpo });
      const texto = await r.text();
      const salida = {}; for (const h of DEVOLVER) { const v = r.headers.get(h); if (v) salida[h] = v; }
      res.writeHead(r.status, salida); return res.end(texto);
    }
    const c = await pool.connect();
    try {
      await c.query("begin");
      await c.query("select set_config('request.jwt.claim.sub', $1, true)", [uid]);
      if (aales.has(token)) await c.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: uid, role: "authenticated", aal: aales.get(token) })]);
      await c.query("set local role authenticated");
      let filas;
      if (url.pathname.startsWith("/rest/v1/rpc/")) {
        const fn = url.pathname.slice(13).replace(/[^a-z_0-9]/g, "");
        const args = JSON.parse(cuerpo || "{}");
        // Un argumento jsonb (p. ej. el lote de aplicar_cambios) viaja como texto JSON: node-pg mandaría una lista como arreglo de PostgreSQL
        const valores = Object.values(args).map((v) => (v !== null && typeof v === "object" ? JSON.stringify(v) : v));
        const r = await c.query(`select public.${fn}(${Object.keys(args).map((k, i) => `${k} => $${i + 1}`).join(", ")}) as r`, valores);
        filas = r.rows[0].r;
      } else {
        const tabla = url.pathname.slice(9).replace(/[^a-z_0-9]/g, "");
        const where = [], params = [];
        for (const [k, v] of url.searchParams) {
          const col = `t.${k.replace(/[^a-z_0-9]/g, "")}`;
          if (v === "is.true") where.push(`${col} is true`);
          else if (v.startsWith("eq.")) { params.push(v.slice(3)); where.push(`${col}::text = $${params.length}`); }
        }
        // select=a,b pide solo esas columnas (con privilegios por columna, * puede no estar permitido)
        const cols = (url.searchParams.get("select") ?? "*").split(",").map((x) => x.trim().replace(/[^a-z_0-9*]/g, "")).filter(Boolean);
        const fila = cols.includes("*") ? "to_jsonb(t)" : `jsonb_build_object(${cols.map((x) => `'${x}', t.${x}`).join(", ")})`;
        filas = (await c.query(`select ${fila} as f from public.${tabla} t ${where.length ? "where " + where.join(" and ") : ""}`, params)).rows.map((r) => r.f);
      }
      await c.query("commit");
      enviar(200, filas);
    } catch (e) {
      await c.query("rollback").catch(() => {});
      enviar(400, { message: e.message });
    } finally { c.release(); }
  });
  const cerrar = async () => {
    servidor.close();
    if (pgrst) await pgrst.then((p) => p.proceso.kill(), () => {});
    await pool.end();
  };
  return { servidor, estado, usuarios, postgrestListo: pgrst, cerrar };
}
