import { createECDH } from "node:crypto";

// Llaves pegadas a mano en Vercel (30-oct: la VAPID_PRIVADA no hizo pareja y GMAIL_CLAVE_APP llegó con 19 caracteres):
// se quitan comillas, acentos graves y todo espacio o salto de línea que se cuele al copiar. Ninguna de estas llaves
// lleva espacios por dentro (la contraseña de aplicación de Google se muestra en grupos de 4, pero va junta).
export function limpiarLlave(valor: string | undefined | null) {
  let v = (valor ?? "").replace(/\s+/g, "");
  while (v.length > 1 && /^["'`]/.test(v) && v.endsWith(v[0])) v = v.slice(1, -1);
  return v.replace(/^["'`]+|["'`]+$/g, "");
}

// Pública que corresponde a la privada (base64url, 32 bytes); null si la privada no sirve. Así la pública no vive en
// el código: renovar las llaves es cambiar solo VAPID_PRIVADA en Vercel (y volver a «Activar avisos» en cada celular).
export function publicaDeVapid(privada: string): string | null {
  const bytes = Buffer.from(privada, "base64url");
  if (bytes.length !== 32) return null;
  try {
    const ecdh = createECDH("prime256v1");
    ecdh.setPrivateKey(bytes);
    return ecdh.getPublicKey().toString("base64url");
  } catch {
    return null;
  }
}
