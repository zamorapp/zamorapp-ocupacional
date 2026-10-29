// zamorApp Escritorio: la puerta local avisa en /zamorapp/estado cuando la nube ya cambió y esta versión del
// programa no la entiende. Lo usan el aviso del encabezado (aviso-actualizar.tsx) y la pantalla de error.
export const ESCRITORIO = process.env.NEXT_PUBLIC_ESCRITORIO === "1";
const PUERTA = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const URL_WEB = "https://zamorapp-ocupacional.vercel.app";

export async function nubeAdelantada(): Promise<boolean> {
  if (!ESCRITORIO || !PUERTA) return false;
  try {
    const r = await fetch(`${PUERTA}/zamorapp/estado`, { credentials: "include", cache: "no-store" });
    return Boolean((await r.json())?.actualizar);
  } catch {
    return false;
  }
}

// Envíos (correo, WhatsApp) necesitan la nube: en el escritorio la puerta dice si hay internet. En la web, siempre sí.
export async function escritorioEnLinea(): Promise<boolean> {
  if (!ESCRITORIO || !PUERTA) return true;
  try {
    const r = await fetch(`${PUERTA}/zamorapp/estado`, { credentials: "include", cache: "no-store" });
    return (await r.json())?.enLinea !== false;
  } catch {
    return false;
  }
}

const pedirPuerta = (ruta: string) => fetch(`${PUERTA}${ruta}`, { method: "POST", credentials: "include" }).then((r) => r.json()).catch(() => null);

// Botón «Buscar actualización»: la puerta se lo pasa al programa, que abre el actualizador
export async function buscarActualizacion(): Promise<string> {
  const r = await pedirPuerta("/zamorapp/buscar-actualizacion");
  return r?.pedida ? "Buscando… en unos segundos zamorApp te dice si ya tienes la versión más reciente o empieza a descargar la nueva." : "No se pudo pedir la actualización. Usa el menú zamorApp → Buscar actualizaciones.";
}

// Botón «Trabajar en la web»: el navegador de Windows (dentro de la ventana un enlace externo no abre nada)
export async function abrirWeb(): Promise<string> {
  const r = await pedirPuerta("/zamorapp/abrir-web");
  return r?.abierto ? "Se abrió la web en tu navegador." : `Abre en tu navegador: ${r?.url ?? URL_WEB}`;
}
