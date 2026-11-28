\pset tuples_only on
begin;

insert into public.prestadores_examenes (id,org_id,nombre,correo) values
('28600000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','Laboratorio ficticio','ordenes@example.invalid');

update clinico.consultas set estado='firmada',
  paraclinicos='[{"id":"hb","nombre":"Hemoglobina","resultado":""},{"id":"otro","nombre":"Examen ajeno","resultado":""}]'
where id in ('40000000-0000-0000-0000-00000000000a','40000000-0000-0000-0000-00000000000b');

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',true) \gset
do $$
begin
  perform public.preparar_remision_directorio('28600000-0000-0000-0000-00000000000a',
    '40000000-0000-0000-0000-00000000000a','28600000-0000-0000-0000-000000000001',array['hb']);
  perform public.preparar_remision_directorio('28600000-0000-0000-0000-00000000000b',
    '40000000-0000-0000-0000-00000000000b','28600000-0000-0000-0000-000000000001',array['hb']);
  if has_function_privilege('authenticated','public.tomar_correo_remision(uuid,text,uuid,uuid)','execute')
    or has_function_privilege('authenticated','public.cerrar_correo_remision(uuid,uuid,text)','execute') then
    raise exception 'Una sesión clínica puede hacerse pasar por el remitente';
  end if;
end $$;

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a3',true) \gset
do $$ begin
  if exists(select from public.prestadores_examenes) then raise exception 'El portal vio el directorio'; end if;
end $$;

set local role service_role;
do $$
declare
  orden jsonb;
  a constant uuid := '28600000-0000-0000-0000-00000000000a';
  b constant uuid := '28600000-0000-0000-0000-00000000000b';
  intento constant uuid := '28600000-0000-0000-0000-00000000000c';
  medico constant uuid := '00000000-0000-0000-0000-0000000000a2';
  destino constant text := 'ordenes@example.invalid';
begin
  begin
    perform public.tomar_correo_remision(b,destino,intento,medico);
    raise exception 'El médico obtuvo la orden de otra empresa';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.tomar_correo_remision(a,'otro@example.invalid',intento,medico);
    raise exception 'El correo cambió y la orden salió';
  exception when raise_exception then
    if sqlerrm not like 'Cambió el prestador%' then raise; end if;
  end;
  orden := public.tomar_correo_remision(a,destino,intento,medico);
  if orden->>'destino' is distinct from destino or orden->'examenes' is distinct from '["Hemoglobina"]'::jsonb
     or orden ?| array['resultado','diagnosticos','conclusiones'] then
    raise exception 'La orden no conservó el destino y la selección';
  end if;
  begin
    perform public.tomar_correo_remision(a,destino,gen_random_uuid(),medico);
    raise exception 'Se pudo reclamar la misma orden dos veces';
  exception when raise_exception then
    if sqlerrm not like 'Esta orden ya%' then raise; end if;
  end;
  if public.cerrar_correo_remision(a,gen_random_uuid(),'enviado') or not public.cerrar_correo_remision(a,intento,'enviado') then
    raise exception 'El cierre no exigió el intento vigente';
  end if;
  perform public.tomar_correo_remision(b,destino,intento,'00000000-0000-0000-0000-0000000000a1');
  if not public.cerrar_correo_remision(b,intento,'por_confirmar') then
    raise exception 'No quedó en revisión la entrega incierta';
  end if;
end $$;

reset role;
do $$ begin
  if not exists (select from clinico.remisiones_examenes
    where id='28600000-0000-0000-0000-00000000000a' and estado_correo='enviado' and enviada_en is not null
      and enviada_por='00000000-0000-0000-0000-0000000000a2' and correo_envio='ordenes@example.invalid')
  or not exists (select from clinico.remisiones_examenes
    where id='28600000-0000-0000-0000-00000000000b' and estado_correo='por_confirmar' and enviada_en is null) then
    raise exception 'Los envíos no reflejan lo que confirmó el servicio de correo';
  end if;
end $$;
select 'directorio, destinatario, envío sin duplicado y entrega por confirmar (debe 1): 1';
rollback;
