import "server-only";
import { createClient } from "@supabase/supabase-js";

// Cliente anónimo y sin sesión, para las páginas públicas con token (/registro/<token>): la base decide con el token.
// Nunca service_role.
export function clienteAnonimo() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const clave = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !clave) return null;
  return createClient(url, clave, { auth: { persistSession: false, autoRefreshToken: false } });
}
