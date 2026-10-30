import "server-only";
import { cookies } from "next/headers";
import { urlInterna } from "@/lib/pdf-navegador";

export { urlInterna };

// Los PDF se arman en una sola función (/api/pdf), la única que lleva Chromium: así el binario de 67 MB no se copia
// en cada pantalla que envía documentos, y cada despliegue de Vercel ocupa una fracción del espacio.
// Se piden de a pocos para no pasar el límite de 4,5 MB por respuesta de Vercel.
const POR_LLAMADA = 4;

export async function pdfDeRutas(rutas: string[]): Promise<Buffer[]> {
  if (rutas.some((r) => !r.startsWith("/imprimir/"))) throw new Error("Solo se convierten páginas de /imprimir");
  const sesion = (await cookies()).getAll().map((c) => `${c.name}=${c.value}`).join("; ");
  const salida: Buffer[] = [];
  for (let i = 0; i < rutas.length; i += POR_LLAMADA) {
    const r = await fetch(`${urlInterna()}/api/pdf`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: sesion },
      body: JSON.stringify({ rutas: rutas.slice(i, i + POR_LLAMADA) }),
      cache: "no-store",
      redirect: "manual",
    });
    const cuerpo = r.headers.get("content-type")?.includes("application/json") ? await r.json().catch(() => null) : null;
    if (r.status === 401 || (r.status >= 300 && r.status < 400)) throw new Error("La sesión venció: vuelve a entrar y repite el envío.");
    if (!r.ok || !Array.isArray(cuerpo?.pdfs)) throw new Error(cuerpo?.error ?? `No se pudo preparar el documento (${r.status}).`);
    salida.push(...cuerpo.pdfs.map((b: string) => Buffer.from(b, "base64")));
  }
  return salida;
}
