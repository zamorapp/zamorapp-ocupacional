// Puerta local: la app de escritorio le habla como si fuera Supabase (auth, rest, storage).
// Con internet desvía todo a la nube con el token de la nube del usuario; sin internet atiende
// desde la copia local, por ahora solo para consultar (fase F1).
import { spawn } from "node:child_process";
import crypto from "node:crypto";
import http from "node:http";
import pg from "pg";
import { CATALOGOS, CONFIG, RPC_ESCRITURA_LOCAL, RPC_LECTURA } from "./config.mjs";
import { claveCorrecta, huellaClave } from "./estado.mjs";
import { firmar, tokenDeCabecera, verificar } from "./jwt.mjs";
import { PAGINA_INICIO } from "./inicio.mjs";
import { crearAdjuntos } from "./adjuntos.mjs";
import { crearHello } from "./hello.mjs";
import { MENSAJE_ACTUALIZAR } from "./nube.mjs";

const PASAR = ["content-type", "accept", "prefer", "range", "accept-profile", "content-profile", "x-client-info", "x-upsert", "cache-control", "x-supabase-api-version"];
// Los enlaces de los correos (recuperar clave, confirmar) abren la app web: la PC no recibe visitas de afuera.
const WEB = "https://zamorapp-ocupacional.vercel.app";
const DEVOLVER = ["content-type", "content-range", "preference-applied", "location", "cache-control", "etag", "last-modified"];
const FALLOS_PERMITIDOS = 5; // por correo; luego espera de 15 min que se duplica hasta 1 hora
const FALLOS_GLOBALES = 30; // entre todos los correos, por cada 10 minutos
const SIN_CONEXION = "Sin conexión a internet: en esta PC por ahora solo se puede consultar. Podrás guardar cuando vuelva la conexión.";
const LENTA_MS = 700; // una petición a la nube que tarda más se anota en puerta.log ([lenta])
// En puerta.log no queda el nombre de un archivo (puede llevar el nombre del paciente): de storage solo el bucket
const rutaParaRegistro = (url) => {
  const ruta = url.split("?")[0];
  const m = /^(\/storage\/v1\/object\/(?:(?:public|sign|authenticated|info|upload\/sign)\/)?[^/]+)\//.exec(ruta);
  return m ? `${m[1]}/…` : ruta;
};
// Roles con verificación en dos pasos obligatoria (como public.requiere_dos_pasos en la nube)
const CON_DOS_PASOS = ["administrador", "gerente_medico"];
const ROLES_RESPALDO = ["administrador", "gerente_medico", "medico", "enfermeria"]; // ven el estado del respaldo
// "aal" de una sesión de la nube (Supabase la pone siempre; el simulador de pruebas no)
const aalDe = (token) => { try { return JSON.parse(Buffer.from(String(token).split(".")[1], "base64url")).aal; } catch { return undefined; } };

const URL_WEB = "https://zamorapp-ocupacional.vercel.app";

