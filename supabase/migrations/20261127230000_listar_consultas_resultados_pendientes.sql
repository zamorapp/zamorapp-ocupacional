-- Misma ventana y definición de pendiente que «Resultados por recibir» en inicio_conteos.
create function public.listar_consultas_resultados_pendientes(p_fecha date default null, p_consulta uuid default null)
returns table (id uuid, fecha date, estado text, paciente text, empresa text, pendientes integer)
language sql stable security invoker set search_path = ''
as $$
  select c.id, c.fecha, c.estado::text,
         coalesce(nullif(concat_ws(' ', t.nombres, t.apellidos), ''), 'Trabajador'),
         coalesce(e.razon_social, ''), p.total::integer
    from public.consultas c
    left join public.trabajadores t on t.id = c.trabajador_id
    left join public.empresas e on e.id = c.empresa_id
    cross join lateral (
      select count(*) as total
      from jsonb_array_elements(case when jsonb_typeof(c.paraclinicos) = 'array' then c.paraclinicos else '[]'::jsonb end) x
      where btrim(coalesce(x ->> 'resultado', '')) = '' and coalesce(x ->> 'estado', '') = ''
    ) p
   where c.origen is null and c.fecha >= public.hoy_caracas() - 60 and p.total > 0
     and public.es_clinico(c.org_id)
     and (c.medico_id = auth.uid() or public.mi_rol(c.org_id) in ('administrador', 'gerente_medico'))
     and (p_fecha is null or (c.fecha, c.id) > (p_fecha, p_consulta))
   order by c.fecha, c.id
   limit 51;
$$;
revoke execute on function public.listar_consultas_resultados_pendientes(date,uuid) from public, anon;
grant execute on function public.listar_consultas_resultados_pendientes(date,uuid) to authenticated;
