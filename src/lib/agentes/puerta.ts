import "server-only";
import { ACCION, ACCIONES, INSTRUCCIONES } from "./acciones";

// Puerta para agentes, lado web: recibe la llave, llama a public.agente() en la base como anónimo (la llave es la
// credencial; no se usa ninguna clave de servicio) y arma los enlaces. Aquí no hay permisos: los decide la base.

export const URL_PUBLICA = (process.env.ZAMORAPP_URL_PUBLICA || "https://zamorapp-ocupacional.vercel.app").replace(/\/$/, "");
const ESCRITORIO = process.env.NEXT_PUBLIC_ESCRITORIO === "1";
const LLAVE = /^zk_[0-9a-f]{64}$/;
export const MAX_CUERPO = 100_000;

export type Respuesta = { ok: boolean; accion?: string; ensayo?: boolean; resultado?: unknown; error?: string };

// La llave llega en «Authorization: Bearer», en «x-api-key» o como último tramo de la dirección (conectores que
// solo aceptan una dirección). Nunca se anota ni se devuelve.
export function leerLlave(req: Request, deRuta?: string): string | null {
  const auth = req.headers.get("authorization") ?? "";
  const candidata = (/^Bearer\s+(\S+)$/i.exec(auth)?.[1] ?? req.headers.get("x-api-key") ?? deRuta ?? "").trim();
  return LLAVE.test(candidata) ? candidata : null;
}

// «ruta» (y sus «parametros») → «enlace» completo, en cualquier nivel de la respuesta
function conEnlaces(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(conEnlaces);
  if (!v || typeof v !== "object") return v;
  const o = v as Record<string, unknown>;
  const sal: Record<string, unknown> = {};
  for (const [k, x] of Object.entries(o)) if (k !== "ruta" && k !== "parametros") sal[k] = conEnlaces(x);
  if (typeof o.ruta === "string" && o.ruta.startsWith("/")) {
    const u = new URL(o.ruta, URL_PUBLICA);
    if (o.parametros && typeof o.parametros === "object") {
      for (const [k, x] of Object.entries(o.parametros as Record<string, unknown>)) if (x != null) u.searchParams.set(k, String(x));
    }
    sal.enlace = u.toString();
  }
  return sal;
}

export async function llamarPuerta(llave: string, accion: string, datos: Record<string, unknown>, ensayo: boolean): Promise<Respuesta> {
  if (ESCRITORIO) return { ok: false, error: "La puerta para agentes vive en la web (necesita internet), no en el programa de la PC." };
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return { ok: false, error: "La aplicación no tiene base configurada." };
  if (!ACCION.has(accion)) return { ok: false, error: `Acción desconocida. Las que hay: ${ACCIONES.map((a) => a.nombre).join(", ")}.` };
  try {
    const r = await fetch(`${url}/rest/v1/rpc/agente`, {
      method: "POST",
      headers: { apikey: anon, Authorization: `Bearer ${anon}`, "Content-Type": "application/json" },
      body: JSON.stringify({ p_llave: llave, p_accion: accion, p_datos: datos, p_ensayo: ensayo }),
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });
    if (!r.ok) {
      return { ok: false, error: r.status === 404 ? "Falta aplicar la actualización de la base (puerta para agentes)." : `La base no respondió (${r.status}). Intenta de nuevo.` };
    }
    const res = (await r.json()) as Respuesta;
    return res.ok ? { ...res, resultado: conEnlaces(res.resultado) } : res;
  } catch {
    return { ok: false, error: "No se pudo llegar a la base. Intenta de nuevo." };
  }
}

// ───── MCP (Model Context Protocol), transporte HTTP sin estado: una petición JSON-RPC, una respuesta JSON ─────
const VERSIONES = ["2025-06-18", "2025-03-26", "2024-11-05"];
type Rpc = { jsonrpc?: string; id?: string | number | null; method?: string; params?: Record<string, unknown> };

const herramientas = () => ACCIONES.map((a) => ({
  name: a.nombre, title: a.titulo, description: a.descripcion, inputSchema: a.esquema,
  annotations: { title: a.titulo, readOnlyHint: !a.crea, destructiveHint: false, idempotentHint: true, openWorldHint: false },
}));

