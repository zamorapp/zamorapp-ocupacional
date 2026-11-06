import { cookies } from "next/headers";
import { pdfConNavegador, pdfRegistroConNavegador, rutaImprimir } from "@/lib/pdf-navegador";
import { crearClienteServidor } from "@/lib/supabase/server";
import { clienteAnonimo } from "@/lib/supabase/anonimo";
import { TOKEN_REGISTRO } from "@/lib/solicitudes-paciente";
import { DOCS_REGISTRO, docsElegidos, esDocRegistro, esParteOrden, PARTES_ORDEN, type VistaRegistro } from "@/lib/registro-documentos";
import { cabeceraPdf, pdfRegistroDisponible } from "@/lib/registro-pdf";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Única función con Chromium (ver pdf-servidor.ts). La llaman las acciones del propio servidor con las cookies de
// quien envía; el Chromium abre las páginas de /imprimir con esa sesión y la RLS decide qué datos salen.
export async function POST(req: Request) {
  // Desde un navegador solo se acepta el mismo sitio (las acciones del servidor no mandan Origin)
  const origen = req.headers.get("origin");
  if (origen && new URL(origen).host !== new URL(req.url).host) return Response.json({ error: "Origen no permitido" }, { status: 403 });
  const supabase = await crearClienteServidor();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return Response.json({ error: "La sesión venció: vuelve a entrar y repite el envío." }, { status: 401 });

  const { rutas } = await req.json().catch(() => ({ rutas: null }));
  if (!Array.isArray(rutas) || !rutas.length || rutas.length > 4 || rutas.some((r) => typeof r !== "string" || !rutaImprimir(r))) {
    return Response.json({ error: "Rutas no válidas" }, { status: 400 });
  }
  try {
    const pdfs = await pdfConNavegador(rutas, (await cookies()).getAll());
    return Response.json({ pdfs: pdfs.map((p) => p.toString("base64")) });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "No se pudo preparar el documento." }, { status: 500 });
  }
}

// Enlace del paciente, sin sesión: GET /api/pdf?registro=<token>&tipo=orden&parte=laboratorio devuelve la hoja en PDF
// aplanado con la firma y el sello del médico incrustados (registro-pdf.ts). La base decide con el token: llenado,
// vigente, con «Firmados a mi nombre» y dentro de la ventana de descarga. Cada descarga abre (o respeta) esa ventana.
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const token = q.get("registro") ?? "", tipo = q.get("tipo") ?? "", parte = q.get("parte") ?? undefined;
  const sinCache = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "X-Robots-Tag": "noindex" };
  if (!TOKEN_REGISTRO.test(token) || !esDocRegistro(tipo) || (parte !== undefined && (tipo !== "orden" || !esParteOrden(parte)))) {
    return Response.json({ error: "Enlace no válido." }, { status: 400, headers: sinCache });
  }
  const supabase = clienteAnonimo();
  if (!supabase || !pdfRegistroDisponible()) return Response.json({ error: "sin-pdf" }, { status: 503, headers: sinCache });
  const { data } = await supabase.rpc("documentos_registro_paciente", { p_token: token });
  const v = data as VistaRegistro | null;
  if (!v || !docsElegidos(v.documentos).includes(tipo)) return Response.json({ error: "Tus documentos ya no están disponibles en este enlace." }, { status: 410, headers: sinCache });
  if (!v.firmado) return Response.json({ error: "sin-firma" }, { status: 409, headers: sinCache });
  await supabase.rpc("marcar_descarga_registro", { p_token: token });
  try {
    const ruta = `/registro/${token}/documento/${tipo}${parte ? `?parte=${parte}` : ""}`;
    const pdf = await pdfRegistroConNavegador(ruta, cabeceraPdf());
    const nombre = (parte && esParteOrden(parte) ? `Orden de ${PARTES_ORDEN[parte]}` : DOCS_REGISTRO[tipo].nombre)
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Za-z0-9]+/g, "-");
    return new Response(new Uint8Array(pdf), {
      headers: { ...sinCache, "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${nombre}-${v.persona.cedula.replace(/[^A-Za-z0-9-]/g, "")}.pdf"` },
    });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "No se pudo preparar el documento." }, { status: 500, headers: sinCache });
  }
}
