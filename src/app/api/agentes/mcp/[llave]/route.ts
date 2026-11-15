import { responderMcp, soloPost } from "@/lib/agentes/puerta";

// Igual que /api/agentes/mcp, para los conectores que solo aceptan una dirección: la llave es el último tramo.
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export const POST = async (req: Request, { params }: { params: Promise<{ llave: string }> }) => responderMcp(req, (await params).llave);
export const GET = soloPost;
export const DELETE = soloPost;
