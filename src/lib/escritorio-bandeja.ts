// zamorApp Escritorio: «Conflictos y rechazados». Lo que se guardó en la PC y la nube no aceptó queda en la
// bandeja de la puerta local (GET /zamorapp/bandeja); quien lo escribió, un administrador o el gerente médico decide
// (POST /zamorapp/bandeja/resolver): quedarse con la nube (descartar) o volver a subir lo de la PC (reintentar).
// Las funciones de texto y comparación no dependen del navegador: las prueba scripts/pruebas/escritorio-bandeja.test.mjs.
import { ESCRITORIO } from "@/lib/escritorio-actualizar";

const PUERTA = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";

export type CasoBandeja = {
  id: string;
  tabla: string;
  fila_id: string;
  op: "I" | "U" | "D";
  estado: "conflicto" | "rechazado";
  motivo: string | null;
  autor: string | null;
  autorNombre: string | null;
  creado: string;
  intentos: number;
  datos: Record<string, unknown>;
  nube: Record<string, unknown> | null;
};

export type ListaBandeja = { pendientes: number; revisar: CasoBandeja[] };

async function token(): Promise<string | null> {
  const { crearClienteNavegador } = await import("@/lib/supabase/client");
  const { data } = await crearClienteNavegador().auth.getSession();
  return data.session?.access_token ?? null;
}

export async function leerBandeja(): Promise<ListaBandeja | null> {
  if (!ESCRITORIO || !PUERTA) return null;
  try {
    const t = await token();
    if (!t) return null;
    const r = await fetch(`${PUERTA}/zamorapp/bandeja`, { headers: { Authorization: `Bearer ${t}` }, cache: "no-store" });
    return r.ok ? ((await r.json()) as ListaBandeja) : null;
  } catch {
    return null;
  }
}

