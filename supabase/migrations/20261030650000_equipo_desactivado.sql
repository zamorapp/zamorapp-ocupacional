-- zamorApp · Celular sin internet: borrado remoto aunque la sesión del teléfono ya venció (Analizar, 30-oct).
-- El teléfono guarda su id de equipo (no es secreto; el secreto va cifrado con el PIN) y, antes de pedir el PIN,
-- pregunta si fue desactivado en Configuración › Equipos. Sin sesión: solo responde true cuando el equipo existe y
-- está desactivado; para cualquier otro id (activo, inexistente, inventado) responde false, sin decir nada más.
create or replace function public.equipo_desactivado(p_equipo uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.equipos e where e.id = p_equipo and not e.activo)
$$;
revoke all on function public.equipo_desactivado(uuid) from public;
grant execute on function public.equipo_desactivado(uuid) to anon, authenticated;
