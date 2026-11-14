import { createClient } from "@supabase/supabase-js";
import { numeroWhatsApp } from "@/lib/mensajes";

export const dynamic = "force-dynamic";

// Consentimiento informado de la consulta a distancia (Ley de Telesalud, G.O. 6.207 Ext., 28-12-2015: «por escrito»).
// El paciente lo abre desde WhatsApp sin cuenta: GET muestra el texto; POST «Acepto» lo deja escrito con fecha y hora.
// ver_consentimiento_tele y aceptar_consentimiento_tele validan el enlace (solo se guarda su huella) y su vencimiento.

type Datos = { estado: "vigente" | "aceptado" | "vencido"; aceptado_en: string | null; medio: string; fecha: string; servicio: string; telefono_servicio: string | null; medico: string };

const CABECERAS = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow", "Referrer-Policy": "no-referrer" };
const html = (t: string) => t.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const tokenValido = (t: string) => /^[A-Za-z0-9_-]{40,64}$/.test(t);
const MEDIO: Record<string, string> = { llamada: "llamada telefónica", videollamada: "videollamada", whatsapp: "mensajes de WhatsApp", nota_voz: "notas de voz" };
const fecha = (iso: string) => iso.slice(0, 10).split("-").reverse().join("/");
const hora = (iso: string) => new Intl.DateTimeFormat("es-VE", { timeZone: "America/Caracas", dateStyle: "short", timeStyle: "short" }).format(new Date(iso));

const pagina = (titulo: string, cuerpo: string, estado = 200) =>
  new Response(
    `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${html(titulo)}</title>
<style>
:root{color-scheme:light dark;--f:#f6f8f8;--t:#1d2a2c;--s:#5b6b6d;--b:#d7dfe0;--c:#fff;--p:#0b6b62;--po:#fff;--ok:#166534}
@media (prefers-color-scheme:dark){:root{--f:#0f1718;--t:#e6eeee;--s:#9fb0b2;--b:#2a3a3c;--c:#162224;--p:#4fc3b4;--po:#0f1718;--ok:#86efac}}
*{box-sizing:border-box}body{font-family:system-ui,sans-serif;margin:0;padding:16px;background:var(--f);color:var(--t);min-height:100dvh;display:grid;place-items:center}
main{width:100%;max-width:520px}h1{font-size:20px;margin:0 0 6px}p,li{color:var(--s);line-height:1.5}p{margin:0 0 12px}
ul{padding-left:20px;margin:0 0 16px}li{margin:0 0 6px}.caja{border:1px solid var(--b);border-radius:12px;background:var(--c);padding:16px;margin:0 0 16px}
button{width:100%;min-height:52px;border:0;border-radius:12px;background:var(--p);color:var(--po);font:600 18px system-ui,sans-serif;cursor:pointer}
.marca{color:var(--p);font-weight:700;font-size:14px;margin:0 0 8px}.ok{color:var(--ok);font-weight:600}a{color:var(--p)}.nota{font-size:13px}
</style></head><body><main>${cuerpo}</main></body></html>`,
    { status: estado, headers: { ...CABECERAS, "Content-Type": "text/html; charset=utf-8" } },
  );

function cliente() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const clave = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return url && clave ? createClient(url, clave, { auth: { persistSession: false, autoRefreshToken: false } }) : null;
}

async function ver(token: string): Promise<Datos | null> {
  const supabase = cliente();
  if (!supabase || !tokenValido(token)) return null;
  const { data } = await supabase.rpc("ver_consentimiento_tele", { p_token: token });
  return (data as Datos | null) ?? null;
}

// El teléfono se toca para llamar; si es celular venezolano (58 4xx), también se ofrece WhatsApp
function contacto(telefono: string | null | undefined) {
  const n = numeroWhatsApp(telefono);
  if (!telefono) return "";
  if (!n) return `: ${html(telefono)}`;
  const wa = n.startsWith("584") ? ` o escríbale por <a href="https://wa.me/${n}">WhatsApp</a>` : "";
  return `: <a href="tel:+${n}">${html(telefono)}</a>${wa}`;
}

const noDisponible = (d?: Datos | null) =>
  pagina("Enlace no disponible", `<p class="marca">${html(d?.servicio ?? "Servicio médico")}</p><h1>Este enlace ya no está disponible</h1><p>Venció (dura 7 días) o no existe. Pida uno nuevo al servicio médico${contacto(d?.telefono_servicio)}.</p>`, 404);

const aceptado = (d: Datos) =>
  pagina("Consentimiento aceptado", `<p class="marca">${html(d.servicio)}</p><h1 class="ok">Consentimiento aceptado</h1><p>Quedó registrado${d.aceptado_en ? ` el ${html(hora(d.aceptado_en))}` : ""}. Gracias. Puede cerrar esta página.</p>`);

export async function GET(_: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const d = await ver(token);
  if (!d || d.estado === "vencido") return noDisponible(d);
  if (d.estado === "aceptado") return aceptado(d);
  return pagina("Consentimiento para la consulta a distancia", `
<p class="marca">${html(d.servicio)}</p>
<h1>Consentimiento para la consulta a distancia</h1>
<p>Consulta del ${html(fecha(d.fecha))} con ${html(d.medico)}, por ${html(MEDIO[d.medio] ?? "medios a distancia")}.</p>
<div class="caja"><ul>
<li>La consulta a distancia no reemplaza el examen físico. Si hace falta, el médico le pedirá venir en persona.</li>
<li>Puede fallar la conexión. Si se corta, el servicio médico le volverá a contactar.</li>
<li>Sus datos son reservados: solo los ve el personal de salud y no se usan para otro fin (Ley de Telesalud).</li>
<li>Los récipes, órdenes e informes se le envían como documentos firmados por el médico.</li>
<li>Puede no aceptar y pedir una consulta en persona.</li>
</ul></div>
<form method="post"><button type="submit">Acepto</button></form>
<p class="nota">Al pulsar «Acepto» queda registrado que leyó y aceptó estas condiciones, con la fecha y la hora.</p>`);
}

export async function POST(_: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const supabase = cliente();
  if (!supabase || !tokenValido(token)) return noDisponible();
  const { data } = await supabase.rpc("aceptar_consentimiento_tele", { p_token: token });
  const d = await ver(token);
  if ((data === "ok" || data === "ya") && d) return aceptado(d);
  return noDisponible(d);
}
