export const APP_NOMBRE = "zamorApp Ocupacional";
export const APP_NOMBRE_CORTO = "zamorApp";

export const supabaseConfigurado = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
);