export function crearPuerta({ estado, nube, motor, replica, bandeja = null, cola = null, bloques = null, respaldo = null, origen, control = "", registro = () => {} }) {
  let pedidaActualizacion = false;
  const d = () => estado.d;
  // C11: con internet, las lecturas salen de la copia local si está al día. Una escritura que se mandó a la
  // nube obliga a leer de la nube hasta que la sincronía siguiente (que empieza después de esa escritura) baje
  // el cambio: así el médico siempre ve lo que acaba de guardar.
  let ultimaEscritura = 0;
  let modoLectura = "nube";
  // Todo con performance.now(): nunca con la fecha de la PC (Cesar la atrasa para abrir el SAME)
  const copiaAlDia = () => Boolean(
    CONFIG.lecturaLocal && d().copiaCompleta && replica.ultimaMs !== null && !replica.error
      && performance.now() - replica.ultimaMs < CONFIG.frescuraLectura
      && replica.inicioCiclo > ultimaEscritura,
  );
  // El segundo paso lo decide la nube: estas funciones siempre van a ella, y una sesión aal1 de quien lo necesita no
  // lee la copia (con internet va a la nube, que responde 403 «dos_pasos»; sin internet se rechaza igual, Hello da aal2)
  // (miembros_con_correo lee correos de auth.users, que la copia no trae: con internet siempre va a la nube)
  const SIEMPRE_NUBE = ["/rest/v1/rpc/requiere_dos_pasos", "/rest/v1/rpc/falta_segundo_paso", "/rest/v1/rpc/miembros_con_correo"];
  const faltaSegundoPaso = (quien) => exigeDosPasos(quien.u) && quien.aal === "aal1";
  // Qué hay en la copia: las tablas que sincronizan y los catálogos, más las vistas que solo usan esas tablas.
  // Una lectura que toque algo que la copia no trae (p. ej. accesos) va a la nube: así ninguna pantalla sale vacía
  // por leer en local (hallazgo de Reportes: medicos_historicos, informes_vigilancia, envíos).
  let enCopia = { nombres: new Set(), en: -1e9 }; // caché de 5 min con performance.now() (la fecha de Windows no es fiable)
  async function nombresEnCopia() {
    if (performance.now() - enCopia.en < 300e3) return enCopia.nombres;
    const c = new pg.Client({ connectionString: motor.url() });
    try {
      await c.connect();
      const { rows } = await c.query(`
        with recursive base as (
          select nombre from sync.tablas union select unnest($1::text[])
        ), vistas as (
          select v.view_schema || '.' || v.view_name as vista, bool_and(t.nombre is not null) as completa
            from information_schema.view_table_usage v
            left join base t on t.nombre = v.table_schema || '.' || v.table_name
           where v.view_schema in ('public', 'clinico') group by 1
        )
        select nombre from base union select vista from vistas where completa`, [CATALOGOS]);
      enCopia = { nombres: new Set(rows.map((f) => f.nombre)), en: performance.now() };
    } catch (e) {
      registro(`[puerta] no se pudo leer qué tablas trae la copia: ${e.message}`);
      enCopia.en = performance.now() - 240e3;
    } finally { await c.end().catch(() => {}); }
    return enCopia.nombres;
  }
  // true si la tabla o vista pedida y todo lo embebido en select= están en la copia (las funciones se confían)
  async function lecturaEnCopia(req) {
    const u = new URL(req.url, "http://x");
    const m = /^\/rest\/v1\/(rpc\/)?([a-z_0-9]+)/.exec(u.pathname);
    if (!m || m[1]) return true;
    const perfil = String(req.headers["accept-profile"] || "public");
    const nombres = await nombresEnCopia();
    if (!nombres.has(`${perfil}.${m[2]}`)) return false;
    // select=a,empresa:empresas(nombre),consultas!inner(...) → empresas, consultas
    // select=a,empresa:empresas(nombre),...consultas(*),citas!inner(id) → empresas, consultas, citas
    for (const e of (u.searchParams.get("select") || "").matchAll(/(?:^|[,(])\s*(?:\.\.\.)?(?:[a-z_0-9]+:)?([a-z_0-9]+)(?:!inner|!left|![a-z_0-9]+)?\s*\(/g)) {
      if (!nombres.has(`${perfil}.${e[1]}`)) return false;
    }
    return true;
  }
  const anotarModo = (modo, motivo) => {
    if (modo === modoLectura) return;
    modoLectura = modo;
    registro(`[puerta] lecturas desde ${modo === "local" ? "la copia local" : "la nube"} (${motivo})`);
  };
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
  // Plazo sin conexión con la hora anclada (nube.reloj), nunca con la fecha de Windows; también vence por
  // demasiados arranques seguidos sin internet (sin ancla, una fecha detenida no cuenta los días)
  const sinConexionVencida = (u) => nube.reloj.sinConexionVencida(u?.ultimoOnline, CONFIG.diasSinConexion, CONFIG.arranquesSinConexion);
  // sid: la sesión de esta ventana. Se conserva al renovar (como en Supabase) para que «Salir» cierre solo esta.
  const sesionLocal = (uid, segundoPaso = false, sid = crypto.randomUUID()) => {
    const u = d().usuarios[uid];
    const ahora = nube.reloj.segundos(); // hora anclada: con la fecha de Windows atrasada el token igual vence
    const exp = ahora + CONFIG.sesionSegundos;
    const aal = exigeDosPasos(u) ? (segundoPaso ? "aal2" : "aal1") : undefined;
    const access_token = firmar({ sub: uid, role: "authenticated", aud: "authenticated", email: u.email, iat: ahora, exp, session_id: sid, ...(aal ? { aal } : {}) }, d().jwtSecreto);
    const refresh_token = crypto.randomBytes(24).toString("base64url");
    for (const [t, r] of Object.entries(d().refrescos)) if (r.vence < nube.reloj.ahora()) delete d().refrescos[t];
    d().refrescos[refresh_token] = { uid, vence: nube.reloj.ahora() + 30 * 864e5, segundoPaso, sid };
    estado.guardar();
    return { access_token, token_type: "bearer", expires_in: CONFIG.sesionSegundos, expires_at: exp, refresh_token, user: u.user };
  };

  const usuarioDe = (req) => {
    const datos = verificar(tokenDeCabecera(req.headers.authorization), d().jwtSecreto, nube.reloj.ahora());
    const u = datos && d().usuarios[datos.sub];
    return u && !u.bloqueado && !u.requiereNube ? { uid: datos.sub, u, aal: datos.aal } : null;
  };

  // Freno a quien prueba claves: por correo y en total. Vive en memoria (la puerta solo atiende a esta PC).
  // Con performance.now(): mover la fecha de Windows no levanta el freno.
  const intentos = new Map();
  const esperaDe = (clave) => Math.max(0, (intentos.get(clave)?.hasta || 0) - performance.now());
  const anotarFallo = (email) => {
    const f = intentos.get(email) || { fallos: 0, hasta: 0 };
    f.fallos += 1;
    if (f.fallos >= FALLOS_PERMITIDOS) f.hasta = performance.now() + Math.min(3600e3, 900e3 * 2 ** (f.fallos - FALLOS_PERMITIDOS));
    intentos.set(email, f);
    const g = intentos.get("*") || { fallos: 0, desde: performance.now(), hasta: 0 };
    if (performance.now() - g.desde > 600e3) Object.assign(g, { fallos: 0, desde: performance.now() });
    g.fallos += 1;
    if (g.fallos >= FALLOS_GLOBALES) g.hasta = performance.now() + 600e3;
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

  // Usuario corto («cesar») → correo de la cuenta. Con internet lo resuelve la nube solo si la clave es correcta
  // (correo_para_ingreso); sin internet, el que esta PC recuerda de la última vez que se entró con internet.
  async function correoDeUsuario(usuario, clave) {
    if (!nube.enLinea) await nube.comprobar();
    if (nube.enLinea) {
      try {
        const r = await nube.rpcAnonimo("correo_para_ingreso", { p_usuario: usuario, p_clave: clave });
        registro(`[auth] usuario corto en línea: ${r.status}${r.ok && !r.cuerpo ? " sin coincidencia" : ""}`);
        if (r.ok) return r.cuerpo ? { email: String(r.cuerpo).toLowerCase() } : { fallo: [400, "Usuario o clave incorrectos"] };
        if (r.cuerpo?.code === "P0429") return { fallo: [429, `Demasiados intentos. Espera ${Number(r.cuerpo.hint) || 15} min y vuelve a probar (o entra con tu correo).`, "over_request_rate_limit"] };
        if (r.status < 500) return { fallo: [400, "Usuario o clave incorrectos"] };
        return { fallo: [503, "El servicio no respondió. Vuelve a intentar en un momento o entra con tu correo.", "unexpected_failure"] };
      } catch (e) { nube.marcarCaida(`al buscar el usuario: ${e.message}`); }
    }
    const local = Object.values(d().usuarios).find((u) => u.usuario === usuario);
    return { email: local?.email || usuario };
  }

  // El usuario corto que esta PC recuerda (para entrar con él sin internet); uno solo por usuario
  async function recordarUsuarioCorto(uid, escrito) {
    let usuario = escrito.includes("@") ? undefined : escrito;
    if (usuario === undefined) { try { usuario = (await nube.rpc(uid, "mi_usuario_ingreso", {})) || null; } catch { return; } }
    for (const [otro, u] of Object.entries(d().usuarios)) if (otro !== uid && usuario && u.usuario === usuario) delete u.usuario;
    if (usuario) d().usuarios[uid].usuario = usuario; else delete d().usuarios[uid].usuario;
    estado.guardar();
  }

  async function entrar(req, res, cuerpo) {
    const escrito = String(cuerpo?.email || "").trim().toLowerCase();
    const clave = String(cuerpo?.password || "");
    const espera = Math.max(esperaDe(escrito), esperaDe("*"));
    if (espera) registro("[auth] entrar: en espera por demasiados intentos");
    if (espera) return errorAuth(res, 429, `Demasiados intentos. Espera ${Math.ceil(espera / 60000)} min y vuelve a probar.`, "over_request_rate_limit");
    let email = escrito;
    if (escrito && !escrito.includes("@")) {
      const r = await correoDeUsuario(escrito, clave);
      if (r.fallo) {
        if (r.fallo[0] === 400) anotarFallo(escrito);
        return errorAuth(res, ...r.fallo);
      }
      email = r.email;
    }
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
        intentos.delete(escrito);
        estado.guardar();
        await anotarUsuarioLocal(uid, email);
        await recordarUsuarioCorto(uid, escrito);
        replica.ciclo().catch(() => {});
        return responder(res, 200, sesionLocal(uid));
      } catch (e) {
        nube.marcarCaida(`al entrar: ${e.message}`);
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
      return errorAuth(res, 400, "Usuario, correo o clave incorrectos");
    }
    registro(`[auth] entrar sin conexión: ${u.bloqueado ? "bloqueado" : u.requiereNube ? "requiere internet" : "ok"}`);
    intentos.delete(email);
    intentos.delete(escrito);
    if (u.bloqueado) return errorAuth(res, 400, "Tu acceso en esta PC fue desactivado. Habla con el administrador.", "user_banned");
    if (u.requiereNube) return errorAuth(res, 400, "Tu sesión fue cerrada desde la nube (por ejemplo, cambiaste la clave). Conecta la PC a internet para entrar.", "session_expired");
    if (sinConexionVencida(u)) {
      return errorAuth(res, 400, `Pasaron más de ${CONFIG.diasSinConexion} días sin conexión. Conecta la PC a internet para entrar.`, "session_expired");
    }
    return responder(res, 200, sesionLocal(uid));
  }

  // Un refresco ya usado vale 30 s más y entrega la misma sesión nueva (como el margen de reutilización de Supabase):
  // el servidor de la app y la ventana renuevan a la vez al abrir, y sin margen el segundo fallaba y cerraba la
  // sesión (29-oct: Cesar tuvo que volver a escribir la clave al abrir). Vive solo en memoria.
  const recienUsados = new Map();
  function renovar(res, cuerpo) {
    const token = cuerpo?.refresh_token;
    const reciente = token && recienUsados.get(token);
    const ur = reciente && d().usuarios[reciente.uid];
    if (reciente && reciente.hasta > performance.now() && d().refrescos[reciente.sesion.refresh_token] && ur && !ur.bloqueado && !ur.requiereNube) {
      registro("[auth] renovar: ok (refresco recién usado, misma sesión)");
      return responder(res, 200, reciente.sesion);
    }
    const r = d().refrescos[token];
    const u = r && d().usuarios[r.uid];
    if (!r || r.vence < nube.reloj.ahora() || !u || u.bloqueado || u.requiereNube) {
      registro(`[auth] renovar: 400 (${!r ? "refresco desconocido o cerrado" : r.vence < nube.reloj.ahora() ? "vencido" : !u ? "usuario no está en la PC" : u.bloqueado ? "bloqueado" : "requiere internet"})`);
      return errorAuth(res, 400, "La sesión venció. Vuelve a entrar.", "refresh_token_not_found");
    }
    if (!nube.enLinea && sinConexionVencida(u)) {
      delete d().refrescos[token];
      registro(`[auth] renovar: 400 (más de ${CONFIG.diasSinConexion} días sin conexión)`);
      return errorAuth(res, 400, `Pasaron más de ${CONFIG.diasSinConexion} días sin conexión. Conecta la PC a internet para entrar.`, "session_expired");
    }
    delete d().refrescos[token];
    const sesion = sesionLocal(r.uid, r.segundoPaso, r.sid);
    for (const [t, x] of recienUsados) if (x.hasta < performance.now()) recienUsados.delete(t);
    recienUsados.set(token, { uid: r.uid, sesion, hasta: performance.now() + CONFIG.reusoRefrescoMs });
    registro("[auth] renovar: ok");
    return responder(res, 200, sesion);
  }

  // Reenvía la petición a la nube con el token de la nube de ese usuario. Devuelve false si la nube no responde.
  async function aLaNube(req, res, cuerpo, uid) {
    let token = null;
    try {
      token = uid ? await nube.token(uid) : null;
    } catch (e) {
      nube.marcarCaida(`al renovar la sesión: ${e.message}`);
      return false;
    }
    if (uid && !token) {
      registro(`[puerta] ${req.method} ${req.url.split("?")[0]}: hay internet pero este usuario no tiene sesión en la nube (entró sin conexión o la nube la cerró); se atiende desde la copia`);
      return false;
    }
    const cab = { apikey: CONFIG.nubeAnon, ...(token ? { Authorization: `Bearer ${token}` } : {}) };
    for (const h of PASAR) if (req.headers[h]) cab[h] = req.headers[h];
    const inicio = Date.now();
    try {
      const r = await fetch(`${CONFIG.nube}${req.url}`, {
        method: req.method, headers: cab, body: ["GET", "HEAD"].includes(req.method) ? undefined : cuerpo, signal: AbortSignal.timeout(60000),
      });
      nube.reloj.anclar(r.headers.get("date"));
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
      // Lo que tarda la nube queda en puerta.log: así se mide en la PC real por qué una pantalla demora
      const ms = Date.now() - inicio;
      if (ms >= LENTA_MS) registro(`[lenta] ${req.method} ${rutaParaRegistro(req.url)} ${ms} ms (nube, ${r.status})`);
      return true;
    } catch (e) {
      nube.marcarCaida(`${req.method} ${req.url.split("?")[0]}: ${e.message}`);
      return false;
    }
  }

  async function aLaCopia(req, res, cuerpo) {
    // Solo pasan las cabeceras de PASAR: una X-Zamorapp-Ahora que mande el navegador se descarta y va la de la puerta
    // X-Zamorapp-Ahora va SOLO con hora anclada a la nube; sin ancla (PC reiniciada sin internet) no va, y la base
    // local lo nota (ahora_de_la_puerta() es null: firmar espera a internet). Nunca la fecha de Windows.
    const cab = { Authorization: req.headers.authorization, ...(nube.reloj.verificada ? { "X-Zamorapp-Ahora": nube.reloj.iso() } : {}) };
    for (const h of PASAR) if (req.headers[h]) cab[h] = req.headers[h];
    const r = await fetch(`http://127.0.0.1:${motor.puertoPostgrest}${req.url.replace(/^\/rest\/v1/, "")}`, {
      method: req.method, headers: cab, body: ["GET", "HEAD"].includes(req.method) ? undefined : cuerpo,
    });
    const salida = {};
    for (const h of DEVOLVER) if (r.headers.get(h)) salida[h] = r.headers.get(h);
    res.writeHead(r.status, salida);
    res.end(Buffer.from(await r.arrayBuffer()));
  }

  // Funciones que solo leen: las que la base declara stable o immutable (PostgreSQL no les deja escribir),
  // leídas de la copia local, más la lista fija. Así una función de lectura nueva funciona sin conexión sin
  // tener que acordarse de anotarla aquí (la 0.1.168 no abría sin conexión por trabajadores_por_empresa).
  let lectura = { nombres: new Set(RPC_LECTURA), en: -1e9 };
  async function funcionesDeLectura() {
    if (performance.now() - lectura.en < 300e3) return lectura.nombres;
    const c = new pg.Client({ connectionString: motor.url() });
    try {
      await c.connect();
      const { rows } = await c.query("select distinct p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.provolatile in ('s', 'i')");
      lectura = { nombres: new Set([...RPC_LECTURA, ...rows.map((f) => f.proname)]), en: performance.now() };
    } catch (e) {
      registro(`[puerta] no se pudo leer qué funciones son de lectura: ${e.message}`);
      lectura.en = performance.now() - 240e3; // se reintenta en un minuto
    } finally { await c.end().catch(() => {}); }
    return lectura.nombres;
  }

  // Fase A (local primero): tablas que se escriben en la PC (sync.tablas.subible, leídas de la copia) y funciones
  // de escritura que solo las tocan. Con la copia completa, esas escrituras van a la base local y suben por la bandeja.
  let subibles = { nombres: new Map(), en: -1e9 }; // performance.now(): la fecha de Windows cambia (SAME)
  async function tablasSubibles() {
    if (performance.now() - subibles.en < 300e3) return subibles.nombres;
    const c = new pg.Client({ connectionString: motor.url() });
    try {
      await c.connect();
      // Tablas que suben y las vistas (consultas, adjuntos, historia_laboral…) que la app usa sobre UNA de ellas: nombre → tabla base
      const { rows } = await c.query(`
        select nombre, nombre as base from sync.tablas where subible
        union all
        select v.view_schema || '.' || v.view_name, min(v.table_schema || '.' || v.table_name)
          from information_schema.view_table_usage v
         where v.view_schema in ('public', 'clinico')
         group by 1 having count(*) = 1 and bool_and(v.table_schema || '.' || v.table_name in (select nombre from sync.tablas where subible))`);
      subibles = { nombres: new Map(rows.map((f) => [f.nombre, f.base])), en: performance.now() };
    } catch (e) {
      registro(`[puerta] no se pudo leer qué tablas sincronizan: ${e.message}`);
      subibles.en = performance.now() - 240e3;
    } finally { await c.end().catch(() => {}); }
    return subibles.nombres;
  }
  let horaAnclada = { valor: false, en: -1e9 };
  async function horaAncladaEnBase() {
    if (horaAnclada.valor || performance.now() - horaAnclada.en < 300e3) return horaAnclada.valor;
    const c = new pg.Client({ connectionString: motor.url() });
    try {
      await c.connect();
      const { rows: [f] } = await c.query("select to_regproc('public.ahora_de_la_puerta') is not null as hay");
      horaAnclada = { valor: Boolean(f?.hay), en: performance.now() };
    } catch { horaAnclada.en = performance.now(); } finally { await c.end().catch(() => {}); }
    return horaAnclada.valor;
  }
  const escrituraLocal = async (req) => {
    if (!CONFIG.escrituraLocal || !bandeja || !d().copiaCompleta || !["POST", "PATCH", "PUT", "DELETE"].includes(req.method)) return false;
    const m = /^\/rest\/v1\/(rpc\/)?([a-z_0-9]+)/.exec(req.url);
    if (!m) return false;
    if (m[1]) {
      if (!RPC_ESCRITURA_LOCAL.has(m[2])) return false;
      // Firmar fija la hora legal: solo en la PC cuando la base local ya usa la hora anclada que manda la puerta
      // (migración hora-anclada: public.ahora_de_la_puerta). Hasta entonces va a la nube (Analizar, 29-oct-2026).
      if (m[2] === "firmar_consulta" && !(await horaAncladaEnBase())) return false;
      return true;
    }
    const perfil = String(req.headers["content-profile"] || req.headers["accept-profile"] || "public");
    const base = (await tablasSubibles()).get(`${perfil}.${m[2]}`);
    if (!base) return false;
    if (req.method === "DELETE" && base.startsWith("clinico.")) return false; // nada clínico se borra desde la PC: va a la nube como hasta ahora
    // Alta de un paciente: solo en la PC si tiene números de historia reservados por la nube (fase B, bloques por
    // equipo); si no, va a la nube como antes (y sin internet se avisa)
    if (req.method === "POST" && base === "public.trabajadores") return Boolean(bloques) && (await bloques.libres()) > 0;
    return true;
  };

  const soloLectura = async (req) => {
    if (["GET", "HEAD"].includes(req.method)) return true;
    const m = /^\/rest\/v1\/rpc\/([a-z_0-9]+)/.exec(req.url);
    if (!m) return false;
    if ((await funcionesDeLectura()).has(m[1])) return true;
    // Una función nueva (migración recién aplicada) no espera 5 min: se vuelve a mirar el catálogo, como mucho cada 2 s
    if (performance.now() - lectura.en < 2e3) return false;
    lectura.en = -1e9;
    return (await funcionesDeLectura()).has(m[1]);
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
  // Adjuntos en la PC (fase B): carpeta local + cola de subida; ver adjuntos.mjs
  // escrituraLocal: con la copia completa y la fase A activa, un archivo nuevo se guarda en la PC también sin internet
  // (su fila va a la bandeja y el archivo a la cola). Hallazgo de la prueba integrada «un día de Cesar»: #123 no lo pasaba.
  const adjuntos = crearAdjuntos({ estado, nube, motor, registro, escrituraLocal: () => Boolean(CONFIG.escrituraLocal && bandeja && estado.d.copiaCompleta) });

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
          ultimaSincronia: replica.ultima, error: replica.error, copiaCompleta: d().copiaCompleta, lecturaLocal: copiaAlDia(),
          bandeja: bandeja ? { ...(await bandeja.resumen()), error: bandeja.ultimoError } : null,
          hora: nube.reloj.iso(), horaSinAncla: !nube.reloj.verificada, arranquesSinNube: nube.reloj.arranquesSinNube(),
          numerosLibres: bloques ? await bloques.libres() : null,
          respaldo: respaldo ? respaldo.estadoActual() : null,
          adjuntos: await adjuntos.contar(),
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
        // Desde el menú del programa (clave de control) o desde el botón «Sincronizar ahora» de la ventana de zamorApp
        // o desde la ventana de zamorApp con la sesión del usuario (Bearer): sube y baja como siempre
        if (!conControl() && !(desdeApp && usuarioDe(req))) return responder(res, 403, { message: "No autorizado" });
        await nube.comprobar();
        if (bandeja) await bandeja.subir();
        await replica.ciclo();
        await adjuntos.subir().catch((e) => registro(`[adjuntos] ${e.message}`));
        // Orden: comprobar → bandeja.subir() → replica.ciclo() → adjuntos → cola.barrer()
        if (cola) await cola.barrer();
        if (bloques) await bloques.reponer();
        return responder(res, 200, { enLinea: nube.enLinea, ultimaSincronia: replica.ultima, error: replica.error, adjuntos: await adjuntos.contar(),
          bandeja: bandeja ? { ...(await bandeja.resumen()), error: bandeja.ultimoError } : null });
      }
      // Fase C: «Respaldar ahora» (sincroniza y guarda la copia), estado del respaldo, configuración y restauración
      if (ruta === "/zamorapp/respaldo" && req.method === "GET") {
        if (!respaldo) return responder(res, 200, null);
        const quien = usuarioDe(req);
        if (!quien && !conControl()) return errorAuth(res, 401, "Sesión no válida", "bad_jwt");
        // Solo el personal de salud y el administrador (Analizar): la lista de copias dice dónde está la base clínica
        if (quien && !ROLES_RESPALDO.includes(quien.u.rol)) return responder(res, 403, { message: "Solo el personal de salud y el administrador" });
        return responder(res, 200, { ...respaldo.estadoActual(), copias: respaldo.copias(), sugeridas: respaldo.carpetasSugeridas() });
      }
      if (ruta === "/zamorapp/respaldar" && req.method === "POST") {
        if (!respaldo) return responder(res, 503, { message: "Respaldo no disponible" });
        if (!conControl() && !(desdeApp && usuarioDe(req))) return responder(res, 403, { message: "No autorizado" });
        const r = await respaldo.hacer({ sincronizar: true });
        return responder(res, r.ok ? 200 : 500, r);
      }
      if ((ruta === "/zamorapp/respaldo/configurar" || ruta === "/zamorapp/restaurar" || ruta === "/zamorapp/restaurar/cancelar") && req.method === "POST") {
        if (!respaldo) return responder(res, 503, { message: "Respaldo no disponible" });
        const quien = usuarioDe(req);
        if (!quien || !["administrador", "gerente_medico"].includes(quien.u.rol)) return responder(res, 403, { message: "Solo un administrador o el gerente médico" });
        if (faltaSegundoPaso(quien)) return responder(res, 403, { code: "dos_pasos", message: "Falta la verificación en dos pasos." });
        const b = json() || {};
        try {
          if (ruta === "/zamorapp/restaurar/cancelar") return responder(res, 200, respaldo.cancelarRestauracion());
          if (ruta === "/zamorapp/restaurar") return responder(res, 200, await respaldo.prepararRestauracion(b.archivo, b.clave));
          return responder(res, 200, respaldo.configurar({ carpeta: b.carpeta, clave: b.clave, confirmacion: b.confirmacion }));
        } catch (e) { return responder(res, 400, { message: e.message }); }
      }
      // Lista «Conflictos/Rechazados» de la bandeja y la decisión de quien la revisa (descartar o reintentar)
      if (ruta === "/zamorapp/bandeja" && req.method === "GET") {
        if (!bandeja) return responder(res, 200, { pendientes: 0, revisar: [] });
        if (!usuarioDe(req)) return errorAuth(res, 401, "Sesión no válida", "bad_jwt");
        return responder(res, 200, await bandeja.lista());
      }
      if (ruta === "/zamorapp/bandeja/resolver" && req.method === "POST") {
        const quien = usuarioDe(req);
        if (!quien) return errorAuth(res, 401, "Sesión no válida", "bad_jwt");
        if (!bandeja) return responder(res, 400, { message: "Sin bandeja" });
        const b = json();
        const r = await bandeja.resolver(String(b?.id || ""), String(b?.accion || ""), { uid: quien.uid, rol: quien.u.rol });
        if (r.error) return responder(res, 400, { message: r.error });
        if (r.hecho === "pendiente" && nube.enLinea) bandeja.subir().catch(() => {});
        return responder(res, 200, r);
      }
      // Cola de envíos: la app (Next en esta PC) pide que la web envíe ya los correos que acaba de dejar en cola
      if (ruta === "/zamorapp/enviar-cola" && req.method === "POST") {
        const quien = usuarioDe(req);
        if (!quien) return responder(res, 401, { message: "Sesión vencida o no válida" });
        if (!cola) return responder(res, 503, { message: "Cola de envíos no disponible" });
        // La fila se guardó en la PC: primero sube la bandeja, así la web ya la encuentra
        if (bandeja && await nube.confirmar()) await bandeja.subir().catch(() => {});
        return responder(res, 200, await cola.despachar(quien.uid, json()?.ids));
      }
      // Subir ya lo guardado en la PC, para lo que la nube necesita en el acto (p. ej. el enlace de WhatsApp apunta a
      // un envío que debe existir allá). Sin internet responde 503 «requiere internet»; devuelve las filas que aún esperan.
      if (ruta === "/zamorapp/subir-ahora" && req.method === "POST") {
        const quien = usuarioDe(req);
        if (!quien) return responder(res, 401, { message: "Sesión vencida o no válida" });
        if (!(await nube.confirmar())) return responder(res, 503, { code: "offline", message: "Requiere internet" });
        const filas = (Array.isArray(json()?.filas) ? json().filas : []).map(String).filter((x) => /^[0-9a-f-]{36}$/i.test(x)).slice(0, 50);
        // Dos vueltas: si ya había una subida en curso (empezó antes de esta fila), la segunda la incluye
        let esperando = [];
        for (let i = 0; i < 2 && bandeja; i++) {
          await bandeja.subir().catch(() => {});
          esperando = await bandeja.esperando(filas);
          if (!esperando.length) break;
        }
        return responder(res, 200, { esperando });
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
        // scope como en Supabase: local (solo esta sesión), others (las demás) o global (todas, el valor por omisión).
        // Las sesiones viejas sin sid se cierran también con local: no se sabe de qué ventana son.
        const quien = usuarioDe(req);
        const scope = new URL(req.url, "http://x").searchParams.get("scope") || "global";
        const sid = quien && verificar(tokenDeCabecera(req.headers.authorization), d().jwtSecreto)?.session_id;
        let cerradas = 0;
        if (quien) for (const [t, r] of Object.entries(d().refrescos)) {
          if (r.uid !== quien.uid) continue;
          const esta = !r.sid || r.sid === sid;
          if (scope === "global" || (scope === "local" && esta) || (scope === "others" && !esta)) { delete d().refrescos[t]; cerradas += 1; }
        }
        for (const [t, x] of recienUsados) if (!d().refrescos[x.sesion.refresh_token]) recienUsados.delete(t);
        registro(`[auth] salir (${scope}): ${cerradas} sesión(es) cerrada(s) en esta PC`);
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

      // URL firmada por esta PC (la piden <img> e <iframe>, sin sesión): la firma dice qué archivo y de quién
      if (req.method === "GET" && ruta.startsWith("/storage/v1/object/sign/") && await adjuntos.servirFirmado(req, res, ruta)) return;

      if (ruta.startsWith("/rest/v1/") || ruta.startsWith("/storage/v1/")) {
        const quien = usuarioDe(req);
        if (!quien) return responder(res, 401, { code: "PGRST301", message: "Sesión vencida o no válida" });
        const lectura = ruta.startsWith("/rest/v1/") && await soloLectura(req);
        if (ruta.startsWith("/storage/v1/") && !faltaSegundoPaso(quien) && await adjuntos.atender(req, res, ruta, crudo, quien, responder)) return;
        // Guardar en la PC: la base local responde al instante (con o sin internet) y la bandeja sube el cambio
        if (!lectura && await escrituraLocal(req)) {
          // Guardar en la PC exige el segundo paso igual que la nube (aplicar_cambios lo vuelve a exigir al subir)
          if (faltaSegundoPaso(quien)) return responder(res, 403, { code: "dos_pasos", message: "Falta la verificación en dos pasos: entra con Windows Hello o escribe el código de 6 dígitos.", details: null, hint: null });
          await aLaCopia(req, res, crudo);
          if (res.statusCode < 400 && nube.enLinea) bandeja.subir().catch(() => {});
          return;
        }
        const enLinea = await nube.confirmar();
        if (enLinea && lectura && !faltaSegundoPaso(quien) && !SIEMPRE_NUBE.includes(ruta) && copiaAlDia() && await lecturaEnCopia(req)) {
          anotarModo("local", `copia sincronizada hace ${Math.round((performance.now() - replica.ultimaMs) / 1000)} s`);
          return await aLaCopia(req, res, crudo);
        }
        if (enLinea && lectura) anotarModo("nube", ultimaEscritura > replica.inicioCiclo ? "hay una escritura que aún no bajó" : !d().copiaCompleta ? "la copia no está completa" : replica.error ? `la sincronía falló: ${replica.error}` : "la copia no está al día");
        if (enLinea && await aLaNube(req, res, crudo, quien.uid)) {
          if (ruta.startsWith("/rest/v1/") && !lectura) {
            ultimaEscritura = performance.now();
            replica.ciclo().catch(() => {}); // que lo guardado baje a la copia cuanto antes
          }
          await adjuntos.alBorrar(req, crudo, res.statusCode);
          return;
        }
        if (ruta.startsWith("/storage/v1/")) return responder(res, 503, { statusCode: "503", error: "offline", message: "Los archivos adjuntos requieren internet" });
        if (!await soloLectura(req)) {
          registro(`[puerta] sin conexión: no se guarda ${req.method} ${ruta}`);
          return responder(res, 503, { code: "OFFLINE", message: SIN_CONEXION, details: null, hint: null });
        }
        if (faltaSegundoPaso(quien)) return responder(res, 403, { code: "dos_pasos", message: "Falta la verificación en dos pasos: entra con Windows Hello o escribe el código de 6 dígitos.", details: null, hint: null });
        return await aLaCopia(req, res, crudo);
      }
      return responder(res, 404, { message: "No encontrado" });
    } catch (e) {
      registro(`[puerta] ${req.method} ${req.url}: ${e.stack || e.message}`);
      if (!res.headersSent) responder(res, 500, { message: "Error interno de la puerta local" });
    }
  });
  servidor.adjuntos = adjuntos;
  return servidor;
}
