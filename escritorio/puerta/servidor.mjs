// Puerta local: la app de escritorio le habla como si fuera Supabase (auth, rest, storage).
// Con internet desvía todo a la nube con el token de la nube del usuario; sin internet atiende
// desde la copia local, por ahora solo para consultar (fase F1).
import { spawn } from "node:child_process";
import crypto from "node:crypto";
import http from "node:http";
import pg from "pg";
import { CONFIG, RPC_LECTURA } from "./config.mjs";
import { claveCorrecta, huellaClave } from "./estado.mjs";
import { firmar, tokenDeCabecera, verificar } from "./jwt.mjs";
import { PAGINA_INICIO } from "./inicio.mjs";
import { crearHello } from "./hello.mjs";
import { MENSAJE_ACTUALIZAR } from "./nube.mjs";

const PASAR = ["content-type", "accept", "prefer", "range", "accept-profile", "content-profile", "x-client-info", "x-upsert", "cache-control", "x-supabase-api-version"];
// Los enlaces de los correos (recuperar clave, confirmar) abren la app web: la PC no recibe visitas de afuera.
const WEB = "https://zamorapp-ocupacional.vercel.app";
const DEVOLVER = ["content-type", "content-range", "preference-applied", "location", "cache-control", "etag", "last-modified"];
const FALLOS_PERMITIDOS = 5; // por correo; luego espera de 15 min que se duplica hasta 1 hora
const FALLOS_GLOBALES = 30; // entre todos los correos, por cada 10 minutos
const SIN_CONEXION = "Sin conexión a internet: en esta PC por ahora solo se puede consultar. Podrás guardar cuando vuelva la conexión.";
// Roles con verificación en dos pasos obligatoria (como public.requiere_dos_pasos en la nube)
const CON_DOS_PASOS = ["administrador", "gerente_medico"];
// "aal" de una sesión de la nube (Supabase la pone siempre; el simulador de pruebas no)
const aalDe = (token) => { try { return JSON.parse(Buffer.from(String(token).split(".")[1], "base64url")).aal; } catch { return undefined; } };

const URL_WEB = "https://zamorapp-ocupacional.vercel.app";