export async function resolverCaso(id: string, accion: "descartar" | "reintentar"): Promise<{ ok: boolean; mensaje: string }> {
  try {
    const t = await token();
    if (!t) return { ok: false, mensaje: "Tu sesión venció. Vuelve a entrar." };
    const r = await fetch(`${PUERTA}/zamorapp/bandeja/resolver`, {
      method: "POST",
      headers: { Authorization: `Bearer ${t}`, "Content-Type": "application/json" },
      body: JSON.stringify({ id, accion }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return { ok: false, mensaje: j?.message ?? "No se pudo resolver." };
    return { ok: true, mensaje: accion === "descartar" ? "Listo: quedó la versión de la nube." : "Listo: tu versión se vuelve a subir con la próxima sincronización." };
  } catch {
    return { ok: false, mensaje: "El programa no respondió. Intenta de nuevo." };
  }
}

// Avisa a la pantalla y al encabezado que la lista cambió (sin esperar al próximo repaso)
export const EVENTO_BANDEJA = "zamorapp-bandeja";

// ─── Textos ──────────────────────────────────────────────────

const TABLAS: Record<string, string> = {
  "clinico.consultas": "Consulta",
  "clinico.diagnosticos": "Diagnóstico",
  "clinico.aptitudes": "Aptitud",
  "clinico.reposos": "Reposo",
  "clinico.adjuntos": "Archivo adjunto",
  "clinico.historia_laboral": "Historia laboral",
  "clinico.investigaciones": "Investigación de accidente",
  "public.trabajadores": "Trabajador",
  "public.citas": "Cita",
  "public.empresas": "Empresa",
  "public.sedes": "Sede",
  "public.dependencias": "Dependencia",
  "public.puestos": "Puesto de trabajo",
  "public.eventos": "Accidente o evento",
  "public.horas_trabajadas": "Horas trabajadas",
  "public.cobros": "Cobro",
  "public.cobro_items": "Renglón de cobro",
  "public.servicios": "Servicio",
  "public.lista_items": "Elemento de lista",
  "public.miembros": "Usuario del equipo",
  "public.empresa_contactos": "Contacto de empresa",
  "public.plantillas_correo": "Plantilla de correo",
  "public.envios": "Envío a empresa",
  "public.solicitudes": "Solicitud",
};

export function nombreTabla(tabla: string): string {
  return TABLAS[tabla] ?? tabla.split(".").pop()!.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
}

export function nombreOperacion(op: string): string {
  return op === "I" ? "creó" : op === "D" ? "borró" : "cambió";
}

// Por qué falló, en palabras del consultorio, y qué conviene hacer. El texto técnico se conserva aparte.
export function explicarMotivo(motivo: string | null, estado: string): { titulo: string; texto: string } {
  const m = (motivo ?? "").toLowerCase();
  if (m.includes("ficha clínica cambió") || m.includes("mismos campos") || m.includes("contenido distinto"))
    return { titulo: "Se cambió en dos lugares a la vez", texto: "Mientras esta PC estaba sin internet, alguien cambió lo mismo desde otro equipo o la web. La nube conservó lo suyo; compara y elige cuál queda." };
  if (m.includes("editó en otro lugar"))
    return { titulo: "Se borró aquí, pero se editó en otro lugar", texto: "Lo que borraste en esta PC fue editado en otro equipo. Para no perder esa edición, la nube no lo borró." };
  if (m.includes("firmada") || m.includes("sin permiso para modificarla"))
    return { titulo: "La consulta ya estaba firmada", texto: "Una consulta firmada no se cambia. Lo que escribiste en esta PC queda a la vista aquí, por si hace falta copiarlo a una consulta nueva." };
  if (m.includes("sin permiso para borrarla"))
    return { titulo: "No tienes permiso para borrarlo", texto: "Tu usuario no puede borrar este registro en la nube. Pídeselo a un administrador." };
  if (m.includes("no existe o no tienes acceso") || m.includes("foreign key") || m.includes("llave foránea") || m.includes("violates foreign"))
    return { titulo: "Falta algo de lo que depende", texto: "Este cambio usa un registro que aún no llegó a la nube (por ejemplo, un trabajador creado en otra PC). Cuando ese registro suba, toca «Volver a subir»." };
  if (m.includes("ya existe") || m.includes("duplicate") || m.includes("unique"))
    return { titulo: "Ya existe uno igual", texto: "En la nube ya hay un registro con los mismos datos únicos (por ejemplo, la misma cédula). Revisa si es el mismo y quédate con uno." };
  if (m.includes("organización"))
    return { titulo: "Es de otra organización", texto: "Este registro no pertenece a la organización de este equipo. Lo normal es quedarse con la versión de la nube." };
  if (m.includes("no respondió"))
    return { titulo: "La nube no respondió", texto: "Se intentó varias veces sin respuesta. Si ya hay internet, toca «Volver a subir»." };
  if (m.includes("no se modifica desde un equipo"))
    return { titulo: "Esto solo se cambia en la web", texto: "Este tipo de registro no se cambia desde el programa de escritorio. Hazlo en la web; aquí queda la versión de la nube." };
  return estado === "conflicto"
    ? { titulo: "Cambió en otro lugar", texto: "La nube tiene otra versión. Compara y elige cuál queda." }
    : { titulo: "La nube no aceptó el cambio", texto: "Revisa el detalle técnico. Si ya lo corregiste, toca «Volver a subir»; si no hace falta, quédate con la versión de la nube." };
}

// ─── Comparación lado a lado ────────────────────────────────

const OCULTOS = new Set(["id", "org_id", "version", "creado_en", "actualizado_en", "creado_por", "actualizado_por"]);

const ETIQUETAS: Record<string, string> = {
  motivo_texto: "Motivo de consulta",
  enfermedad_actual: "Enfermedad actual",
  telefono: "Teléfono",
  correo: "Correo",
  cedula: "Cédula",
  nombres: "Nombres",
  apellidos: "Apellidos",
  fecha_nacimiento: "Fecha de nacimiento",
  observaciones: "Observaciones",
  conclusion: "Conclusión",
  resultado: "Resultado",
  estado: "Estado",
  fecha: "Fecha",
  hora: "Hora",
  cie10: "CIE-10",
  descripcion: "Descripción",
  dias: "Días",
  desde: "Desde",
  hasta: "Hasta",
};

export function etiquetaCampo(campo: string): string {
  return ETIQUETAS[campo] ?? campo.replace(/_id$/, "").replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
}

const HORA_CARACAS = new Intl.DateTimeFormat("es-VE", { timeZone: "America/Caracas", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

export function textoValor(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "boolean") return v ? "Sí" : "No";
  if (typeof v === "string") {
    // Hora con zona (la base corre en UTC): se muestra en hora de Caracas
    if (/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}(:?\d{2})?)$/.test(v)) {
      const d = new Date(v.replace(" ", "T").replace(/([+-]\d{2})$/, "$1:00"));
      if (!Number.isNaN(d.getTime())) return HORA_CARACAS.format(d).replace(",", "");
    }
    const f = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/.exec(v);
    if (f && v.length <= 32) return `${f[3]}/${f[2]}/${f[1]}${f[4] ? ` ${f[4]}:${f[5]}` : ""}`;
    return v;
  }
  if (Array.isArray(v)) return v.length ? v.map(textoValor).join(", ") : "—";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

export type FilaComparada = { campo: string; etiqueta: string; pc: string; nube: string; distinto: boolean };

// Un renglón por campo que escribió la PC (sin los técnicos); los distintos primero
export function comparar(datos: Record<string, unknown>, nube: Record<string, unknown> | null): FilaComparada[] {
  const filas = Object.keys(datos ?? {})
    .filter((k) => !OCULTOS.has(k))
    .map((k) => {
      const pc = textoValor(datos[k]);
      const n = nube ? textoValor(nube[k]) : "—";
      return { campo: k, etiqueta: etiquetaCampo(k), pc, nube: n, distinto: !nube || pc !== n };
    });
  return filas.sort((a, b) => Number(b.distinto) - Number(a.distinto));
}
