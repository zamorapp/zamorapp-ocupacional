-- Reportes por médico: la consulta del SAME reasignada a su médico histórico cuenta para él, no para quien hizo la carga.
\pset tuples_only on
reset role;
insert into public.perfiles (id,nombre_completo) values ('00000000-0000-0000-0000-0000000000a1','Admin 143')
  on conflict (id) do update set nombre_completo = 'Admin 143';
insert into public.medicos_historicos (id,org_id,nombre_completo,origen,codigo_origen) values
 ('50000000-0000-0000-0000-000000000143','10000000-0000-0000-0000-000000000001','Histórico 143','integral','usr143');
insert into clinico.consultas (id,org_id,empresa_id,trabajador_id,estado,fecha,medico_id,medico_historico_id) values
 ('4e000000-0000-0000-0000-0000000143a1','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a','30000000-0000-0000-0000-00000000000a','cerrada','2019-03-14','00000000-0000-0000-0000-0000000000a1','50000000-0000-0000-0000-000000000143'),
 ('4e000000-0000-0000-0000-0000000143a2','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a','30000000-0000-0000-0000-00000000000a','cerrada','2019-03-14','00000000-0000-0000-0000-0000000000a1',null);
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false) \g /dev/null
select 'producción: la reasignada cuenta para el médico histórico (debe 1): ' || coalesce(sum((x ->> 'consultas')::int), 0)
  from jsonb_array_elements(public.reporte_listado('medicos', null, '2019-03-14', '2019-03-14')) x where x ->> 'medico' = 'Histórico 143 (histórico)';
select 'producción: la otra queda para quien la atendió (debe 1): ' || coalesce(sum((x ->> 'consultas')::int), 0)
  from jsonb_array_elements(public.reporte_listado('medicos', null, '2019-03-14', '2019-03-14')) x where x ->> 'medico' = 'Admin 143';
select 'estadística: dos médicos distintos (debe 2): ' || count(distinct x ->> 'medico')
  from jsonb_array_elements(public.reporte_listado('estadistica', null, '2019-03-14', '2019-03-14')) x;
reset role;
delete from clinico.consultas where id in ('4e000000-0000-0000-0000-0000000143a1','4e000000-0000-0000-0000-0000000143a2');