export function crearPuerta({ estado, nube, motor, replica, origen, control = "", registro = () => {} }) {
  let pedidaActualizacion = false;
  const d = () => estado.d;
  // La ventana de zamorApp puede estar en 127.0.0.1 o en localhost (mismo puerto): las dos son la app
  const origenesApp = [...new Set([origen, origen.replace("//127.0.0.1:", "//localhost:"), origen.replace("//localhost:", "//127.0.0.1:")])];

  const responder = (res, status, cuerpo, extra = {}) => {
    const texto = cuerpo === undefined ? "" : typeof cuerpo === "string" ? cuerpo : JSON.stringify(cuerpo);
    // Content-Length (no «chunked»): el programa (main.rs) lee la respuesta con HTTP crudo y la toma tal cual
    res.writeHead(status, { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(texto), ...extra });
    res.end(texto);
  };

  // Verificación en dos pasos: la sesión local de un administrador o gerente médico lleva "aal" (aal1 tras la clave,
  // aal2 tras el código de 6 dígitos) y la app le pide el código igual que en la web. Sin "aal" la app no lo pide.
  const exigeDosPasos = (u) => Boolean(u?.nubeConAal && CON_DOS_PASOS.includes(u.rol));
  const sesionLocal = (uid, segundoPaso = false) => {
    const u = d().usuarios[uid];
    const ahora = Math.floor(Date.now() / 1000);
    const exp = ahora + CONFIG.sesionSegundos;
    const aal = exigeDosPasos(u) ? (segundoPaso ? "aal2" : "aal1") : undefined;
    const access_token = firmar({ sub: uid, role: "authenticated", aud: "authenticated", email: u.email, iat: ahora, exp, session_id: crypto.randomUUID(), ...(aal ? { aal } : {}) }, d().jwtSecreto);
    const refresh_token = crypto.randomBytes(24).toString("base64url");
    for (const [t, r] of Object.entries(d().refrescos)) if (r.vence < Date.now()) delete d().refrescos[t];
    d().refrescos[refresh_token] = { uid, vence: Date.now() + 30 * 864e5, segundoPaso };
    estado.guardar();
    return { access_token, token_type: "bearer", expires_in: CONFIG.sesionSegundos, expires_at: exp, refresh_token, user: u.user };
  };

  const usuarioDe = (req) => {
    const datos = verificar(tokenDeCabecera(req.headers.authorization), d().jwtSecreto);
    const u = datos && d().usuarios[datos.sub];
    return u && !u.bloqueado && !u.requiereNube ? { uid: datos.sub, u } : null;
  };

  // Freno a quien prueba claves: por correo y en total. Vive en memoria (la puerta solo atiende a esta PC).
  const intentos = new Map();
  const esperaDe = (clave) => Math.max(0, (intentos.get(clave)?.hasta || 0) - Date.now());
  const anotarFallo = (email) => {
    const f = intentos.get(email) || { fallos: 0, hasta: 0 };
    f.fallos += 1;
    if (f.fallos >= FALLOS_PERMITIDOS) f.hasta = Date.now() + Math.min(3600e3, 900e3 * 2 ** (f.fallos - FALLOS_PERMITIDOS));
    intentos.set(email, f);
    const g = intentos.get("*") || { fallos: 0, desde: Date.now(), hasta: 0 };
    if (Date.now() - g.desde > 600e3) Object.assign(g, { fallos: 0, desde: Date.now() });
    g.fallos += 1;
    if (g.fallos >= FALLOS_GLOBALES) g.hasta = Date.now() + 600e3;
    intentos.set("*", g);
  };

  const errorAuth = (res, status, msg, code = "invalid_credentials") =>
    responder(res, status, { code: status, error_code: code, msg, error: code, error_description: msg });

  // undefined: no se pudo consultar; null: no es miembro activo.
  async function rolEnNube(uid) {
    try {
      const filas = await nube.leer(uid, `miembros?usuario_id=eq.${uid}&activo=is.true&select=rol,org_id`);
      return filas.find((f) => CON_DOS_PASOS.includes(f.rol))?.rol || filas[0]?.rol || null;
    } catch { return undefined; }
  }

  async function anotarUsuarioLocal(uid, email) {
    const c = new pg.Client({ connectionString: motor.url() });
    try {
      await c.connect();
      await c.query("set session_replication_role = replica");
      await c.query("insert into auth.users (id, email) values ($1, $2) on conflict (id) do update set email = excluded.email", [uid, email]);
    } catch (e) { registro(`[puerta] usuario local: ${e.message}`); } finally { await c.end().catch(() => {}); }
  }

  async function entrar(req, res, cuerpo) {
    const email = String(cuerpo?.email || "").trim().toLowerCase();
    const clave = String(cuerpo?.password || "");
    const espera = Math.max(esperaDe(email), esperaDe("*"));
    if (espera) registro("[auth] entrar: en espera por demasiados intentos");
    if (espera) return errorAuth(res, 429, `Demasiados intentos. Espera ${Math.ceil(espera / 60000)} min y vuelve a probar.`, "over_request_rate_limit");
    const conocido = Object.entries(d().usuarios).find(([, u]) => u.email === email);
    if (!nube.enLinea) await nube.comprobar(); // antes de entrar sin conexión, se confirma que de verdad no hay internet
    if (nube.enLinea) {
      try {
        const r = await nube.auth("token?grant_type=password", { email, password: clave });
        registro(`[auth] entrar en línea: ${r.status}${r.ok ? "" : ` ${r.cuerpo?.error_code || r.cuerpo?.error || ""}`} (usuario ${conocido ? "conocido" : "nuevo"} en esta PC)`);
        if (!r.ok) {
          if (r.status >= 400 && r.status < 500) {
            anotarFallo(email);
            // La nube rechaza una clave que esta PC aún aceptaría: la cambiaron. La huella local deja de valer.
            if (conocido && claveCorrecta(clave, conocido[1])) nube.exigirNube(conocido[0]);
          }
          return responder(res, r.status, r.cuerpo ?? r.texto);
        }
        const uid = r.cuerpo.user.id;
        // Primero la sesión (para consultar el rol con ella) y la huella solo si es miembro activo.
        d().usuarios[uid] = { ...(d().usuarios[uid] || {}), email, bloqueado: false, requiereNube: false, user: r.cuerpo.user, nubeConAal: Boolean(aalDe(r.cuerpo.access_token)) };
        nube.guardarSesion(uid, r.cuerpo);
        const rol = await rolEnNube(uid);
        if (rol === null) {
          registro("[auth] entrar: no es miembro activo; acceso bloqueado en esta PC");
          nube.exigirNube(uid, true);
          return errorAuth(res, 400, "Tu acceso fue desactivado. Habla con el administrador.", "user_banned");
        }
        Object.assign(d().usuarios[uid], huellaClave(clave));
        if (rol) d().usuarios[uid].rol = rol;
        intentos.delete(email);
        estado.guardar();
        await anotarUsuarioLocal(uid, email);
        replica.ciclo().catch(() => {});
        return responder(res, 200, sesionLocal(uid));
      } catch (e) {
        registro(`[puerta] nube no responde al entrar: ${e.message}`);
        nube.enLinea = false;
      }
    }
    const [uid, u] = conocido || [];
    if (!u) {
      registro("[auth] entrar sin conexión: usuario que nunca entró en esta PC");
      anotarFallo(email);
      return errorAuth(res, 400, "Sin conexión a internet. La primera vez que entras en esta PC necesitas internet.", "offline_first_login");
    }
    if (!claveCorrecta(clave, u)) {
      registro("[auth] entrar sin conexión: clave incorrecta");
      anotarFallo(email);
      return errorAuth(res, 400, "Correo o clave incorrectos");
    }
    registro(`[auth] entrar sin conexión: ${u.bloqueado ? "bloqueado" : u.requiereNube ? "requiere internet" : "ok"}`);
    intentos.delete(email);
    if (u.bloqueado) return errorAuth(res, 400, "Tu acceso en esta PC fue desactivado. Habla con el administrador.", "user_banned");
    if (u.requiereNube) return errorAuth(res, 400, "Tu sesión fue cerrada desde la nube (por ejemplo, cambiaste la clave). Conecta la PC a internet para entrar.", "session_expired");
    if (Date.now() - (u.ultimoOnline || 0) > CONFIG.diasSinConexion * 864e5) {
      return errorAuth(res, 400, `Pasaron más de ${CONFIG.diasSinConexion} días sin conexión. Conecta la PC a internet para entrar.`, "session_expired");
    }
    return responder(res, 200, sesionLocal(uid));
  }

  function renovar(res, cuerpo) {
    const r = d().refrescos[cuerpo?.refresh_token];
    const u = r && d().usuarios[r.uid];
    if (!r || r.vence < Date.now() || !u || u.bloqueado || u.requiereNube) {
      return errorAuth(res, 400, "La sesión venció. Vuelve a entrar.", "refresh_token_not_found");
    }
    if (!nube.enLinea && Date.now() - (u.ultimoOnline || 0) > CONFIG.diasSinConexion * 864e5) {
      delete d().refrescos[cuerpo.refresh_token];
      return errorAuth(res, 400, `Pasaron más de ${CONFIG.diasSinConexion} días sin conexión. Conecta la PC a internet para entrar.`, "session_expired");
    }
    delete d().refrescos[cuerpo.refresh_token];
    return responder(res, 200, sesionLocal(r.uid, r.segundoPaso));
  }

  // Reenvía la petición a la nube con el token de la nube de ese usuario. Devuelve false si la nube no responde.
  async function aLaNube(req, res, cuerpo, uid) {
    const token = uid ? await nube.token(uid) : null;
    if (uid && !token) return false;
    const cab = { apikey: CONFIG.nubeAnon, ...(token ? { Authorization: `Bearer ${token}` } : {}) };
    for (const h of PASAR) if (req.headers[h]) cab[h] = req.headers[h];
    try {
      const r = await fetch(`${CONFIG.nube}${req.url}`, {
        method: req.method, headers: cab, body: ["GET", "HEAD"].includes(req.method) ? undefined : cuerpo, signal: AbortSignal.timeout(60000),
      });
      const salida = {};
      for (const h of DEVOLVER) if (r.headers.get(h)) salida[h] = r.headers.get(h);
      let cuerpoRespuesta = Buffer.from(await r.arrayBuffer());
      if (r.status >= 400 && r.status < 500) {
        // La nube ya cambió y esta versión pide algo que ya no existe: se avisa claro (y /zamorapp/estado lo
        // marca para que la ventana ofrezca actualizar) en vez de dejar caer la pantalla con un error mudo.
        let json = null;
        try { json = JSON.parse(cuerpoRespuesta.toString("utf8")); } catch { /* no es JSON */ }
        if (json && nube.anotarIncompatibilidad(r.status, json, req.url.split("?")[0])) {
          registro(`[puerta] la nube cambió y esta versión no la entiende (${json.code} en ${req.method} ${req.url.split("?")[0]}): ${json.message}`);
          cuerpoRespuesta = Buffer.from(JSON.stringify({ ...json, message: `${MENSAJE_ACTUALIZAR} (${json.message})` }));
          salida["content-type"] = "application/json; charset=utf-8";
        }
      }
      res.writeHead(r.status, salida);
      res.end(cuerpoRespuesta);
      return true;
    } catch (e) {
      registro(`[puerta] nube no responde: ${e.message}`);
      nube.enLinea = false;
      return false;
    }
  }

  async function aLaCopia(req, res, cuerpo) {
    const cab = { Authorization: req.headers.authorization };
    for (const h of PASAR) if (req.headers[h]) cab[h] = req.headers[h];
    const r = await fetch(`http://127.0.0.1:${motor.puertoPostgrest}${req.url.replace(/^\/rest\/v1/, "")}`, {
      method: req.method, headers: cab, body: ["GET", "HEAD"].includes(req.method) ? undefined : cuerpo,
    });
    const salida = {};
    for (const h of DEVOLVER) if (r.headers.get(h)) salida[h] = r.headers.get(h);
    res.writeHead(r.status, salida);
    res.end(Buffer.from(await r.arrayBuffer()));
  }

  const soloLectura = (req) => {
    if (["GET", "HEAD"].includes(req.method)) return true;
    const m = /^\/rest\/v1\/rpc\/([a-z_0-9]+)/.exec(req.url);
    return Boolean(m && RPC_LECTURA.has(m[1]));
  };

  async function registrarEquipo(req, res, cuerpo) {
    const quien = usuarioDe(req);
    if (!quien) return errorAuth(res, 401, "Entra primero como administrador", "bad_jwt");
    if (!nube.enLinea) return responder(res, 503, { message: "Para registrar esta PC hace falta internet" });
    const filas = await nube.leer(quien.uid, `miembros?usuario_id=eq.${quien.uid}&rol=eq.administrador&activo=is.true&select=org_id`);
    if (!filas.length) return responder(res, 403, { message: "Solo el administrador registra la PC" });
    // Registrar una PC le da copia de todos los datos: la nube exige la verificación en dos pasos (aal2)
    if (aalDe(await nube.token(quien.uid)) === "aal1") {
      const factor = (quien.u.user?.factors || []).find((f) => f.factor_type === "totp" && f.status === "verified");
      if (!factor) return responder(res, 403, { code: "dos_pasos_sin_activar", message: "Primero activa la verificación en dos pasos: entra en zamorapp-ocupacional.vercel.app con tu cuenta y sigue los pasos. Luego vuelve aquí." });
      if (!cuerpo?.codigo) return responder(res, 401, { code: "dos_pasos", message: "Escribe el código de 6 dígitos de tu app autenticadora." });
      const fallo = await verificarEnNube(quien.uid, factor.id, String(cuerpo.codigo));
      if (fallo) return responder(res, 401, { code: "dos_pasos", message: fallo });
    }
    // Serie de numeración: la primera libre (A, B, C… sin la W, que es de la web)
    const series = cuerpo?.serie ? [String(cuerpo.serie)] : [..."ABCDEFGHIJKLMNOPQRSTUVXYZ"];
    let r = null;
    for (const serie of series) {
      try {
        r = await nube.rpc(quien.uid, "registrar_equipo", { p_org: filas[0].org_id, p_nombre: String(cuerpo?.nombre || "PC"), p_serie: serie });
        break;
      } catch (e) {
        if (!/duplicate|unique|duplicad/i.test(e.message) || series.length === 1) throw e;
      }
    }
    if (!r) return responder(res, 409, { message: "No quedan series libres" });
    d().equipo = { id: r.id, secreto: r.secreto, org_id: filas[0].org_id, nombre: cuerpo?.nombre || "PC" };
    d().cursor = null;
    estado.guardar();
    replica.ciclo().catch(() => {});
    return responder(res, 200, { ok: true, id: r.id });
  }

  // Pide a la nube el reto y lo verifica con el código; si es correcto guarda la sesión aal2 de la nube.
  // Devuelve null si salió bien o el motivo para mostrarlo.
  async function verificarEnNube(uid, factorId, codigo) {
    const token = await nube.token(uid);
    if (!token) return "La verificación en dos pasos necesita internet.";
    const reto = await nube.auth(`factors/${factorId}/challenge`, {}, token);
    if (!reto.ok) return "No se pudo pedir la verificación a la nube. Intenta de nuevo.";
    const r = await nube.auth(`factors/${factorId}/verify`, { challenge_id: reto.cuerpo.id, code: codigo.replace(/\D/g, "") }, token);
    registro(`[auth] verificación en dos pasos: ${r.ok ? "ok" : r.status}`);
    if (!r.ok) return r.status === 429 ? "Demasiados intentos. Espera unos minutos." : "El código no es correcto o ya cambió. Escribe el que muestra ahora la app.";
    nube.guardarSesion(uid, r.cuerpo);
    return null;
  }

  // Inscribir, borrar, retar y verificar el segundo paso (rutas /auth/v1/factors de Supabase): se pasan a la nube
  // con la sesión de la persona. Al verificar, la nube da una sesión aal2 y la puerta entrega una local aal2.
  async function dosPasos(req, res, factor, accion, cuerpo) {
    const quien = usuarioDe(req);
    if (!quien) return errorAuth(res, 401, "Sesión no válida", "bad_jwt");
    if (!nube.enLinea) await nube.comprobar();
    const token = nube.enLinea ? await nube.token(quien.uid) : null;
    if (!token) return errorAuth(res, 503, "La verificación en dos pasos necesita internet. Sin conexión, sal y entra con Windows Hello (PIN, huella o rostro), que cuenta como segundo paso.", "offline");
    const ruta = `factors${factor ? `/${factor}` : ""}${accion ? `/${accion}` : ""}`;
    const r = await nube.auth(ruta, req.method === "DELETE" ? null : cuerpo ?? {}, token, req.method);
    registro(`[auth] ${req.method} ${ruta}: ${r.status}`);
    if (r.ok && accion === "verify") {
      nube.guardarSesion(quien.uid, r.cuerpo);
      return responder(res, 200, sesionLocal(quien.uid, true));
    }
    if (r.ok && !accion) { // inscribir o borrar: la lista de factores de la persona cambió
      const u = await nube.auth("user", undefined, token);
      if (u.ok) { quien.u.user = u.cuerpo; estado.guardar(); }
    }
    return responder(res, r.status, r.cuerpo ?? r.texto);
  }

  // Con internet, la nube decide el segundo paso: si la sesión guardada en la nube de un administrador o gerente
  // médico aún es aal1, Windows Hello no basta (la nube rechazaría sus pedidos con 403 «dos_pasos») y se pide el código.
  async function cumpleDosPasosEnNube(uid) {
    const u = d().usuarios[uid];
    if (!exigeDosPasos(u) || !nube.enLinea) return true;
    return aalDe(await nube.token(uid)) !== "aal1";
  }

  // Windows Hello: la ventana avisa con la clave de control de esta sesión; ver hello.mjs
  const atenderHello = crearHello({ estado, nube, control, sesionLocal, usuarioDe, rolEnNube, responder, errorAuth, registro, cumpleDosPasosEnNube });

  const servidor = http.createServer(async (req, res) => {
    // Solo se atiende a esta PC por su nombre local (Host) y, desde un navegador, solo a la ventana de
    // zamorApp o a la propia puerta (Origin). Así una página web cualquiera, ni siquiera con un DNS que
    // apunte a 127.0.0.1, puede hablarle a la puerta ni probar claves.
    const puerto = req.socket.localPort;
    const locales = [`127.0.0.1:${puerto}`, `localhost:${puerto}`];
    // Un rechazo también se registra: así se distingue "nunca llegó" de "llegó y se rechazó"
    const rechazar = (motivo) => {
      registro(`[puerta] rechazado ${req.method} ${req.url}: ${motivo} (Host "${req.headers.host || ""}", Origin "${req.headers.origin || ""}")`);
      res.writeHead(403); res.end();
    };
    if (!locales.includes(String(req.headers.host || "").toLowerCase())) return rechazar("el Host no es esta PC");
    const desdeApp = origenesApp.includes(req.headers.origin);
    if (req.headers.origin && !desdeApp && !locales.some((h) => req.headers.origin === `http://${h}`)) {
      return rechazar("el Origin no es la ventana de zamorApp");
    }
    // Solo la ventana de zamorApp (su propio origen) puede llamar a la puerta desde el navegador.
    const cors = desdeApp ? {
      "Access-Control-Allow-Origin": req.headers.origin, "Access-Control-Allow-Credentials": "true",
      // Se aceptan las cabeceras que pida el cliente de Supabase (cambian entre versiones, p. ej. x-supabase-api-version):
      // el origen ya está limitado a la ventana de zamorApp.
      "Access-Control-Allow-Headers": String(req.headers["access-control-request-headers"] || "").replace(/[^a-zA-Z0-9,\- ]/g, "") ||
        "authorization, apikey, content-type, x-client-info, x-supabase-api-version, prefer, accept-profile, content-profile, range, x-upsert, cache-control",
      "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS", "Access-Control-Expose-Headers": "content-range, content-type",
    } : {};
    for (const [k, v] of Object.entries(cors)) res.setHeader(k, v);
    if (req.method === "OPTIONS") {
      registro(`[cors] ${req.url} desde "${req.headers.origin || ""}": ${desdeApp ? "permitido" : "sin cabeceras CORS"} (pide ${req.headers["access-control-request-headers"] || "-"})`);
      res.writeHead(204); return res.end();
    }

    try {
      const partes = [];
      for await (const p of req) partes.push(p);
      const crudo = Buffer.concat(partes);
      const json = () => { try { return JSON.parse(crudo.toString("utf8") || "null"); } catch { return null; } };
      const ruta = req.url.split("?")[0];
      if (ruta.startsWith("/auth/v1/")) registro(`[auth] llega ${req.method} ${req.url} (Origin "${req.headers.origin || ""}")`);

      if (await atenderHello(req, res, ruta, json)) return;
      // Solo con la nube de prueba (127.0.0.1): un archivo adjunto para probar que la ventana guarda descargas
      if (ruta === "/zamorapp/descarga-prueba" && String(CONFIG.nube || "").startsWith("http://127.0.0.1:")) {
        const nombre = (new URL(req.url, "http://x").searchParams.get("nombre") || "prueba.txt").replace(/[^\w.-]/g, "_");
        registro(`[puerta] descarga de prueba: ${nombre}`);
        res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8", "Content-Disposition": `attachment; filename="${nombre}"` });
        return res.end("descarga de prueba de zamorApp\n");
      }
      const conControl = () => {
        const dada = Buffer.from(String(req.headers["x-zamorapp-control"] || ""));
        const esperada = Buffer.from(control);
        return Boolean(control) && dada.length === esperada.length && crypto.timingSafeEqual(dada, esperada);
      };
      if (ruta === "/zamorapp/estado") {
        // buscarActualizacion: la pantalla «hay una versión nueva» lo pidió; solo el programa (con su clave de
        // control) lo recibe, y una sola vez, para lanzar el actualizador.
        const buscar = pedidaActualizacion && conControl();
        if (buscar) pedidaActualizacion = false;
        return responder(res, 200, { enLinea: nube.enLinea, equipo: d().equipo ? { nombre: d().equipo.nombre } : null,
          ultimaSincronia: replica.ultima, error: replica.error, copiaCompleta: d().copiaCompleta,
          actualizar: Boolean(nube.incompatible), incompatible: nube.incompatible, buscarActualizacion: buscar });
      }
      // Botones de la pantalla «hay una versión nueva» (solo desde la ventana de zamorApp): pedir la actualización
      // al programa y abrir la web en el navegador de Windows (dentro del WebView2 un enlace externo no abre nada).
      if (ruta === "/zamorapp/buscar-actualizacion" && req.method === "POST") {
        if (!desdeApp) return responder(res, 403, { message: "No autorizado" });
        pedidaActualizacion = true;
        registro("[puerta] la pantalla pidió buscar actualización");
        return responder(res, 200, { pedida: true });
      }
      if (ruta === "/zamorapp/abrir-web" && req.method === "POST") {
        if (!desdeApp) return responder(res, 403, { message: "No autorizado" });
        registro(`[puerta] abrir la web en el navegador: ${URL_WEB}`);
        let abierto = false;
        if (process.platform === "win32") {
          try { spawn("cmd", ["/c", "start", "", URL_WEB], { detached: true, stdio: "ignore", windowsHide: true }).unref(); abierto = true; } catch (e) { registro(`[puerta] no se pudo abrir el navegador: ${e.message}`); }
        }
        return responder(res, 200, { abierto, url: URL_WEB });
      }
      if (ruta === "/zamorapp/equipo" && req.method === "POST") return await registrarEquipo(req, res, json());
      // "Sincronizar ahora" del menú: solo la ventana de zamorApp conoce la clave de control de esta sesión.
      if (ruta === "/zamorapp/sincronizar" && req.method === "POST") {
        const dada = Buffer.from(String(req.headers["x-zamorapp-control"] || ""));
        const esperada = Buffer.from(control);
        if (!control || dada.length !== esperada.length || !crypto.timingSafeEqual(dada, esperada)) return responder(res, 403, { message: "No autorizado" });
        await nube.comprobar();
        await replica.ciclo();
        return responder(res, 200, { enLinea: nube.enLinea, ultimaSincronia: replica.ultima, error: replica.error });
      }
      if (ruta === "/zamorapp/inicio") {
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Content-Security-Policy": "default-src 'self'; style-src 'unsafe-inline'; script-src 'unsafe-inline'" });
        return res.end(PAGINA_INICIO.replace("__ORIGEN__", origen));
      }

      if (ruta === "/auth/v1/token") {
        const tipo = new URL(req.url, "http://x").searchParams.get("grant_type");
        if (tipo === "password") return await entrar(req, res, json());
        if (tipo === "refresh_token") return renovar(res, json());
        return errorAuth(res, 400, "Tipo de ingreso no disponible en la PC", "unsupported_grant_type");
      }
      if (ruta === "/auth/v1/user" && req.method === "GET") {
        const quien = usuarioDe(req);
        return quien ? responder(res, 200, quien.u.user) : errorAuth(res, 401, "Sesión no válida", "bad_jwt");
      }
      const factores = /^\/auth\/v1\/factors(?:\/([\w-]+)(?:\/(challenge|verify))?)?$/.exec(ruta);
      if (factores) return await dosPasos(req, res, factores[1], factores[2], json());
      if (ruta === "/auth/v1/logout") {
        const quien = usuarioDe(req);
        if (quien) for (const [t, r] of Object.entries(d().refrescos)) if (r.uid === quien.uid) delete d().refrescos[t];
        estado.guardar();
        res.writeHead(204); return res.end();
      }
      if (ruta === "/auth/v1/user" && req.method === "PUT") { // cambio de clave: solo con internet
        const quien = usuarioDe(req);
        if (!quien) return errorAuth(res, 401, "Sesión no válida", "bad_jwt");
        if (!nube.enLinea) return errorAuth(res, 503, "Cambiar la clave requiere internet", "offline");
        const token = await nube.token(quien.uid);
        const r = await nube.auth("user", json(), token);
        if (r.ok && json()?.password) { Object.assign(quien.u, huellaClave(json().password)); estado.guardar(); }
        return responder(res, r.status, r.cuerpo ?? r.texto);
      }
      if (ruta.startsWith("/auth/v1/")) { // recuperar clave y demás: solo con internet
        if (!nube.enLinea) await nube.comprobar();
        if (ruta === "/auth/v1/recover" || ruta === "/auth/v1/signup" || ruta === "/auth/v1/resend") {
          const u = new URL(req.url, "http://x");
          const destino = u.searchParams.get("redirect_to");
          if (destino) u.searchParams.set("redirect_to", WEB + new URL(destino, WEB).pathname);
          req.url = u.pathname + u.search;
        }
        const listo = nube.enLinea && await aLaNube(req, res, crudo, null);
        registro(`[auth] ${ruta}: ${listo ? res.statusCode : "sin internet"}`);
        if (listo) return;
        return errorAuth(res, 503, "Esta acción requiere internet", "offline");
      }

      if (ruta.startsWith("/rest/v1/") || ruta.startsWith("/storage/v1/")) {
        const quien = usuarioDe(req);
        if (!quien) return responder(res, 401, { code: "PGRST301", message: "Sesión vencida o no válida" });
        if (nube.enLinea && await aLaNube(req, res, crudo, quien.uid)) return;
        if (ruta.startsWith("/storage/v1/")) return responder(res, 503, { statusCode: "503", error: "offline", message: "Los archivos adjuntos requieren internet" });
        if (!soloLectura(req)) return responder(res, 503, { code: "OFFLINE", message: SIN_CONEXION, details: null, hint: null });
        return await aLaCopia(req, res, crudo);
      }
      return responder(res, 404, { message: "No encontrado" });
    } catch (e) {
      registro(`[puerta] ${req.method} ${req.url}: ${e.stack || e.message}`);
      if (!res.headersSent) responder(res, 500, { message: "Error interno de la puerta local" });
    }
  });
  return servidor;
}
