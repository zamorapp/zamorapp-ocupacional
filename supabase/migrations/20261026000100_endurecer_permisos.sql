-- zamorApp Ocupacional · Endurecer permisos
-- 1) Los visitantes sin sesión (anon) no tocan ninguna tabla ni función: solo usan la pantalla de ingreso.
-- 2) Funciones internas (las usan los disparadores) dejan de poder llamarse desde la API:
--    notificar() y copiar_listas_base() aceptaban cualquier organización.
-- 3) tocar_actualizado con search_path fijo.

revoke all on all tables in schema public, clinico from anon;
revoke all on all sequences in schema public, clinico from anon;
revoke execute on all functions in schema public, clinico from anon, public;
alter default privileges in schema public, clinico revoke all on tables from anon;
alter default privileges in schema public, clinico revoke execute on functions from anon, public;

-- El personal con sesión conserva lo que ya usaba (reglas RLS y llamadas de la app)…
grant execute on all functions in schema public, clinico to authenticated;
alter default privileges in schema public, clinico grant execute on functions to authenticated;

-- …salvo las funciones que solo deben usar los disparadores
revoke execute on function public.notificar(uuid, uuid, text, text, text, text) from authenticated;
revoke execute on function public.copiar_listas_base(uuid) from authenticated;

alter function public.tocar_actualizado() set search_path = public;
