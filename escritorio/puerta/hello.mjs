// Entrar con Windows Hello (huella, rostro o PIN de Windows) en esta PC.
// La huella la verifica Windows a pedido de la ventana del programa; la puerta solo acepta ese aviso con la
// clave de control de esta sesión (X-Zamorapp-Control), que nunca llega a la página. A cambio entrega un
// código de un solo uso (60 s) que la página canjea por una sesión local, con los mismos controles que entrar
// con la clave sin internet: usuario no bloqueado, sin cierre desde la nube y máximo 7 días sin conexión.
import crypto from "node:crypto";
import { CONFIG } from "./config.mjs";

export function crearHello({ estado, nube, control, sesionLocal, usuarioDe, rolEnNube, responder, errorAuth, registro }) {
  const d = () => estado.d;
  const codigos = new Map(); // código → { uid, tipo, vence }; solo en memoria

  const nuevoCodigo = (uid, tipo, segundos) => {
    for (const [c, v] of codigos) if (v.vence < Date.now()) codigos.delete(c);
    const codigo = crypto.randomBytes(32).toString("base64url");
    codigos.set(codigo, { uid, tipo, vence: Date.now() + segundos * 1000 });
    return codigo;
  };
  const canjear = (codigo, tipo) => {
    const v = codigos.get(String(codigo || ""));
    codigos.delete(String(codigo || ""));
    return v && v.tipo === tipo && v.vence >= Date.now() ? v.uid : null;
  };

  const deControl = (req) => {
    const dada = Buffer.from(String(req.headers["x-zamorapp-control"] || ""));
    const esperada = Buffer.from(control);
    return Boolean(control) && dada.length === esperada.length && crypto.timingSafeEqual(dada, esperada);
  };

  const activos = () => Object.entries(d().usuarios).filter(([, u]) => u.hello && !u.bloqueado);

  // Por qué un usuario no puede entrar ahora sin clave (null = puede).
  async function impedimento(uid) {
    const u = d().usuarios[uid];
    if (!u?.hello) return "Activa Windows Hello de nuevo desde tu cuenta.";
    if (u.bloqueado) return "Tu acceso en esta PC fue desactivado. Habla con el administrador.";
    if (u.requiereNube) return "Tu sesión fue cerrada desde la nube (por ejemplo, cambiaste la clave). Entra con tu contraseña.";
    if (!nube.enLinea) await nube.comprobar();
    if (nube.enLinea) {
      // Con internet la nube decide: sesión vigente (si cambió la clave, token() la corta) y miembro activo
      if (!(await nube.token(uid))) return "Tu sesión en la nube venció. Entra con tu contraseña.";
      const rol = await rolEnNube(uid);
      if (rol === null) { nube.exigirNube(uid, true); return "Tu acceso fue desactivado. Habla con el administrador."; }
      return null;
    }
    if (Date.now() - (u.ultimoOnline || 0) > CONFIG.diasSinConexion * 864e5) {
      return `Pasaron más de ${CONFIG.diasSinConexion} días sin conexión. Conecta la PC a internet y entra con tu contraseña.`;
    }
    return null;
  }

  // A la ventana se le contesta siempre 200 con { ok, mensaje }: así lee el motivo para mostrarlo.
  // Atiende las rutas de Windows Hello. Devuelve true si la ruta era suya.
  return async function atender(req, res, ruta, json) {
    const parametros = new URL(req.url, "http://x").searchParams;

    if (ruta === "/auth/v1/token" && parametros.get("grant_type") === "hello") {
      const uid = canjear(json()?.codigo, "sesion");
      registro(`[auth] entrar con Windows Hello: ${uid ? "ok" : "código no válido o vencido"}`);
      if (!uid) return errorAuth(res, 400, "Tardó demasiado. Vuelve a tocar «Entrar con Windows Hello».", "hello_code_invalid"), true;
      d().helloUltimo = uid;
      estado.guardar();
      return responder(res, 200, sesionLocal(uid)), true;
    }
    if (!ruta.startsWith("/zamorapp/huella/")) return false;

    // La ventana del programa intercepta esta dirección; si llega aquí, el programa instalado no trae Windows
    // Hello. 204: el navegador no cambia de página y la página avisa que hay que actualizar.
    if (ruta.startsWith("/zamorapp/huella/ventana/")) { res.writeHead(204); res.end(); return true; }

    if (ruta === "/zamorapp/huella/estado" && req.method === "GET") return responder(res, 200, { usuarios: activos().length }), true;

    if (ruta === "/zamorapp/huella/mia" && req.method === "GET") {
      const quien = usuarioDe(req);
      return responder(res, quien ? 200 : 401, { activa: Boolean(quien?.u.hello) }), true;
    }

    if (ruta === "/zamorapp/huella/preparar" && req.method === "POST") {
      const quien = usuarioDe(req);
      if (!quien) return errorAuth(res, 401, "Sesión no válida", "bad_jwt"), true;
      return responder(res, 200, { codigo: nuevoCodigo(quien.uid, "activar", 120) }), true;
    }

    if (ruta === "/zamorapp/huella/quitar" && req.method === "POST") {
      const quien = usuarioDe(req);
      if (!quien) return errorAuth(res, 401, "Sesión no válida", "bad_jwt"), true;
      delete quien.u.hello;
      if (d().helloUltimo === quien.uid) delete d().helloUltimo;
      estado.guardar();
      registro("[auth] Windows Hello quitado en esta PC");
      return responder(res, 200, { ok: true }), true;
    }

    // Desde aquí, solo la ventana del programa (después de que Windows verificó la huella).
    if (ruta === "/zamorapp/huella/activar" && req.method === "POST") {
      if (!deControl(req)) return responder(res, 403, { message: "No autorizado" }), true;
      const uid = canjear(parametros.get("codigo"), "activar");
      if (!uid || !d().usuarios[uid]) return responder(res, 200, { ok: false, mensaje: "Tardó demasiado. Intenta de nuevo." }), true;
      d().usuarios[uid].hello = { desde: new Date().toISOString() };
      d().helloUltimo = uid;
      estado.guardar();
      registro("[auth] Windows Hello activado en esta PC");
      return responder(res, 200, { ok: true }), true;
    }

    if (ruta === "/zamorapp/huella/entrar" && req.method === "POST") {
      if (!deControl(req)) return responder(res, 403, { message: "No autorizado" }), true;
      // En esta PC entra quien usó Windows Hello por última vez (por ahora una PC, un profesional a la vez)
      const lista = activos();
      const uid = lista.some(([id]) => id === d().helloUltimo) ? d().helloUltimo : lista[0]?.[0];
      if (!uid) return responder(res, 200, { ok: false, mensaje: "Nadie tiene Windows Hello activado en esta PC. Entra con tu contraseña." }), true;
      const motivo = await impedimento(uid);
      registro(`[auth] Windows Hello verificado: ${motivo ? "rechazado" : "ok"}`);
      if (motivo) return responder(res, 200, { ok: false, mensaje: motivo }), true;
      return responder(res, 200, { ok: true, codigo: nuevoCodigo(uid, "sesion", 60) }), true;
    }
    return false;
  };
}
