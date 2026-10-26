-- zamorApp Ocupacional · Indicadores del Inicio calculados en la base
-- Con miles de trabajadores, traerlos todos para contar era lento. Respeta las reglas de acceso (security invoker).
create or replace function public.resumen_panel(p_empresa uuid default null)
returns jsonb language sql stable security invoker set search_path = public as $$
  with t as (
    select t.id, t.estado, u.clasificacion, u.vigente_hasta
    from public.trabajadores t
    left join public.ultima_aptitud u on u.trabajador_id = t.id
    where p_empresa is null or t.empresa_id = p_empresa
  ),
  hoy as (select (now() at time zone 'America/Caracas')::date d)
  select jsonb_build_object(
    'activos', count(*) filter (where estado in ('activo', 'reposo')),
    'en_reposo', count(*) filter (where estado = 'reposo'),
    'al_dia', count(*) filter (where estado in ('activo', 'reposo') and vigente_hasta >= hoy.d),
    'vencidos', count(*) filter (where estado in ('activo', 'reposo') and vigente_hasta < hoy.d),
    'por_vencer', count(*) filter (where estado in ('activo', 'reposo') and vigente_hasta between hoy.d and hoy.d + 30),
    'sin_evaluar', count(*) filter (where clasificacion is null and estado not in ('egresado', 'inactivo')),
    'aspirantes', count(*) filter (where clasificacion is null and estado = 'aspirante'),
    'aptitud', jsonb_build_object(
      'elegible', count(*) filter (where clasificacion = 'elegible'),
      'elegible_con_restricciones', count(*) filter (where clasificacion = 'elegible_con_restricciones'),
      'no_elegible', count(*) filter (where clasificacion = 'no_elegible'),
      'espera_resultados', count(*) filter (where clasificacion = 'espera_resultados'),
      'diferido', count(*) filter (where clasificacion = 'diferido')))
  from t, hoy
  group by hoy.d
$$;
grant execute on function public.resumen_panel(uuid) to authenticated;
