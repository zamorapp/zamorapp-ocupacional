// Simulador de la nube para las pruebas: Auth básico y PostgREST sobre una base de prueba con las
// migraciones reales (la de supabase/pruebas/correr.sh). Las RPC corren con el usuario del token.
import http from "node:http";
import pg from "pg";

export function simularNube({ baseUrl, usuarios }) {
  // usuarios: { "correo": { id, clave } }
  const sesiones = new Map(); // token → uid
  const pool = new pg.Pool({ connectionString: baseUrl, max: 4 });
  const estado = { caida: false, vencerTokens: false };
  const emitir = (uid) => {
    const access_token = `nube-${uid}-${Math.random().toString(36).slice(2)}`;
    const refresh_token = `ref-${uid}-${Math.random().toString(36).slice(2)}`;
    sesiones.set(access_token, uid); sesiones.set(refresh_token, uid);
    return { access_token, refresh_token, token_type: "bearer", expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: uid, email: [...Object.entries(usuarios)].find(([, u]) => u.id === uid)?.[0], aud: "authenticated", role: "authenticated" } };
  };
  const servidor = http.createServer(async (req, res) => {
    if (estado.caida) return req.socket.destroy();
    let cuerpo = ""; for await (const p of req) cuerpo += p;
    const url = new URL(req.url, "http://x");
    const enviar = (s, j) => { res.writeHead(s, { "content-type": "application/json" }); res.end(JSON.stringify(j)); };
    if (url.pathname === "/auth/v1/health") return enviar(200, {});
    if (url.pathname === "/auth/v1/recover") { estado.ultimoRecuperar = url.searchParams.get("redirect_to"); return enviar(200, {}); }
    if (url.pathname === "/auth/v1/token") {
      const b = JSON.parse(cuerpo || "{}");
      if (url.searchParams.get("grant_type") === "password") {
        const u = usuarios[b.email];
        return u && u.clave === b.password ? enviar(200, emitir(u.id)) : enviar(400, { error_code: "invalid_credentials", msg: "Invalid login credentials" });
      }
      const uid = sesiones.get(b.refresh_token);
      return uid && !usuarios._revocados?.includes(uid) ? enviar(200, emitir(uid)) : enviar(400, { error_code: "refresh_token_not_found", msg: "Invalid Refresh Token" });
    }
    const uid = sesiones.get((req.headers.authorization || "").replace(/^Bearer /, ""));
    if (!uid) return enviar(401, { message: "JWT inválido" });
    const c = await pool.connect();
    try {
      await c.query("begin");
      await c.query("select set_config('request.jwt.claim.sub', $1, true)", [uid]);
      await c.query("set local role authenticated");
      let filas;
      if (url.pathname.startsWith("/rest/v1/rpc/")) {
        const fn = url.pathname.slice(13).replace(/[^a-z_0-9]/g, "");
        const args = JSON.parse(cuerpo || "{}");
        const r = await c.query(`select public.${fn}(${Object.keys(args).map((k, i) => `${k} => $${i + 1}`).join(", ")}) as r`, Object.values(args));
        filas = r.rows[0].r;
      } else {
        const tabla = url.pathname.slice(9).replace(/[^a-z_0-9]/g, "");
        const where = [], params = [];
        for (const [k, v] of url.searchParams) {
          const col = `t.${k.replace(/[^a-z_0-9]/g, "")}`;
          if (v === "is.true") where.push(`${col} is true`);
          else if (v.startsWith("eq.")) { params.push(v.slice(3)); where.push(`${col}::text = $${params.length}`); }
        }
        filas = (await c.query(`select to_jsonb(t) as f from public.${tabla} t ${where.length ? "where " + where.join(" and ") : ""}`, params)).rows.map((r) => r.f);
      }
      await c.query("commit");
      enviar(200, filas);
    } catch (e) {
      await c.query("rollback").catch(() => {});
      enviar(400, { message: e.message });
    } finally { c.release(); }
  });
  return { servidor, estado, usuarios, cerrar: async () => { servidor.close(); await pool.end(); } };
}