async function unMensaje(m: Rpc, llave: string): Promise<object | null> {
  const id = m?.id;
  const fallo = (code: number, message: string) => (id === undefined ? null : { jsonrpc: "2.0", id: id ?? null, error: { code, message } });
  if (!m || typeof m !== "object" || m.jsonrpc !== "2.0" || typeof m.method !== "string") return fallo(-32600, "Petición no válida");
  if (id === undefined) return null; // notificaciones (notifications/initialized…): no llevan respuesta
  const bien = (result: object) => ({ jsonrpc: "2.0", id, result });
  switch (m.method) {
    case "initialize": {
      const pedida = String(m.params?.protocolVersion ?? "");
      return bien({
        protocolVersion: VERSIONES.includes(pedida) ? pedida : VERSIONES[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "zamorapp-ocupacional", title: "zamorApp Ocupacional", version: "1.0.0" },
        instructions: INSTRUCCIONES,
      });
    }
    case "ping": return bien({});
    case "tools/list": return bien({ tools: herramientas() });
    case "tools/call": {
      const nombre = String(m.params?.name ?? "");
      const args = m.params?.arguments;
      if (!ACCION.has(nombre)) return fallo(-32602, `Herramienta desconocida: ${nombre}`);
      const { ensayo, ...datos } = (args && typeof args === "object" && !Array.isArray(args) ? args : {}) as Record<string, unknown>;
      const res = await llamarPuerta(llave, nombre, datos, ensayo === true);
      return bien({ content: [{ type: "text", text: JSON.stringify(res.ok ? res : { ok: false, error: res.error }) }], isError: !res.ok });
    }
    default: return fallo(-32601, `Método no disponible: ${m.method}`);
  }
}

export async function atenderMcp(cuerpo: unknown, llave: string): Promise<{ estado: number; json?: unknown }> {
  if (Array.isArray(cuerpo)) {
    if (!cuerpo.length || cuerpo.length > 20) return { estado: 400, json: { jsonrpc: "2.0", id: null, error: { code: -32600, message: "Lote no válido" } } };
    const sal = [];
    for (const m of cuerpo) { const r = await unMensaje(m as Rpc, llave); if (r) sal.push(r); }
    return sal.length ? { estado: 200, json: sal } : { estado: 202 };
  }
  const r = await unMensaje(cuerpo as Rpc, llave);
  return r ? { estado: 200, json: r } : { estado: 202 };
}

// Cuerpo JSON con tope de tamaño (null si no es JSON o se pasa)
export async function leerCuerpo(req: Request): Promise<unknown | null> {
  const t = await req.text();
  if (t.length > MAX_CUERPO) return null;
  try { return JSON.parse(t); } catch { return null; }
}

export const SIN_CACHE = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" };
export const sinLlave = () => Response.json(
  { ok: false, error: "Falta la llave o no es válida. El doctor la crea en zamorApp: Configuración > Puerta para agentes." },
  { status: 401, headers: { ...SIN_CACHE, "WWW-Authenticate": 'Bearer realm="zamorApp"' } });

// POST de MCP, compartido por /api/agentes/mcp y /api/agentes/mcp/<llave>
export async function responderMcp(req: Request, deRuta?: string): Promise<Response> {
  const llave = leerLlave(req, deRuta);
  if (!llave) return sinLlave();
  const cuerpo = await leerCuerpo(req);
  if (cuerpo === null) return Response.json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "JSON no válido o demasiado grande" } }, { status: 400, headers: SIN_CACHE });
  const { estado, json } = await atenderMcp(cuerpo, llave);
  return json === undefined ? new Response(null, { status: estado, headers: SIN_CACHE }) : Response.json(json, { status: estado, headers: SIN_CACHE });
}

// Sin flujo de eventos ni sesiones: GET y DELETE no aplican
export const soloPost = () => new Response(null, { status: 405, headers: { ...SIN_CACHE, Allow: "POST" } });
