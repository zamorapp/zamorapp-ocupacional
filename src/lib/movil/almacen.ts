// Dónde guarda el celular su copia: IndexedDB del navegador, todo cifrado (ver cripto.ts). Dos depósitos:
// - «abierto»: lo único sin cifrar: la clave envuelta con el PIN y el contador de PIN errados. Nada clínico.
// - «seguro»: valores cifrados por clave (filas agrupadas por cubeta, bandeja, estado del equipo).
// En las pruebas se usa AlmacenMemoria con la misma forma.
import { cifrar, descifrar } from "./cripto";

export interface Almacen {
  todos(): Promise<Map<string, unknown>>;
  // valor undefined = borrar esa clave. Todo en una sola transacción: un corte de luz deja todo o nada
  poner(cambios: [string, unknown][]): Promise<void>;
  vaciar(): Promise<void>;
}

export class AlmacenMemoria implements Almacen {
  m = new Map<string, string>();
  async todos() { return new Map([...this.m].map(([k, v]) => [k, JSON.parse(v)])); }
  async poner(cambios: [string, unknown][]) {
    for (const [k, v] of cambios) {
      if (v === undefined) this.m.delete(k); else this.m.set(k, JSON.stringify(v));
    }
  }
  async vaciar() { this.m.clear(); }
}

const BASE = "zamorapp-movil";
const SEGURO = "seguro";
const ABIERTO = "abierto";

function abrirBase(): Promise<IDBDatabase> {
  return new Promise((ok, mal) => {
    const r = indexedDB.open(BASE, 1);
    r.onupgradeneeded = () => {
      r.result.createObjectStore(SEGURO);
      r.result.createObjectStore(ABIERTO);
    };
    r.onsuccess = () => ok(r.result);
    r.onerror = () => mal(r.error);
  });
}

const esperar = (t: IDBTransaction) => new Promise<void>((ok, mal) => {
  t.oncomplete = () => ok();
  t.onerror = () => mal(t.error);
  t.onabort = () => mal(t.error ?? new Error("Transacción cancelada"));
});

// Lo que no es secreto (clave envuelta, intentos): lectura y escritura directas
export async function leerAbierto<T>(clave: string): Promise<T | undefined> {
  const db = await abrirBase();
  try {
    return await new Promise<T | undefined>((ok, mal) => {
      const r = db.transaction(ABIERTO).objectStore(ABIERTO).get(clave);
      r.onsuccess = () => ok(r.result as T | undefined);
      r.onerror = () => mal(r.error);
    });
  } finally { db.close(); }
}

export async function ponerAbierto(clave: string, valor: unknown) {
  const db = await abrirBase();
  try {
    const t = db.transaction(ABIERTO, "readwrite");
    if (valor === undefined) t.objectStore(ABIERTO).delete(clave); else t.objectStore(ABIERTO).put(valor, clave);
    await esperar(t);
  } finally { db.close(); }
}

// Borrado total del teléfono: PIN olvidado, 10 intentos errados, equipo desactivado desde la PC o la web
export async function borrarTodo() {
  await new Promise<void>((ok) => {
    const r = indexedDB.deleteDatabase(BASE);
    r.onsuccess = r.onerror = r.onblocked = () => ok();
  });
}

export async function hayCopia() {
  return Boolean(await leerAbierto("llave").catch(() => undefined));
}

export class AlmacenCifrado implements Almacen {
  constructor(private llave: CryptoKey) {}

  async todos() {
    const db = await abrirBase();
    let crudo: [string, string][];
    try {
      crudo = await new Promise((ok, mal) => {
        const t = db.transaction(SEGURO);
        const s = t.objectStore(SEGURO);
        const claves = s.getAllKeys(), valores = s.getAll();
        t.oncomplete = () => ok((claves.result as string[]).map((k, i) => [k, valores.result[i] as string]));
        t.onerror = () => mal(t.error);
      });
    } finally { db.close(); }
    const salida = new Map<string, unknown>();
    await Promise.all(crudo.map(async ([k, v]) => { salida.set(k, await descifrar(this.llave, v)); }));
    return salida;
  }

  async poner(cambios: [string, unknown][]) {
    if (!cambios.length) return;
    // Se cifra antes de abrir la transacción: IndexedDB la cierra sola si se espera algo que no es suyo
    const listos = await Promise.all(cambios.map(async ([k, v]) => [k, v === undefined ? undefined : await cifrar(this.llave, v)] as const));
    const db = await abrirBase();
    try {
      const t = db.transaction(SEGURO, "readwrite");
      const s = t.objectStore(SEGURO);
      for (const [k, v] of listos) {
        if (v === undefined) s.delete(k); else s.put(v, k);
      }
      await esperar(t);
    } finally { db.close(); }
  }

  async vaciar() {
    const db = await abrirBase();
    try {
      const t = db.transaction(SEGURO, "readwrite");
      t.objectStore(SEGURO).clear();
      await esperar(t);
    } finally { db.close(); }
  }
}
