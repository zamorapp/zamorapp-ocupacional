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
  arranquesSinConexion: 7, // arranques seguidos del programa sin nube que se toleran (reloj sin ancla)
  sesionSegundos: 3600,
  reusoRefrescoMs: 30_000, // un refresco ya usado entrega la misma sesión durante este margen
  cadaSincronia: 30_000,
  // Con internet, las lecturas salen de la copia local cuando está al día (sincronizada hace menos de
  // frescuraLectura y sin escrituras pendientes de bajar): la pantalla no paga el viaje a la nube (C11).
  lecturaLocal: env.ZAMORAPP_LECTURA_LOCAL !== "0",
  frescuraLectura: Number(env.ZAMORAPP_FRESCURA_LECTURA || 60_000),
  // Fase A (local primero): lo que se guarda en tablas que sincronizan se escribe en la base local al instante y
  // sube a la nube por la bandeja de salida (con o sin internet). Lo demás sigue yendo a la nube.
  escrituraLocal: env.ZAMORAPP_ESCRITURA_LOCAL !== "0",
  // Tope diario de la bajada de adjuntos en segundo plano: el plan gratis de Supabase da 5 GB de salida al mes
  bajadaDiariaMb: Number(env.ZAMORAPP_BAJADA_DIARIA_MB) > 0 ? Number(env.ZAMORAPP_BAJADA_DIARIA_MB) : 300,
};

// Funciones que escriben SOLO en tablas que sincronizan (sync.tablas.subible): corren en la base local y sus
// cambios suben por la bandeja. Una función que toque otra tabla (versiones, recordatorios, accesos) va a la nube.
export const RPC_ESCRITURA_LOCAL = new Set(["guardar_consulta", "firmar_consulta", "reabrir_consulta", "guardar_resultados", "duplicar_consulta"]);

// Constancias: funciones que solo dejan rastro (bitácora de la lectura de laboratorio, quién abrió la historia). Sin
// internet se validan en la copia local con las reglas de la base y quedan en local.constancias; la bandeja las sube
// después por constancia_diferida() con la hora de la PC (si estaba verificada). Así leer resultados no se frena.
// recordar_resultados (la campana de resultados pendientes) también: sus avisos salen en la PC al momento y, al subir,
// la nube la vuelve a calcular y la PC borra los suyos (bandeja.mjs).
export const RPC_CONSTANCIA = new Set(["registrar_lectura_laboratorio", "registrar_acceso", "recordar_resultados"]);

// Funciones de la base que solo leen: se pueden usar sin conexión contra la copia local.
export const RPC_LECTURA = new Set([
  "buscar_diagnosticos", "firma_sello", "indices_accidentalidad", "miembros_con_correo",
  "reporte_vigilancia", "requiere_dos_pasos", "falta_segundo_paso", "resumen_panel",
]);

// Tablas que se copian a la PC: las que sincronizan (sync.tablas) más catálogos de solo bajada.
export const CATALOGOS = [
  "public.organizaciones", "public.perfiles", "public.listas", "public.cie10",
  "public.precios_empresa", "public.tasas_bcv",
];
