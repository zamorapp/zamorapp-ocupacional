-- Estas funciones puras solo dependen de tipos y operadores de PostgreSQL.
alter function public.depuracion_huella(text) set search_path = pg_catalog;
alter function public.depuracion_motivos() set search_path = pg_catalog;
alter function public.depuracion_telefono(text) set search_path = pg_catalog;
alter function public.faltan_ficha_registro(public.trabajadores) set search_path = pg_catalog;
alter function public.lista_clinica(text) set search_path = pg_catalog;
alter function public.nomina_campos() set search_path = pg_catalog;
alter function public.normalizar_usuario(text) set search_path = pg_catalog;
alter function public.ultimos_cedula(public.trabajadores) set search_path = pg_catalog;
alter function sync.vacio(jsonb) set search_path = pg_catalog;
