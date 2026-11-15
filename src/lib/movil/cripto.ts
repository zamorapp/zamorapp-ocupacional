// Cifrado de la copia del celular (modo sin internet). Todo lo que se guarda en el teléfono va cifrado con
// AES-256-GCM. La clave de datos es aleatoria y nunca se guarda tal cual: se guarda envuelta con una clave que sale
// del PIN (PBKDF2-SHA256, 600.000 vueltas). Sin el PIN no se lee nada, ni siquiera copiando los archivos del navegador.

export const VUELTAS = 600_000;

export type LlaveEnvuelta = { sal: string; iv: string; envuelta: string; vueltas: number };

const b64 = (b: ArrayBuffer | Uint8Array) => {
  const u = b instanceof Uint8Array ? b : new Uint8Array(b);
  let s = "";
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000));
  return btoa(s);
};
const deB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const azar = (n: number) => crypto.getRandomValues(new Uint8Array(n));

async function claveDePin(pin: string, sal: Uint8Array, vueltas: number) {
  const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(pin), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "PBKDF2", hash: "SHA-256", salt: sal as BufferSource, iterations: vueltas },
    base, { name: "AES-GCM", length: 256 }, false, ["wrapKey", "unwrapKey"]);
}

// PIN nuevo: crea la clave de datos (no exportable una vez abierta) y la devuelve junto con su versión envuelta
export async function crearLlave(pin: string, vueltas = VUELTAS): Promise<{ llave: CryptoKey; envuelta: LlaveEnvuelta }> {
  const datos = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
  const sal = azar(16), iv = azar(12);
  const kek = await claveDePin(pin, sal, vueltas);
  const envuelta = await crypto.subtle.wrapKey("raw", datos, kek, { name: "AES-GCM", iv: iv as BufferSource });
  const llave = await crypto.subtle.importKey("raw", await crypto.subtle.exportKey("raw", datos), "AES-GCM", false, ["encrypt", "decrypt"]);
  return { llave, envuelta: { sal: b64(sal), iv: b64(iv), envuelta: b64(envuelta), vueltas } };
}

// Abrir con el PIN. Un PIN errado no abre (GCM verifica): devuelve null
export async function abrirLlave(pin: string, e: LlaveEnvuelta): Promise<CryptoKey | null> {
  try {
    const kek = await claveDePin(pin, deB64(e.sal), e.vueltas);
    return await crypto.subtle.unwrapKey("raw", deB64(e.envuelta) as BufferSource, kek, { name: "AES-GCM", iv: deB64(e.iv) as BufferSource },
      "AES-GCM", false, ["encrypt", "decrypt"]);
  } catch {
    return null;
  }
}

// Cambiar el PIN sin volver a cifrar todo: se re-envuelve la misma clave de datos
export async function cambiarPin(pinViejo: string, pinNuevo: string, e: LlaveEnvuelta): Promise<LlaveEnvuelta | null> {
  try {
    const kekVieja = await claveDePin(pinViejo, deB64(e.sal), e.vueltas);
    const datos = await crypto.subtle.unwrapKey("raw", deB64(e.envuelta) as BufferSource, kekVieja, { name: "AES-GCM", iv: deB64(e.iv) as BufferSource },
      "AES-GCM", true, ["encrypt", "decrypt"]);
    const sal = azar(16), iv = azar(12);
    const kek = await claveDePin(pinNuevo, sal, e.vueltas);
    const envuelta = await crypto.subtle.wrapKey("raw", datos, kek, { name: "AES-GCM", iv: iv as BufferSource });
    return { sal: b64(sal), iv: b64(iv), envuelta: b64(envuelta), vueltas: e.vueltas };
  } catch {
    return null;
  }
}

export async function cifrar(llave: CryptoKey, valor: unknown): Promise<string> {
  const iv = azar(12);
  const c = await crypto.subtle.encrypt({ name: "AES-GCM", iv: iv as BufferSource }, llave, new TextEncoder().encode(JSON.stringify(valor)));
  return b64(iv) + "." + b64(c);
}

export async function descifrar<T = unknown>(llave: CryptoKey, texto: string): Promise<T> {
  const [iv, c] = texto.split(".");
  const plano = await crypto.subtle.decrypt({ name: "AES-GCM", iv: deB64(iv) as BufferSource }, llave, deB64(c) as BufferSource);
  return JSON.parse(new TextDecoder().decode(plano)) as T;
}

// PIN aceptable: 8 a 12 dígitos (Analizar: con 6, quien copie los archivos del teléfono lo prueba entero en horas), sin secuencias obvias (123456, 000000, 654321)
export function pinValido(pin: string): string | null {
  if (!/^\d{8,12}$/.test(pin)) return "El PIN lleva de 8 a 12 números";
  if (/^(\d)\1+$/.test(pin)) return "No repitas el mismo número";
  const asc = "01234567890123456789", desc = "98765432109876543210";
  if (asc.includes(pin) || desc.includes(pin)) return "Evita números seguidos (123456)";
  return null;
}
