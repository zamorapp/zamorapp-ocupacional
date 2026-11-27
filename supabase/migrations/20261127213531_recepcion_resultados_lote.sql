-- La entrada por lote confirma una sola consulta cerrada y registra resultados y bitácora juntos.
create function public.guardar_lectura_lote(
  p_consulta uuid, p_adjunto uuid, p_anteriores jsonb, p_resultados jsonb,
  p_cedula text, p_coincide boolean, p_ignorada boolean
) returns void
language plpgsql security invoker set search_path = ''
as $$
declare
  c record;
  rubros integer;
begin
  select id, estado, paraclinicos, org_id, trabajador_id into c
  from clinico.consultas where id = p_consulta for update;
  if not found or c.estado <> 'cerrada' then
    raise exception 'La consulta debe estar cerrada y sin firma para recibir resultados del lote.';
  end if;
  if c.paraclinicos is distinct from p_anteriores then
    raise exception 'Los resultados cambiaron desde que abriste el lote. Vuelve a consultar los exámenes.';
  end if;
  if p_adjunto is null or not exists (
    select 1 from clinico.adjuntos a
    where a.id = p_adjunto and a.consulta_id = p_consulta and a.org_id = c.org_id
      and a.trabajador_id = c.trabajador_id and a.tipo_mime = 'application/pdf'
  ) then
    raise exception 'El PDF no pertenece a esta consulta.';
  end if;
  if jsonb_typeof(p_resultados) is distinct from 'array' or not (coalesce(p_coincide, false) or coalesce(p_ignorada, false)) then
    raise exception 'Confirma el paciente y los resultados antes de registrar.';
  end if;
  rubros := jsonb_array_length(p_resultados);
  if rubros = 0 or rubros > 100
     or (select count(distinct r->>'id') from jsonb_array_elements(p_resultados) r) <> rubros
     or exists (
       select 1 from jsonb_array_elements(p_resultados) r
       where trim(coalesce(r->>'resultado', '')) = '' or not exists (
         select 1 from jsonb_array_elements(c.paraclinicos) e where e->>'id' = r->>'id'
       )
     ) then
    raise exception 'Selecciona solo exámenes solicitados con resultado.';
  end if;
  perform public.guardar_resultados(p_consulta, p_resultados);
  perform public.registrar_lectura_laboratorio(p_consulta, p_adjunto, p_cedula, p_coincide, p_ignorada, rubros);
end $$;

revoke execute on function public.guardar_lectura_lote(uuid,uuid,jsonb,jsonb,text,boolean,boolean) from public, anon;
grant execute on function public.guardar_lectura_lote(uuid,uuid,jsonb,jsonb,text,boolean,boolean) to authenticated;
