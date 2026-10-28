// Conversación con la nube (Supabase): sesiones de cada usuario y llamadas con SU token.
// La PC nunca tiene la clave service_role.
import { CONFIG } from "./config.mjs";

export class Nube {
  constructor(estado) {
    this.estado = estado;
    this.enLinea = false;
  }

  // Con las claves nuevas de Supabase (sb_publishable_…) la clave va solo en "apikey";
  // Authorization lleva únicamente el token del usuario.
  cabeceras(token) {
    return { apikey: CONFIG.nubeAnon, ...(token ? { Authorization: `Bearer ${token}` } : {}), "Content-Type": "application/json" };
  }

  async comprobar() {
    if (!CONFIG.nube) return (this.enLinea = false);
    try {
      const r = await fetch(`${CONFIG.nube}/auth/v1/health`, { headers: this.cabeceras(), signal: AbortSignal.timeout(5000) });
      this.enLinea = r.status < 500;
    } catch {
      this.enLinea = false;
    }
    return this.enLinea;
  }

  // Devuelve { ok, status, cuerpo } tal como responde Supabase Auth.
  async auth(ruta, cuerpo, token) {
    const r = await fetch(`${CONFIG.nube}/auth/v1/${ruta}`, {
      method: cuerpo === undefined ? "GET" : (ruta === "user" ? "PUT" : "POST"),
      headers: this.cabeceras(token),
      body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
      signal: AbortSignal.timeout(15000),
    });
    const texto = await r.text();
    let json = null;
    try { json = texto ? JSON.parse(texto) : null; } catch { /* no es JSON */ }
    return { ok: r.ok, status: r.status, cuerpo: json, texto };
  }

  guardarSesion(uid, s) {
    const u = this.estado.d.usuarios[uid];
    u.nube = { access_token: s.access_token, refresh_token: s.refresh_token, expires_at: s.expires_at || Math.floor(Date.now() / 1000) + (s.expires_in || 3600) };
    if (s.user) u.user = s.user;
    u.ultimoOnline = Date.now();
    this.estado.guardar();
  }

  // Token vigente del usuario en la nube; lo renueva si vence en menos de 2 minutos.
  // Si la nube rechaza la renovación (sesión revocada, clave cambiada, usuario suspendido), el usuario
  // ya no entra sin conexión ni conserva sus sesiones en esta PC hasta volver a entrar con internet.
  async token(uid) {
    const u = this.estado.d.usuarios[uid];
    if (!u?.nube || u.bloqueado || u.requiereNube) return null;
    if (u.nube.expires_at - 120 > Date.now() / 1000) return u.nube.access_token;
    const r = await this.auth("token?grant_type=refresh_token", { refresh_token: u.nube.refresh_token });
    if (r.ok) { this.guardarSesion(uid, r.cuerpo); return r.cuerpo.access_token; }
    if (r.status >= 400 && r.status < 500) this.exigirNube(uid);
    return null;
  }

  // Corta las sesiones locales del usuario y le exige entrar con internet (la nube decide).
  exigirNube(uid, bloquear = false) {
    const u = this.estado.d.usuarios[uid];
    if (!u) return;
    u.nube = null;
    u.requiereNube = true;
    if (bloquear) u.bloqueado = true;
    for (const [t, r] of Object.entries(this.estado.d.refrescos)) if (r.uid === uid) delete this.estado.d.refrescos[t];
    this.estado.guardar();
  }

  async rpc(uid, funcion, args) {
    const token = await this.token(uid);
    if (!token) throw new Error("Sin sesión en la nube");
    const r = await fetch(`${CONFIG.nube}/rest/v1/rpc/${funcion}`, {
      method: "POST", headers: this.cabeceras(token), body: JSON.stringify(args), signal: AbortSignal.timeout(60000),
    });
    const json = await r.json().catch(() => null);
    if (!r.ok) throw Object.assign(new Error(json?.message || `rpc ${funcion}: ${r.status}`), { status: r.status });
    return json;
  }

  // Función de la base que se llama sin sesión (solo con la clave pública), p. ej. correo_para_ingreso.
  // Devuelve { ok, status, cuerpo } como auth(); lanza solo si la nube no responde.
  async rpcAnonimo(funcion, args) {
    const r = await fetch(`${CONFIG.nube}/rest/v1/rpc/${funcion}`, {
      method: "POST", headers: this.cabeceras(), body: JSON.stringify(args), signal: AbortSignal.timeout(15000),
    });
    const cuerpo = await r.json().catch(() => null);
    return { ok: r.ok, status: r.status, cuerpo };
  }

  async leer(uid, ruta) {
    const token = await this.token(uid);
    if (!token) throw new Error("Sin sesión en la nube");
    const r = await fetch(`${CONFIG.nube}/rest/v1/${ruta}`, { headers: this.cabeceras(token), signal: AbortSignal.timeout(30000) });
    if (!r.ok) throw new Error(`leer ${ruta}: ${r.status}`);
    return r.json();
  }
}
