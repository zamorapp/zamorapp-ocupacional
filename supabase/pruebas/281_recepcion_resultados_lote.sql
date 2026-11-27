\pset tuples_only on
begin;

insert into clinico.consultas (id,org_id,empresa_id,trabajador_id,estado,fecha,paraclinicos) values
 ('28100000-0000-0000-0000-00000000000a','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a','30000000-0000-0000-0000-00000000000a','cerrada',public.hoy_caracas(),
  '[{"id":"hb","resultado":""},{"id":"otro","resultado":"anterior"}]'),
 ('28100000-0000-0000-0000-00000000000b','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000b','30000000-0000-0000-0000-00000000000b','cerrada',public.hoy_caracas(),
  '[{"id":"hb","resultado":""}]');

insert into clinico.adjuntos (id,org_id,trabajador_id,consulta_id,nombre,ruta,tipo_mime,tamano) values
 ('28100000-0000-0000-0000-0000000000f1','10000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-00000000000a','28100000-0000-0000-0000-00000000000a','lab.pdf','10000000-0000-0000-0000-000000000001/30000000-0000-0000-0000-00000000000a/prueba-281.pdf','application/pdf',100);

set local role authenticated;
do $$
declare
  titular constant uuid := '00000000-0000-0000-0000-0000000000a2';
  consulta constant uuid := '28100000-0000-0000-0000-00000000000a';
  archivo constant uuid := '28100000-0000-0000-0000-0000000000f1';
  previos constant jsonb := '[{"id":"hb","resultado":""},{"id":"otro","resultado":"anterior"}]';
  nuevos constant jsonb := '[{"id":"hb","resultado":"14"}]';
begin
  perform set_config('request.jwt.claim.sub', titular::text, true);
  begin
    perform public.guardar_lectura_lote('28100000-0000-0000-0000-00000000000b',archivo,'[{"id":"hb","resultado":""}]',nuevos,null,false,true);
    raise exception 'Se aceptó una consulta de otra empresa';
  exception when others then
    if sqlerrm not like '%cerrada y sin firma%' then raise; end if;
  end;
  begin
    perform public.guardar_lectura_lote(consulta,gen_random_uuid(),previos,nuevos,null,false,true);
    raise exception 'Se aceptó un PDF ajeno';
  exception when others then
    if sqlerrm not like '%PDF no pertenece%' then raise; end if;
  end;
  begin
    perform public.guardar_lectura_lote(consulta,archivo,previos,nuevos,null,false,false);
    raise exception 'Se omitió la confirmación de identidad';
  exception when others then
    if sqlerrm not like '%Confirma el paciente%' then raise; end if;
  end;
  begin
    perform public.guardar_lectura_lote(consulta,archivo,previos,nuevos,'inválida',false,true);
    raise exception 'Se omitió el registro de bitácora';
  exception when others then
    if sqlerrm not like '%Cédula leída no válida%' then raise; end if;
  end;

  perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a5',true);
  begin
    perform public.guardar_lectura_lote(consulta,archivo,previos,nuevos,null,false,true);
    raise exception 'Enfermería registró una lectura';
  exception when others then
    if sqlerrm not like '%cerrada y sin firma%' then raise; end if;
  end;
  perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a3',true);
  begin
    perform public.guardar_lectura_lote(consulta,archivo,previos,nuevos,null,false,true);
    raise exception 'RR. HH. registró una lectura';
  exception when others then
    if sqlerrm not like '%cerrada y sin firma%' then raise; end if;
  end;

  perform set_config('request.jwt.claim.sub', titular::text, true);
  perform public.guardar_lectura_lote(consulta,archivo,previos,nuevos,null,false,true);
  begin
    perform public.guardar_lectura_lote(consulta,archivo,previos,nuevos,null,false,true);
    raise exception 'Se aceptaron resultados desactualizados';
  exception when others then
    if sqlerrm not like '%resultados cambiaron%' then raise; end if;
  end;
end $$;

reset role;
do $$
begin
  if not exists (select from clinico.consultas c where c.id = '28100000-0000-0000-0000-00000000000a'
    and c.paraclinicos @> '[{"id":"hb","resultado":"14"},{"id":"otro","resultado":"anterior"}]') then
    raise exception 'No se conservaron los resultados que estaban fuera de la selección';
  end if;
  if (select count(*) from public.bitacora where tabla = 'clinico.lectura_laboratorio'
      and registro_id = '28100000-0000-0000-0000-00000000000a') <> 1 then
    raise exception 'La bitácora debe tener una sola lectura confirmada';
  end if;
end $$;

select 'recepción, permisos y concurrencia del lote (debe 1): 1';
rollback;
