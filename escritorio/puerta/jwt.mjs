// Tokens de sesión locales (HS256). Los firma la puerta y los verifica también PostgREST local.
import crypto from "node:crypto";

const b64 = (b) => Buffer.from(b).toString("base64url");

export function firmar(datos, secreto) {
  const cabecera = b64(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const cuerpo = b64(JSON.stringify(datos));
  const firma = crypto.createHmac("sha256", secreto).update(`${cabecera}.${cuerpo}`).digest("base64url");
  return `${cabecera}.${cuerpo}.${firma}`;
}

// ahoraMs: la hora anclada de la puerta (nube.reloj.ahora()), obligatoria: nunca la fecha de Windows
export function verificar(token, secreto, ahoraMs) {
  if (typeof ahoraMs !== "number") throw new Error("verificar() necesita la hora anclada");
  if (typeof token !== "string") return null;
  const [cabecera, cuerpo, firma] = token.split(".");
  if (!cabecera || !cuerpo || !firma) return null;
  const esperada = crypto.createHmac("sha256", secreto).update(`${cabecera}.${cuerpo}`).digest();
  const recibida = Buffer.from(firma, "base64url");
  if (recibida.length !== esperada.length || !crypto.timingSafeEqual(recibida, esperada)) return null;
  try {
    if (JSON.parse(Buffer.from(cabecera, "base64url")).alg !== "HS256") return null;
    const datos = JSON.parse(Buffer.from(cuerpo, "base64url"));
    // zexp: el vencimiento con la hora anclada; exp lleva margen para PostgREST (reloj de Windows)
    const vence = typeof datos.zexp === "number" ? datos.zexp : datos.exp;
    if (typeof vence !== "number" || vence * 1000 < ahoraMs) return null;
    return datos;
  } catch {
    return null;
  }
}

export function tokenDeCabecera(cabecera) {
  const m = /^Bearer\s+(.+)$/i.exec(cabecera || "");
  return m ? m[1] : null;
}
