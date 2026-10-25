import { cookies } from "next/headers";

export const COOKIE_EMPRESA = "empresa_activa";

// Empresa elegida en el selector del encabezado; null = todas.
export async function empresaActivaId(): Promise<string | null> {
  return (await cookies()).get(COOKIE_EMPRESA)?.value || null;
}
