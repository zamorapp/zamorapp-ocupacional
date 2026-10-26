// Estado de la PC (equipo, sesiones guardadas, cursor de sincronía), cifrado con AES-256-GCM.
// La llave no está en el disco: la entrega Windows a la ventana, y la ventana a la puerta.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const VACIO = () => ({
  version: 1,
  jwtSecreto: crypto.randomBytes(48).toString("hex"),
  claveBase: crypto.randomBytes(24).toString("hex"), // superusuario de la base local
  claveAutenticador: crypto.randomBytes(24).toString("hex"), // rol de PostgREST local
  equipo: null, // { id, secreto, org_id, nombre }
  usuarios: {}, // id → { email, hash, sal, ultimoOnline, bloqueado, user, nube }
  refrescos: {}, // token → { uid, vence }
  cursor: null, // último seq de sync.registro aplicado
  copiaCompleta: null, // fecha de la última instantánea completa
  firmasPermisos: {}, // uid → huella de su fila en miembros (si cambia, se repite la instantánea)
});

export class Estado {
  constructor(carpeta, llaveHex) {
    if (!/^[0-9a-f]{64}$/i.test(llaveHex || "")) throw new Error("Falta la llave de la PC (ZAMORAPP_LLAVE)");
    this.archivo = path.join(carpeta, "estado.zamorapp");
    this.llave = Buffer.from(llaveHex, "hex");
    fs.mkdirSync(carpeta, { recursive: true });
    this.d = fs.existsSync(this.archivo) ? this.#leer() : VACIO();
    if (!fs.existsSync(this.archivo)) this.guardar();
  }

  #leer() {
    const b = fs.readFileSync(this.archivo);
    const iv = b.subarray(0, 12), tag = b.subarray(12, 28), cifrado = b.subarray(28);
    const d = crypto.createDecipheriv("aes-256-gcm", this.llave, iv);
    d.setAuthTag(tag);
    return { ...VACIO(), ...JSON.parse(Buffer.concat([d.update(cifrado), d.final()]).toString("utf8")) };
  }

  guardar() {
    const iv = crypto.randomBytes(12);
    const c = crypto.createCipheriv("aes-256-gcm", this.llave, iv);
    const cifrado = Buffer.concat([c.update(JSON.stringify(this.d), "utf8"), c.final()]);
    const tmp = `${this.archivo}.tmp`;
    fs.writeFileSync(tmp, Buffer.concat([iv, c.getAuthTag(), cifrado]));
    fs.renameSync(tmp, this.archivo);
  }
}

// Huella de la clave para entrar sin conexión (scrypt). Nunca se guarda la clave.
export function huellaClave(clave, sal = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.scryptSync(clave, sal, 32, { N: 16384, r: 8, p: 1 }).toString("hex");
  return { hash, sal };
}

export function claveCorrecta(clave, u) {
  if (!u?.hash || !u?.sal) return false;
  const { hash } = huellaClave(clave, u.sal);
  return crypto.timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(u.hash, "hex"));
}
