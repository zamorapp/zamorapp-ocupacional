import "server-only";
import { supabaseConfigurado } from "@/lib/config";
import { crearClienteServidor } from "@/lib/supabase/server";

// Envío automático de constancias por empresa (Cesar, 31-oct): lo que muestra la ficha de la empresa
export type EnvioAuto = {
  activo: boolean;
  hora: number; // hora de Caracas del correo diario
  ultimoEnvio: string | null;
  claveLista: boolean; // la nube ya reconoce a la organización para mandar el correo sin sesión
  enviadas: { consultaId: string; trabajador: string; fecha: string; enviadaEn: string; enviadaA: string[] }[];
};

export const ROLES_ENVIO_AUTO = ["administrador", "gerente_medico", "medico"];
export const HORA_ENVIO_AUTO = 17;

export async function envioAutoEmpresa(empresaId: string, orgId: string): Promise<EnvioAuto | null> {
  if (!supabaseConfigurado) return null;
  const supabase = await crearClienteServidor();
  // Vive solo en la nube: en el escritorio sin internet falla y la tarjeta lo dice (no se puede cambiar sin conexión)
  const [fila, clave, enviadas] = await Promise.all([
    supabase.from("empresa_envio_auto").select("activo, hora, ultimo_envio").eq("empresa_id", empresaId).maybeSingle(),
    supabase.rpc("clave_servidor_anotada", { p_org: orgId }),
    supabase.rpc("constancias_enviadas_auto", { p_empresa: empresaId }),
  ]);
  if (fila.error) return null;
  return {
    activo: Boolean(fila.data?.activo),
    hora: fila.data?.hora ?? HORA_ENVIO_AUTO,
    ultimoEnvio: fila.data?.ultimo_envio ?? null,
    claveLista: Boolean(clave.data),
    enviadas: ((enviadas.data ?? []) as { consulta_id: string; trabajador: string; fecha: string; enviada_en: string; enviada_a: string[] | null }[]).slice(0, 10).map((e) => ({
      consultaId: e.consulta_id,
      trabajador: e.trabajador,
      fecha: e.fecha,
      enviadaEn: e.enviada_en,
      enviadaA: e.enviada_a ?? [],
    })),
  };
}
