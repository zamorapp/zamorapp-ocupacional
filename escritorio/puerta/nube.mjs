// Conversación con la nube (Supabase): sesiones de cada usuario y llamadas con SU token.
// La PC nunca tiene la clave service_role.
import { CONFIG } from "./config.mjs";

export class Nube {
  constructor(estado) {
    this.estado = estado;
    this.enLinea = false;
  }

  cabeceras(token) {
    return { apikey: CONFIG.nubeAnon, Authorization: `Bearer ${token || CONFIG.nubeAnon}`, "Content-Type": "application/json" };
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
  // Si la nube lo rechaza (usuario desactivado o sesión revocada), el usuario queda bloqueado en esta PC.
  async token(uid) {
    const u = this.estado.d.usuarios[uid];
    if (!u?.nube || u.bloqueado) return null;
    if (u.nube.expires_at - 120 > Date.now() / 1000) return u.nube.access_token;
    const r = await this.auth("token?grant_type=refresh_token", { refresh_token: u.nube.refresh_token });
    if (r.ok) { this.guardarSesion(uid, r.cuerpo); return r.cuerpo.access_token; }
    if (r.status >= 400 && r.status < 500) {
      u.nube = null;
      this.estado.guardar();
    }
    return null;
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

  async leer(uid, ruta) {
    const token = await this.token(uid);
    if (!token) throw new Error("Sin sesión en la nube");
    const r = await fetch(`${CONFIG.nube}/rest/v1/${ruta}`, { headers: this.cabeceras(token), signal: AbortSignal.timeout(30000) });
    if (!r.ok) throw new Error(`leer ${ruta}: ${r.status}`);
    return r.json();
  }
}
