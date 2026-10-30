// Abrir y cerrar la copia del teléfono con el PIN. La clave de datos solo vive en memoria mientras la app está
// abierta; al bloquear se suelta. 10 PIN errados seguidos borran la copia (lo que ya subió está en la nube).
import { AlmacenCifrado, borrarTodo, hayCopia, leerAbierto, ponerAbierto } from "./almacen";
import { abrirLlave, cambiarPin, crearLlave, type LlaveEnvuelta } from "./cripto";
import { Motor } from "./motor";
import { NubeNavegador } from "./nube-navegador";
import { RelojMovil } from "./reloj";
import { crearClienteNavegador } from "@/lib/supabase/client";

export const INTENTOS_MAXIMOS = 10;

export type Abierta = { motor: Motor; nube: NubeNavegador };

function armar(llave: CryptoKey, alRevocar: () => Promise<void>): Abierta {
  const reloj = new RelojMovil();
  const nube = new NubeNavegador(reloj);
  const motor = new Motor(new AlmacenCifrado(llave), nube, reloj, alRevocar);
  return { motor, nube };
}

export { hayCopia, borrarTodo };

// Teléfono nuevo (o tras borrar): PIN nuevo y copia vacía
export async function crearCopia(pin: string, alRevocar: () => Promise<void>): Promise<Abierta> {
  await borrarTodo();
  const { llave, envuelta } = await crearLlave(pin);
  await ponerAbierto("llave", envuelta);
  await ponerAbierto("intentos", 0);
  return armar(llave, alRevocar);
}

export type ResultadoAbrir = { ok: true; abierta: Abierta } | { ok: false; restantes: number; borrado: boolean };

export async function abrirCopia(pin: string, alRevocar: () => Promise<void>): Promise<ResultadoAbrir> {
  const envuelta = await leerAbierto<LlaveEnvuelta>("llave");
  if (!envuelta) return { ok: false, restantes: 0, borrado: true };
  const llave = await abrirLlave(pin, envuelta);
  if (!llave) {
    const intentos = ((await leerAbierto<number>("intentos")) ?? 0) + 1;
    if (intentos >= INTENTOS_MAXIMOS) { await borrarTodo(); return { ok: false, restantes: 0, borrado: true }; }
    await ponerAbierto("intentos", intentos);
    return { ok: false, restantes: INTENTOS_MAXIMOS - intentos, borrado: false };
  }
  await ponerAbierto("intentos", 0);
  const abierta = armar(llave, alRevocar);
  await abierta.motor.cargar();
  await abierta.motor.contarApertura();
  return { ok: true, abierta };
}

export async function nuevoPin(viejo: string, nuevo: string) {
  const envuelta = await leerAbierto<LlaveEnvuelta>("llave");
  const otra = envuelta && (await cambiarPin(viejo, nuevo, envuelta));
  if (!otra) return false;
  await ponerAbierto("llave", otra);
  return true;
}

// El id del equipo no es secreto (el secreto va cifrado): se guarda aparte para revisar, ANTES del PIN, si el
// teléfono fue desactivado desde Configuración › Equipos. Así un teléfono perdido se borra en cuanto tiene señal,
// aunque nadie sepa el PIN.
export const anotarEquipo = (id: string) => ponerAbierto("equipo", id);

export async function revisarDesactivado(): Promise<boolean> {
  const id = await leerAbierto<string>("equipo").catch(() => undefined);
  if (!id || (typeof navigator !== "undefined" && !navigator.onLine)) return false;
  try {
    const { data, error } = await crearClienteNavegador().from("equipos").select("activo").eq("id", id).maybeSingle();
    if (error || !data || data.activo !== false) return false;
    await borrarTodo();
    return true;
  } catch { return false; }
}
