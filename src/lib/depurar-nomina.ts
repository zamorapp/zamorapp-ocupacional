// Depurar la nómina con RR. HH. por un enlace sin cuenta (Cesar, 12-nov-2026). Tipos y reglas comunes a la página
// pública (/nomina/<token>) y a la revisión de Cesar en la ficha de la empresa. La base valida todo de nuevo.

export const TOKEN_DEPURACION = /^[0-9a-f]{32}$/;
/** Enlace de muestra cuando no hay Supabase (vista previa y pruebas de pantalla): nada se guarda. */
export const TOKEN_DEMO_NOMINA = "de".repeat(16);
/** Secreto del aparato que abrió el enlace (galleta httpOnly); la base guarda solo su sha256. */
export const DISPOSITIVO = /^[0-9a-f]{64}$/;
export const galletaNomina = (token: string) => `nomina_${token.slice(0, 12)}`;
export const MOTIVOS_SALIDA = ["Renunció", "Despido", "Fin de contrato", "Otro"] as const;
export type MotivoSalida = (typeof MOTIVOS_SALIDA)[number];

export type Marca = { e: "si" | "no"; m?: MotivoSalida };
export type Agregado = { id: string; nombres: string; apellidos: string; cedula?: string; cargo?: string };

/** Lo que ve RR. HH. */
export type VistaDepuracion = {
  estado: "vigente" | "vencido" | "anulado" | "aplicado";
  /** ok: este teléfono ya entró · telefono: falta escribir el teléfono · telefono_otro: otro aparato ya lo abrió · bloqueado */
  acceso: "ok" | "telefono" | "telefono_otro" | "bloqueado";
  rrhh: string;
  servicio: string;
  empresa: string | null;
  vence: string;
  enviado_en: string | null;
  respuestas: Record<string, Marca>;
  agregados: Agregado[];
  trabajadores: { id: string; nombre: string; cargo: string | null; departamento: string | null; ci: string }[];
};

/** Lo que ve Cesar para confirmar. */
export type RevisionDepuracion = {
  id: string;
  token: string | null;
  estado: VistaDepuracion["estado"];
  creado_en: string;
  vence: string;
  enviado_en: string | null;
  actualizado_en: string | null;
  aplicado_en: string | null;
  lote_id: string | null;
  rrhh_nombre: string | null;
  telefono_fin: string;
  abierto_en: string | null;
  bloqueado: boolean;
  intentos: number;
  en_nomina: number;
  siguen: number;
  no_estan: {
    id: string; nombre: string; cedula: string; cargo: string | null; motivo: MotivoSalida | null; en_nomina: boolean; estado: string;
    egreso: { fecha: string; hecha: boolean } | null; cita_egreso: string | null;
  }[];
  agregados: (Agregado & { registrado: { id: string; nombre: string; estado: string; misma_empresa: boolean } | null })[];
};

/** «V-12.345.678» o «12345678» → «12345678» (como lo guarda el enlace). */
export const soloNumeros = (v: string) => v.replace(/\D/g, "");

const FORMATO_VENCE = new Intl.DateTimeFormat("es-VE", { timeZone: "America/Caracas", weekday: "long", day: "2-digit", month: "2-digit", year: "numeric" });
/** «jueves, 19/11/2026» (hora de Caracas). */
export const venceTexto = (iso: string) => FORMATO_VENCE.format(new Date(iso));
/** 2026-11-12 → 12/11/2026 */
export const dma = (iso: string | null | undefined) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "");

const NOMBRES = ["José Gregorio González Pérez", "María Alejandra Rondón Lara", "Carlos Eduardo Zapata", "Yusmary Guevara", "Luis Miguel Velásquez",
  "Ana Karina Marcano", "Pedro José Cedeño", "Daniela Rodríguez", "Jesús Rafael Figueroa", "Rosa Elena Campos", "Wilmer Bermúdez", "Yelitza Natera"];
const CARGOS: [string, string][] = [["Operador de equipo pesado", "Obras"], ["Electricista", "Mantenimiento"], ["Vigilante", "Seguridad"], ["Almacenista", "Logística"],
  ["Soldador", "Taller"], ["Chofer", "Transporte"], ["Supervisor", "Obras"], ["Ayudante", "Obras"], ["Analista de nómina", "RR. HH."], ["Albañil", "Obras"]];
/** Datos inventados para la vista de muestra. */
export function vistaDemoNomina(vence: string): VistaDepuracion {
  const trabajadores = NOMBRES.map((nombre, i) => ({
    id: `00000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`, nombre, cargo: CARGOS[i % CARGOS.length][0], departamento: CARGOS[i % CARGOS.length][1],
    ci: String(1000 + ((i * 7919) % 9000)),
  }));
  return {
    estado: "vigente", acceso: "ok", rrhh: "Daniela", servicio: "OcupaVida Salud Ocupacional", empresa: "Constructora Ejemplo, C.A.", vence, enviado_en: null, trabajadores,
    respuestas: { [trabajadores[0].id]: { e: "si" }, [trabajadores[1].id]: { e: "si" }, [trabajadores[5].id]: { e: "no", m: "Renunció" } },
    agregados: [{ id: "00000000-0000-4000-8000-0000000000a1", nombres: "Ana Lucía", apellidos: "Patiño", cedula: "30112458", cargo: "Secretaria" }],
  };
}
