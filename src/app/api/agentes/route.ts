import { ACCIONES, INSTRUCCIONES } from "@/lib/agentes/acciones";
import { leerCuerpo, leerLlave, llamarPuerta, sinLlave, SIN_CACHE, URL_PUBLICA } from "@/lib/agentes/puerta";

// Puerta para agentes sin MCP (cualquier plataforma que sepa llamar una dirección con una llave).
//   GET  /api/agentes            → qué acciones hay y qué datos pide cada una (no pide llave: no trae datos)
//   POST /api/agentes            → { "accion": "...", "datos": { … }, "ensayo": true|false } con «Authorization: Bearer <llave>»
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export function GET() {
  return Response.json({
    nombre: "zamorApp Ocupacional · puerta para agentes",
    instrucciones: INSTRUCCIONES,
    mcp: `${URL_PUBLICA}/api/agentes/mcp`,
    llamar: { metodo: "POST", direccion: `${URL_PUBLICA}/api/agentes`, cabecera: "Authorization: Bearer <llave>", cuerpo: { accion: "resumen", datos: {}, ensayo: false } },
    acciones: ACCIONES.map((a) => ({ accion: a.nombre, titulo: a.titulo, descripcion: a.descripcion, crea: a.crea, datos: a.esquema })),
  }, { headers: SIN_CACHE });
}

export async function POST(req: Request) {
  const llave = leerLlave(req);
  if (!llave) return sinLlave();
  const cuerpo = await leerCuerpo(req);
  if (!cuerpo || typeof cuerpo !== "object" || Array.isArray(cuerpo)) {
    return Response.json({ ok: false, error: "El cuerpo debe ser JSON: { accion, datos, ensayo }." }, { status: 400, headers: SIN_CACHE });
  }
  const { accion, datos, ensayo } = cuerpo as { accion?: unknown; datos?: unknown; ensayo?: unknown };
  const d = datos && typeof datos === "object" && !Array.isArray(datos) ? (datos as Record<string, unknown>) : {};
  const res = await llamarPuerta(llave, String(accion ?? ""), d, ensayo === true);
  return Response.json(res, { status: 200, headers: SIN_CACHE });
}
