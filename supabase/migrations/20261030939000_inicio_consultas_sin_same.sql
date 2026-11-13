-- zamorApp Ocupacional · Inicio: «Consultas abiertas» y «Por firmar» sin las consultas traídas del SAME
-- 13-nov Cesar vio «3» en el Inicio y al tocar la tarjeta no encontraba esas 3: una era un borrador de 2023 traído
-- del SAME y la tarjeta llevaba a Atención médica (30 días, empresa activa). Ahora el número y la lista
-- (/atencion?ver=abiertas|por-firmar) usan la MISMA regla: estado, sin origen, todas las empresas, solo las mías
-- si el rol no es administrador ni gerente médico. Mismo cuerpo que 20261030130000 salvo «c.origen is null».

create or replace function public.inicio_conteos(p_empresa uuid default null, p_solo_mias boolean default false, p_clinico boolean default false)
returns jsonb language plpgsql stable security invoker set search_path = public as $$
declare
  v_hoy date := public.hoy_caracas();
  v_yo uuid := auth.uid();
  v_tareas jsonb;
  v_venc jsonb;
begin
  select jsonb_build_object(
    'citados', count(*) filter (where c.fecha = v_hoy and c.estado = 'citado'),
    'en_espera', count(*) filter (where c.fecha = v_hoy and c.estado = 'en_espera'),
    'solicitadas', count(*) filter (where c.estado = 'solicitada' and c.fecha >= v_hoy)
  ) into v_tareas
  from public.citas c
  where c.fecha = v_hoy or c.estado = 'solicitada';

  v_tareas := v_tareas || jsonb_build_object(
    'eventos_abiertos', (select count(*) from public.eventos e where e.estado <> 'cerrado'),
    'por_cobrar', (select count(*) from public.cobros b where b.estado = 'emitida'));

  if p_clinico then
    v_tareas := v_tareas || (
      select jsonb_build_object(
        'por_firmar', count(*) filter (where c.estado = 'cerrada'),
        'abiertas', count(*) filter (where c.estado = 'borrador'))
      from public.consultas c
      where c.estado in ('cerrada', 'borrador')
        and c.origen is null  -- las traídas del SAME son historia: no se firman ni se cierran aquí
        and (not p_solo_mias or c.medico_id = v_yo)
    ) || jsonb_build_object('por_recibir', (
      -- Exámenes sin resultado ni estado en consultas de los últimos 60 días (las importadas del SAME no cuentan)
      select count(*)
      from public.consultas c
      cross join lateral jsonb_array_elements(case when jsonb_typeof(c.paraclinicos) = 'array' then c.paraclinicos else '[]'::jsonb end) p
      where c.origen is null and c.fecha >= v_hoy - 60
        and (not p_solo_mias or c.medico_id = v_yo)
        and btrim(coalesce(p ->> 'resultado', '')) = '' and coalesce(p ->> 'estado', '') = ''));
  end if;

  select coalesce(jsonb_agg(x), '[]') into v_venc
  from jsonb_array_elements(public.vencimientos_empresas()) x
  where p_empresa is null or x ->> 'id' = p_empresa::text;

  return jsonb_build_object('resumen', public.resumen_panel(p_empresa), 'vencimientos', v_venc, 'tareas', v_tareas);
end
$$;
revoke all on function public.inicio_conteos(uuid, boolean, boolean) from public, anon;
grant execute on function public.inicio_conteos(uuid, boolean, boolean) to authenticated;
