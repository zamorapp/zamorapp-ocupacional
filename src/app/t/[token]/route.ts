import { createClient } from "@supabase/supabase-js";
import { DOCS_TRABAJADOR, esDocTrabajador } from "@/lib/whatsapp-trabajador";

export const dynamic = "force-dynamic";

// Documentos que el servicio médico le envió al trabajador por WhatsApp (un enlace con los que el médico marcó).
// GET muestra la lista; cada documento se baja con POST (la cédula viaja en el cuerpo, nunca en la URL).
// listar_enlace_trabajador y abrir_enlace_trabajador validan vencimiento, anulación y cédula, y anotan cada apertura.

type Fila = { documento: string; pide_cedula: boolean; vigente: boolean; bloqueado: boolean; servicio: string | null; telefono_servicio: string | null };

const CABECERAS = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow", "Referrer-Policy": "no-referrer" };
const html = (t: string) => t.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

const pagina = (titulo: string, cuerpo: string, estado = 200) =>
  new Response(
    `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${html(titulo)}</title>
<style>
:root{color-scheme:light dark;--f:#f6f8f8;--t:#1d2a2c;--s:#5b6b6d;--b:#d7dfe0;--c:#fff;--p:#0b6b62;--a:#9a3412}
@media (prefers-color-scheme:dark){:root{--f:#0f1718;--t:#e6eeee;--s:#9fb0b2;--b:#2a3a3c;--c:#162224;--p:#4fc3b4;--a:#fdba74}}
*{box-sizing:border-box}body{font-family:system-ui,sans-serif;margin:0;padding:16px;background:var(--f);color:var(--t);min-height:100dvh;display:grid;place-items:center}
main{width:100%;max-width:440px}h1{font-size:20px;margin:0 0 4px}p{color:var(--s);margin:0 0 16px;line-height:1.45}
.doc{display:flex;align-items:center;gap:12px;width:100%;padding:14px 16px;margin:0 0 10px;border:1px solid var(--b);border-radius:12px;background:var(--c);color:var(--t);font:inherit;font-size:16px;text-align:left;cursor:pointer}
.doc:hover{border-color:var(--p)}.doc span{flex:1}.doc small{color:var(--s)}.doc[disabled]{opacity:.55;cursor:not-allowed}
label{display:block;font-weight:600;margin:0 0 6px}input{width:100%;height:48px;font-size:22px;letter-spacing:.4em;text-align:center;border:1px solid var(--b);border-radius:10px;background:var(--c);color:var(--t);margin:0 0 6px}
.nota{font-size:13px;margin:0 0 16px}.error{color:var(--a);font-weight:600}a{color:var(--p)}
</style></head><body><main>${cuerpo}</main></body></html>`,
    { status: estado, headers: { ...CABECERAS, "Content-Type": "text/html; charset=utf-8" } },
  );

const noDisponible = (servicio?: string | null, telefono?: string | null) => {
  const a = servicio ? `a ${html(servicio)}${telefono ? `, ${html(telefono)}` : ""}` : "al servicio médico";
  const tel = telefono?.replace(/[^\d+]/g, "");
  return pagina("Enlace no disponible", `<h1>Este enlace ya no está disponible</h1><p>Venció (dura 7 días) o el servicio médico lo anuló. Pídeselo de nuevo ${a}.</p>${tel ? `<p><a href="tel:${tel}">Llamar</a></p>` : ""}`, 404);
};

function cliente() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const clave = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return url && clave ? createClient(url, clave, { auth: { persistSession: false, autoRefreshToken: false } }) : null;
}

const tokenValido = (t: string) => /^[A-Za-z0-9_-]{40,64}$/.test(t);

async function listar(token: string) {
  const supabase = cliente();
  if (!supabase || !tokenValido(token)) return null;
  const { data } = await supabase.rpc("listar_enlace_trabajador", { p_token: token });
  return (data as Fila[] | null) ?? [];
}

function lista(filas: Fila[], error = "") {
  const vigentes = filas.filter((f) => f.vigente && esDocTrabajador(f.documento));
  const { servicio, telefono_servicio, bloqueado } = filas[0];
  if (!vigentes.length) return noDisponible(servicio, telefono_servicio);
  const cedula = vigentes.some((f) => f.pide_cedula);
  const botones = vigentes
    .map((f) => {
      const d = DOCS_TRABAJADOR[f.documento as keyof typeof DOCS_TRABAJADOR];
      const off = f.pide_cedula && bloqueado;
      return `<button class="doc" name="documento" value="${html(f.documento)}"${off ? " disabled" : ""}><span>${html(d.corto)}${f.pide_cedula ? "<br><small>pide tu cédula</small>" : ""}</span>&#8595;</button>`;
    })
    .join("");
  const campo = cedula
    ? bloqueado
      ? `<p class="error">Se escribió mal la cédula 5 veces. Pídele al servicio que te lo envíe de nuevo${telefono_servicio ? ` (${html(telefono_servicio)})` : ""}.</p>`
      : `<label for="cedula">4 últimos dígitos de tu cédula</label><input id="cedula" name="cedula" inputmode="numeric" autocomplete="off" maxlength="4" pattern="[0-9]{4}" placeholder="••••"><p class="nota">Solo para los documentos médicos.</p>`
    : "";
  return pagina(
    "Tus documentos",
    `<h1>Tus documentos</h1><p>${servicio ? `De ${html(servicio)}. ` : ""}Toca cada uno para abrirlo y guárdalo en tu teléfono. El enlace dura 7 días.</p>${error ? `<p class="error" role="alert">${html(error)}</p>` : ""}<form method="post">${campo}${botones}</form>`,
  );
}

export async function GET(_: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const filas = await listar(token);
  if (!filas?.length) return noDisponible();
  return lista(filas);
}

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const filas = await listar(token);
  if (!filas?.length) return noDisponible();
  const form = await request.formData().catch(() => null);
  const documento = String(form?.get("documento") ?? "");
  const cedula = String(form?.get("cedula") ?? "").slice(0, 20);
  if (!esDocTrabajador(documento)) return lista(filas, "Elige un documento.");
  const { data } = await cliente()!.rpc("abrir_enlace_trabajador", {
    p_token: token,
    p_documento: documento,
    p_cedula: cedula || null,
    p_agente: request.headers.get("user-agent"),
  });
  const r = (data as { nombre: string | null; contenido_base64: string | null; error: string | null }[] | null)?.[0];
  if (r?.contenido_base64 && r.nombre)
    return new Response(Buffer.from(r.contenido_base64, "base64"), {
      headers: { ...CABECERAS, "Content-Type": "application/pdf", "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(r.nombre)}` },
    });
  const nuevas = (await listar(token)) ?? filas;
  if (r?.error === "cedula") return lista(nuevas, cedula ? "La cédula no coincide. Revisa los 4 últimos dígitos." : "Escribe los 4 últimos dígitos de tu cédula.");
  if (r?.error === "bloqueado") return lista(nuevas);
  return lista(nuevas, "Ese documento ya no está disponible.");
}
