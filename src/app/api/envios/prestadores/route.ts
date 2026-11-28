import { createClient } from "@supabase/supabase-js";
import { enviarCorreoRemision, esSolicitudCorreoRemision } from "@/lib/remisiones-correo";

export const maxDuration = 60;

export async function POST(req: Request) {
  const token = /^Bearer\s+(\S+)$/.exec(req.headers.get("authorization") ?? "")?.[1];
  if (!token) return Response.json({ mensaje: "Sin sesión." }, { status: 401 });
  const solicitud: unknown = await req.json().catch(() => null);
  if (!esSolicitudCorreoRemision(solicitud)) return Response.json({ mensaje: "Orden inválida." }, { status: 400 });

  const cliente = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    global: { headers: { Authorization: "Bearer " + token } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: { user } } = await cliente.auth.getUser(token);
  if (!user) return Response.json({ mensaje: "Sesión vencida." }, { status: 401 });
  const resultado = await enviarCorreoRemision(cliente, solicitud, user.id);
  return Response.json({ mensaje: resultado.mensaje }, { status: resultado.status });
}
