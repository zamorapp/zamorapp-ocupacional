\pset tuples_only on
begin;

insert into clinico.consultas (id,org_id,empresa_id,trabajador_id,estado,fecha,medico_id,paraclinicos) values
 ('28400000-0000-0000-0000-00000000000a','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a','30000000-0000-0000-0000-00000000000a','cerrada',public.hoy_caracas()-5,'00000000-0000-0000-0000-0000000000a2',
  '[{"id":"hb","resultado":""},{"id":"a","resultado":"  "},{"id":"b","resultado":"12"},{"id":"c","estado":"normal"}]'),
 ('28400000-0000-0000-0000-00000000000b','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000b','30000000-0000-0000-0000-00000000000b','cerrada',public.hoy_caracas()-3,'00000000-0000-0000-0000-0000000000a1',
  '[{"id":"hb","resultado":""}]'),
 ('28400000-0000-0000-0000-00000000000c','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a','30000000-0000-0000-0000-00000000000a','cerrada',public.hoy_caracas()-61,'00000000-0000-0000-0000-0000000000a2',
  '[{"id":"hb","resultado":""}]');

set local role authenticated;
do $$
declare
  a constant uuid := '28400000-0000-0000-0000-00000000000a';
  b constant uuid := '28400000-0000-0000-0000-00000000000b';
  antiguo constant uuid := '28400000-0000-0000-0000-00000000000c';
begin
  if has_function_privilege('anon','public.listar_consultas_resultados_pendientes(date,uuid)','execute') then
    raise exception 'Se permitió entrar sin sesión';
  end if;
  perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',true);
  if (select pendientes from public.listar_consultas_resultados_pendientes() where id=a) is distinct from 2
    or exists (select from public.listar_consultas_resultados_pendientes() where id in (b,antiguo)) then
    raise exception 'El médico debe ver los exámenes pendientes de su consulta dentro del período';
  end if;
  if (select count(*) from public.listar_consultas_resultados_pendientes()) < 51
     and (select coalesce(sum(pendientes),0) from public.listar_consultas_resultados_pendientes())
          is distinct from (public.inicio_conteos(null, true, true) #>> '{tareas,por_recibir}')::bigint then
    raise exception 'La lista debe coincidir con el total de resultados del médico en Inicio';
  end if;
  perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',true);
  if (select count(*) from public.listar_consultas_resultados_pendientes() where id in (a,b)) <> 2
    or (select count(*) from public.listar_consultas_resultados_pendientes(public.hoy_caracas()-5,a) where id in (a,b)) <> 1 then
    raise exception 'El administrador debe ver ambas empresas y el cursor debe pasar la primera consulta';
  end if;
  perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a3',true);
  if exists (select from public.listar_consultas_resultados_pendientes()) then
    raise exception 'RR. HH. pudo ver las consultas con paraclínicos pendientes';
  end if;
end $$;

reset role;
select 'consulta, permisos y paginación de los resultados por recibir (debe 1): 1';
rollback;
