// Conversación con la nube (Supabase): sesiones de cada usuario y llamadas con SU token.
// La PC nunca tiene la clave service_role.
import { CONFIG } from "./config.mjs";

export const MENSAJE_ACTUALIZAR = "zamorApp Escritorio necesita actualizarse: la nube tiene cambios que esta versión no entiende";

export class Nube {
  constructor(estado, registro = () => {}) {
    this.estado = estado;
    this.registro = registro;
    this.enLinea = false;
    this.revisadaEn = 0;
    // La nube cambió (migración nueva) y esta versión del programa aún no la entiende: hay que actualizar.
    this.incompatible = null;
  }

  // Códigos con los que la nube dice «eso no existe o no se puede» a una consulta que esta versión creía válida:
  // permiso sobre tabla o columna quitado (42501 «permission denied for …»), columna/tabla/función que ya no
  // existe (42703, 42P01, 42883) o que PostgREST no encuentra (PGRST202/204/205). No es un fallo de red ni de
  // datos: es el programa viejo. Ojo: 42501 también es una RLS que niega una escritura con razón («new row
  // violates row-level security policy», p. ej. editar una consulta firmada): eso NO es incompatibilidad.
  anotarIncompatibilidad(status, cuerpo, donde) {
    const codigo = String(cuerpo?.code || "");
    if (!(status >= 400 && status < 500) || !/^(42501|42703|42P01|42883|PGRST20[245])$/.test(codigo)) return false;
    if (codigo === "42501" && !/^permission denied for (table|view|column|function|schema|sequence)\b/.test(String(cuerpo?.message || ""))) return false;
    if (!this.incompatible) this.incompatible = { codigo, mensaje: String(cuerpo?.message || ""), donde, en: new Date().toISOString() };
    return true;
  }

  // Con las claves nuevas de Supabase (sb_publishable_…) la clave va solo en "apikey";
  // Authorization lleva únicamente el token del usuario.
  cabeceras(token) {
    return { apikey: CONFIG.nubeAnon, ...(token ? { Authorization: `Bearer ${token}` } : {}), "Content-Type": "application/json" };
  }

  // Pregunta a la nube si responde. Cada cambio (en línea ⇄ sin conexión) queda en puerta.log con el motivo,
  // para que un «sin conexión» se pueda explicar después. 10 s: el internet de Venezuela a veces tarda.
  async comprobar() {
    const antes = this.enLinea;
    let motivo = "sin dirección de la nube";
    if (CONFIG.nube) {
      try {
        const r = await fetch(`${CONFIG.nube}/auth/v1/health`, { headers: this.cabeceras(), signal: AbortSignal.timeout(10000) });
        this.enLinea = r.status < 500;
        motivo = `la nube respondió ${r.status}`;
      } catch (e) {
        this.enLinea = false;
        motivo = e?.cause?.code || e?.name || e?.message || "sin respuesta";
      }
    } else this.enLinea = false;
    this.revisadaEn = Date.now();
    if (antes !== this.enLinea || !this.anotada) this.registro(`[nube] ${this.enLinea ? "en línea" : "sin conexión"} (${motivo})`);
    this.anotada = true;
    return this.enLinea;
  }

  // Una llamada a la nube falló por red: se pasa a «sin conexión» y se anota (confirmar() vuelve a preguntar en 15 s)
  marcarCaida(motivo) {
    if (this.enLinea) this.registro(`[nube] sin conexión (${motivo})`);
    this.enLinea = false;
    this.revisadaEn = Date.now();
  }

  // Antes de tratar algo como «sin conexión» se vuelve a preguntar, como mucho cada 15 s: un corte al
  // arrancar (red de Windows aún no lista) o un fallo de un instante no deja la PC «sin internet» hasta la
  // próxima sincronía.
  async confirmar() {
    if (this.enLinea || Date.now() - this.revisadaEn < 15000) return this.enLinea;
    return this.comprobar();
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
    if (!r.ok) {
      this.anotarIncompatibilidad(r.status, json, `rpc ${funcion}`);
      throw Object.assign(new Error(json?.message || `rpc ${funcion}: ${r.status}`), { status: r.status });
    }
    return json;
  }

  async leer(uid, ruta) {
    const token = await this.token(uid);
    if (!token) throw new Error("Sin sesión en la nube");
    const r = await fetch(`${CONFIG.nube}/rest/v1/${ruta}`, { headers: this.cabeceras(token), signal: AbortSignal.timeout(30000) });
    if (!r.ok) {
      const json = await r.json().catch(() => null);
      if (this.anotarIncompatibilidad(r.status, json, ruta.split("?")[0])) throw new Error(`${MENSAJE_ACTUALIZAR} (${json.message})`);
      throw new Error(`leer ${ruta}: ${r.status}`);
    }
    return r.json();
  }
}
