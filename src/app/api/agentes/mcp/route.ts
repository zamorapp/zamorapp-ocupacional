import { responderMcp, soloPost } from "@/lib/agentes/puerta";

// Puerta para agentes por MCP (estándar abierto: Claude, ChatGPT, Gemini…). La llave va en «Authorization: Bearer».
// Sin sesión de zamorApp: la base valida la llave en cada llamada (public.agente).
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export const POST = (req: Request) => responderMcp(req);
export const GET = soloPost;
export const DELETE = soloPost;
