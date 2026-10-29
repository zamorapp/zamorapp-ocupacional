// Puente con zamorApp Escritorio (Tauri). En la web no existe y todo sigue con el navegador (window.print).
// En el programa de escritorio la página pide al programa el diálogo de impresoras de Windows y el «Guardar como» del PDF.

type Puente = { invoke: (comando: string, args?: Record<string, unknown>) => Promise<unknown> };

function puente(): Puente | null {
  if (typeof window === "undefined") return null;
  return (window as unknown as { __TAURI_INTERNALS__?: Puente }).__TAURI_INTERNALS__ ?? null;
}

export const enEscritorio = () => puente() !== null;

// Abre un documento en otra ventana. Si la dirección sale de algo asíncrono (guardar antes, pedir un enlace firmado):
// en la web la pestaña se abre ya con el clic (si se abre después, el navegador la bloquea) y luego se dirige; en el
// escritorio se pide la ventana ya con la dirección final, porque el programa abre ventanas propias y window.open
// devuelve null (ver ventana_nueva en escritorio/src-tauri/src/documentos.rs).
export async function abrirEnVentana(destino: string | (() => Promise<string | null>)): Promise<void> {
  if (typeof destino === "string") return void window.open(destino, "_blank");
  if (enEscritorio()) {
    const url = await destino();
    if (url) window.open(url, "_blank");
    return;
  }
  // eslint-disable-next-line no-restricted-syntax -- solo en la web: la pestaña se abre en el clic y se dirige después
  const pestana = window.open("about:blank", "_blank");
  const url = await destino();
  if (!url) return void pestana?.close();
  if (pestana) pestana.location.href = url;
  else window.location.href = url;
}

const mensaje = (e: unknown) => (typeof e === "string" ? e : e instanceof Error ? e.message : "No se pudo completar la acción.");

// Diálogo de impresoras (Windows en el escritorio; el del navegador en la web)
export async function imprimirPagina(): Promise<void> {
  const p = puente();
  if (!p) return void window.print();
  try {
    await p.invoke("imprimir");
  } catch (e) {
    throw new Error(mensaje(e));
  }
}

// Solo escritorio: «Guardar como» y PDF. Devuelve la ruta elegida, o null si la persona canceló.
export async function guardarPdf(nombre: string): Promise<string | null> {
  const p = puente();
  if (!p) throw new Error("Guardar PDF directo solo está en zamorApp Escritorio. En el navegador usa Imprimir › Destino › Guardar como PDF.");
  try {
    return ((await p.invoke("guardar_pdf", { nombre })) as string | null) ?? null;
  } catch (e) {
    throw new Error(mensaje(e));
  }
}

export async function mostrarPdf(ruta: string, abrir: boolean): Promise<void> {
  try {
    await puente()?.invoke("mostrar_pdf", { ruta, abrir });
  } catch (e) {
    throw new Error(mensaje(e));
  }
}
