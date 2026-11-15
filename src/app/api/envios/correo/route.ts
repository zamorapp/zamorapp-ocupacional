import { createClient } from "@supabase/supabase-js";
import { correoConfigurado, enviarCorreo, type Adjunto } from "@/lib/correo";
import { CUBETA_COLA, nombreDeArchivoCola } from "@/lib/envios-cola";
import { ahora } from "@/lib/fecha";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX = 10;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const UN_DIA = 24 * 3600 * 1000;
type Resultado = { id: string; estado: "en_cola" | "enviado" | "fallido"; error?: string };

// Cola de envíos del escritorio: la PC registra el correo «en_cola» y deja su PDF en el bucket privado; esta ruta
// (solo en Vercel, donde vive la clave de Gmail) lo toma con la sesión de nube de quien lo registró, lo envía y lo cierra.
// La puerta local la llama al guardar y en cada sincronía mientras queden correos en cola. Nunca usa service_role:
// la RLS decide qué filas y qué archivos ve (solo los propios).
export async function POST(req: Request) {
  if (!correoConfigurado()) return Response.json({ mensaje: "Falta configurar el correo remitente." }, { status: 503 });
  const token = /^Bearer\s+(\S+)$/.exec(req.headers.get("authorization") ?? "")?.[1];
  if (!token) return Response.json({ mensaje: "Sin sesión" }, { status: 401 });
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: usuario } = await supabase.auth.getUser(token);
  const uid = usuario.user?.id;
  if (!uid) return Response.json({ mensaje: "Sesión vencida" }, { status: 401 });

  // Huérfanos propios (más de 7 días sin envío en cola): se borran por la API de Storage; si falla, no frena el envío
  const { data: huerfanos } = await supabase.rpc("envios_cola_huerfanos");
  if (Array.isArray(huerfanos) && huerfanos.length) await supabase.storage.from(CUBETA_COLA).remove(huerfanos as string[]);

  const cuerpo = (await req.json().catch(() => null)) as { ids?: unknown } | null;
  const ids = Array.isArray(cuerpo?.ids) ? cuerpo.ids.filter((x): x is string => typeof x === "string" && UUID.test(x)).slice(0, MAX) : null;
  let consulta = supabase.from("envios").select("id, org_id, destinatario, asunto, mensaje, creado_en")
    .eq("estado", "en_cola").eq("canal", "correo").eq("enviado_por", uid).order("creado_en").limit(MAX);
  if (ids) consulta = consulta.in("id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]);
  const { data: filas, error } = await consulta;
  if (error) return Response.json({ mensaje: error.message }, { status: 500 });
  if (!filas?.length) return Response.json({ resultados: [] });

  const [{ data: perfil }, { data: orgs }] = await Promise.all([
    supabase.from("perfiles").select("nombre_completo").eq("id", uid).maybeSingle(),
    supabase.from("organizaciones").select("id, nombre").in("id", [...new Set(filas.map((f) => f.org_id))]),
  ]);
  const resultados: Resultado[] = [];
  for (const f of filas) {
    const carpeta = `${uid}/${f.id}`;
    const { data: lista } = await supabase.storage.from(CUBETA_COLA).list(carpeta);
    const archivos = (lista ?? []).filter((a) => a.name.endsWith(".pdf")).sort((a, b) => a.name.localeCompare(b.name));
    if (!archivos.length) {
      // El PDF todavía no subió (la PC lo sube después de la fila): se espera; si pasó un día, se da por perdido
      if (ahora() - new Date(f.creado_en).getTime() < UN_DIA) { resultados.push({ id: f.id, estado: "en_cola" }); continue; }
      const motivo = "No llegó el PDF desde la PC. Vuelve a enviarlo.";
      await supabase.from("envios").update({ estado: "fallido", error: motivo }).eq("id", f.id).eq("estado", "en_cola");
      resultados.push({ id: f.id, estado: "fallido", error: motivo });
      continue;
    }
    // Tomarlo: si otra llamada ya lo tomó, esta no lo envía de nuevo
    const { data: tomado } = await supabase.from("envios").update({ estado: "enviando" }).eq("id", f.id).eq("estado", "en_cola").select("id");
    if (!tomado?.length) continue;
    let estado: "enviado" | "fallido" = "enviado";
    let falla: string | undefined;
    try {
      const adjuntos: Adjunto[] = [];
      for (const a of archivos) {
        const { data: blob, error: e } = await supabase.storage.from(CUBETA_COLA).download(`${carpeta}/${a.name}`);
        if (!blob) throw new Error(`No se pudo leer el PDF: ${e?.message ?? a.name}`);
        const contenido = Buffer.from(await blob.arrayBuffer());
        // Solo PDF de verdad: el bucket filtra por tipo declarado, aquí se revisa la firma del archivo
        if (contenido.subarray(0, 5).toString("latin1") !== "%PDF-") throw new Error(`El archivo ${nombreDeArchivoCola(a.name)} no es un PDF válido`);
        adjuntos.push({ nombre: nombreDeArchivoCola(a.name), contenido });
      }
      const org = orgs?.find((o) => o.id === f.org_id)?.nombre ?? "";
      await enviarCorreo({ para: f.destinatario, asunto: f.asunto, texto: f.mensaje, nombreRemitente: [perfil?.nombre_completo, org].filter(Boolean).join(" · "), adjuntos });
    } catch (e) {
      estado = "fallido";
      falla = (e as Error).message.slice(0, 300);
    }
    await supabase.from("envios").update({ estado, error: falla ?? null }).eq("id", f.id);
    await supabase.storage.from(CUBETA_COLA).remove(archivos.map((a) => `${carpeta}/${a.name}`));
    resultados.push({ id: f.id, estado, error: falla });
  }
  return Response.json({ resultados });
}
