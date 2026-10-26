// Configuración de la puerta local. La ventana (Tauri) la arranca con estas variables de entorno.
import path from "node:path";

const env = process.env;

export const CONFIG = {
  datos: env.ZAMORAPP_DATOS || path.join(env.LOCALAPPDATA || env.HOME || ".", "zamorApp", "datos"),
  nube: (env.ZAMORAPP_NUBE_URL || "").replace(/\/$/, ""),
  nubeAnon: env.ZAMORAPP_NUBE_ANON || "",
  llave: env.ZAMORAPP_LLAVE || "", // 64 hex; la guarda Windows (Administrador de credenciales)
  // Puertos propios, solo en 127.0.0.1. Nunca 1433 (SQL Server del SAME) ni 5432.
  puertoPuerta: Number(env.PUERTO_PUERTA || 54331),
  puertoPostgrest: Number(env.PUERTO_POSTGREST || 54330),
  puertoBase: Number(env.PUERTO_BASE || 54329),
  pgBin: env.ZAMORAPP_PG_BIN || "", // carpeta con initdb, pg_ctl, postgres
  postgrest: env.ZAMORAPP_POSTGREST || "postgrest",
  migraciones: env.ZAMORAPP_MIGRACIONES || path.resolve("supabase/migrations"),
  baseExtra: env.ZAMORAPP_BASE_EXTRA || path.resolve("escritorio/base"),
  stubs: env.ZAMORAPP_STUBS || path.resolve("supabase/pruebas/00_stubs_supabase.sql"),
  // Reglas de seguridad acordadas
  diasSinConexion: 7,
  sesionSegundos: 3600,
  cadaSincronia: 30_000,
};

// Funciones de la base que solo leen: se pueden usar sin conexión contra la copia local.
export const RPC_LECTURA = new Set([
  "buscar_diagnosticos", "firma_sello", "indices_accidentalidad", "miembros_con_correo",
  "reporte_vigilancia", "resumen_panel",
]);

// Tablas que se copian a la PC: las que sincronizan (sync.tablas) más catálogos de solo bajada.
export const CATALOGOS = [
  "public.organizaciones", "public.perfiles", "public.listas", "public.cie10",
  "public.precios_empresa", "public.tasas_bcv",
];
