// Tokens de sesión locales (HS256). Los firma la puerta y los verifica también PostgREST local.
import crypto from "node:crypto";

const b64 = (b) => Buffer.from(b).toString("base64url");

export function firmar(datos, secreto) {
  const cabecera = b64(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const cuerpo = b64(JSON.stringify(datos));
  const firma = crypto.createHmac("sha256", secreto).update(`${cabecera}.${cuerpo}`).digest("base64url");
  return `${cabecera}.${cuerpo}.${firma}`;
}

export function verificar(token, secreto, ahoraMs = Date.now()) {
  if (typeof token !== "string") return null;
  const [cabecera, cuerpo, firma] = token.split(".");
  if (!cabecera || !cuerpo || !firma) return null;
  const esperada = crypto.createHmac("sha256", secreto).update(`${cabecera}.${cuerpo}`).digest();
  const recibida = Buffer.from(firma, "base64url");
  if (recibida.length !== esperada.length || !crypto.timingSafeEqual(recibida, esperada)) return null;
  try {
    if (JSON.parse(Buffer.from(cabecera, "base64url")).alg !== "HS256") return null;
    const datos = JSON.parse(Buffer.from(cuerpo, "base64url"));
    if (typeof datos.exp !== "number" || datos.exp * 1000 < ahoraMs) return null;
    return datos;
  } catch {
    return null;
  }
}

export function tokenDeCabecera(cabecera) {
  const m = /^Bearer\s+(.+)$/i.exec(cabecera || "");
  return m ? m[1] : null;
}
