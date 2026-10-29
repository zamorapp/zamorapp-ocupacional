-- zamorApp Ocupacional · Números de las pestañas de Envíos en una sola consulta (auditoría 28-oct: pestañas más rápidas)
-- Antes, cada pestaña armaba la bandeja «Por enviar» completa y contaba los correos pendientes en dos viajes.
-- Corre con los permisos de quien llama (RLS de consultas, aptitudes y envíos), así que cada rol cuenta solo lo suyo.
create or replace function public.contar_envios(p_dias int default 14, p_espera_min int default 10)
returns table (por_enviar int, pendientes int)
language sql stable security invoker set search_path = public as $$
  with desde as (select ((now() at time zone 'America/Caracas')::date - p_dias) as d)
  select
    (select count(*)::int
       from public.consultas c
       join public.aptitudes a on a.consulta_id = c.id
      where c.estado = 'firmada'
        and c.fecha >= (select d from desde)
        and not exists (select 1 from public.envios e
                         where e.consultas @> array[c.id] and e.estado <> 'fallido'
                           and e.fecha_lote >= (select d from desde))),
    (select count(*)::int
       from public.envios e
      where e.canal = 'correo'
        and e.creado_en >= now() - interval '30 days'
        and (e.estado = 'fallido' or (e.estado = 'enviando' and e.creado_en < now() - make_interval(mins => p_espera_min)))
        and not exists (select 1 from public.envios h where h.reintento_de = e.id));
$$;
revoke all on function public.contar_envios(int, int) from public, anon;
grant execute on function public.contar_envios(int, int) to authenticated;
