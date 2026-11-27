\pset tuples_only on
begin;

update clinico.consultas set estado='cerrada',
  paraclinicos='[{"id":"hb","nombre":"Hemoglobina","resultado":""},{"id":"glu","nombre":"Glucosa","resultado":""},{"id":"otro","nombre":"Otro examen","resultado":""}]'
where id in ('40000000-0000-0000-0000-00000000000a','40000000-0000-0000-0000-00000000000b');

set local role authenticated;
do $$
declare
  a constant uuid := '40000000-0000-0000-0000-00000000000a';
  b constant uuid := '40000000-0000-0000-0000-00000000000b';
  ra constant uuid := '28500000-0000-0000-0000-00000000000a';
  rb constant uuid := '28500000-0000-0000-0000-00000000000b';
begin
  if has_table_privilege('authenticated','clinico.remisiones_examenes','INSERT')
     or has_function_privilege('anon','public.anotar_remision_examenes(uuid,text[])','EXECUTE') then
    raise exception 'Se permitió modificar remisiones por una ruta no autorizada';
  end if;
  perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',true);
  perform public.preparar_remision_examenes(rb,b,'Prestador B ficticio',array['hb']);

  perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',true);
  if exists (select from public.listar_remisiones_examenes(null,rb)) then
    raise exception 'El médico limitado pudo ver otra empresa';
  end if;
  begin
    perform public.anotar_remision_examenes(rb);
    raise exception 'El médico limitado pudo marcar un envío de otra empresa';
  exception when insufficient_privilege then null;
  end;

  perform public.preparar_remision_examenes(ra,a,'Prestador A ficticio',array['hb','glu']);
  if public.preparar_remision_examenes(ra,a,'Prestador A ficticio',array['glu','hb']) is distinct from ra
    or (select jsonb_array_length(examenes) from public.listar_remisiones_examenes(null,ra)) is distinct from 2 then
    raise exception 'La remisión no se conservó al reintentar la misma preparación';
  end if;
  begin
    perform public.anotar_remision_examenes(ra,array['hb']);
    raise exception 'Se permitió recibir antes de enviar';
  exception when raise_exception then
    if sqlerrm not like 'Registra primero el envío%' then raise; end if;
  end;
  if public.anotar_remision_examenes(ra) <> 1 then raise exception 'Falló el registro del envío'; end if;
  if public.anotar_remision_examenes(ra) <> 0 then raise exception 'El reintento reemplazó el envío original'; end if;
  begin
    perform public.anotar_remision_examenes(ra,array['hb','otro']);
    raise exception 'Se permitió recibir un examen ajeno a la remisión';
  exception when raise_exception then
    if sqlerrm not like 'Selecciona solo exámenes de esta remisión%' then raise; end if;
  end;
  if public.anotar_remision_examenes(ra,array['hb']) <> 1 then raise exception 'Falló la primera recepción'; end if;
  if (select count(*) from public.listar_remisiones_examenes(null,ra) r, jsonb_array_elements(r.examenes) x
    where x->>'recibido_en' is not null) <> 1 then raise exception 'La remisión debe quedar parcialmente recibida'; end if;
  if public.anotar_remision_examenes(ra,array['hb','glu']) <> 1 then raise exception 'Se esperaba registrar solo el examen faltante'; end if;
  if (select count(*) from public.listar_remisiones_examenes(null,ra) r, jsonb_array_elements(r.examenes) x
    where x->>'recibido_en' is not null) <> 2 then raise exception 'La remisión debe quedar recibida'; end if;

  perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a3',true);
  if exists (select from public.listar_remisiones_examenes(a)) then raise exception 'El portal pudo leer la remisión clínica'; end if;
end $$;

reset role;
do $$
begin
  if (select count(*) from clinico.consultas c, jsonb_array_elements(c.paraclinicos) e
      where c.id='40000000-0000-0000-0000-00000000000a' and e->>'resultado'='') <> 3 then
    raise exception 'La recepción cambió los resultados clínicos';
  end if;
end $$;
select 'remisión, dos recepciones, reintentos y permisos por empresa (debe 1): 1';
rollback;
