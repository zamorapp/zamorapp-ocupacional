\set QUIET on
\pset tuples_only on
select 'avisos de aptitud tras GUARDAR borrador (debe 0): ' || count(*) from public.notificaciones where titulo='Aptitud emitida' and texto like 'Ana%';
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a3',false) \g /dev/null
select 'RRHH-A ve aptitud de borrador (debe 0): ' || count(*) from public.ultima_aptitud where trabajador_id='30000000-0000-0000-0000-00000000000a';
select 'RRHH-A ve aptitud_trabajadores borrador (debe 0): ' || count(*) from public.aptitud_trabajadores where trabajador_id='30000000-0000-0000-0000-00000000000a';
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false) \g /dev/null
select 'Medico-A ve diagnosticos de B (debe 0): ' || count(*) from public.diagnosticos;
select 'Medico-A ve aptitudes de B (debe 0): ' || count(*) from public.aptitudes where trabajador_id='30000000-0000-0000-0000-00000000000b';
select 'Medico-A ve consultas de B (debe 0): ' || count(*) from public.consultas where empresa_id='20000000-0000-0000-0000-00000000000b';
select 'Medico-A ve su borrador A (debe 1): ' || count(*) from public.consultas where empresa_id='20000000-0000-0000-0000-00000000000a';
do $$ begin perform public.depurar_nomina('20000000-0000-0000-0000-00000000000b', '2025-01-01', false); raise notice 'Medico-A depuró nómina de B: PERMITIDO (falla)'; exception when others then raise notice 'Medico-A depurar nómina de B: bloqueado (ok)'; end $$;
select 'Medico-A cuenta depuración sin empresa (debe 0, A tiene consulta reciente): ' || public.depurar_nomina(null, '2025-01-01', false);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false) \g /dev/null
select 'Admin ve diagnosticos (debe 1): ' || count(*) from public.diagnosticos;
reset role;
-- cerrar la consulta de A dispara el aviso
update clinico.consultas set estado='cerrada' where id='40000000-0000-0000-0000-00000000000a';
select 'avisos tras CERRAR (debe 1): ' || count(*) from public.notificaciones where titulo='Aptitud emitida' and texto like 'Ana%';
update clinico.consultas set estado='borrador' where id='40000000-0000-0000-0000-00000000000a';
update clinico.consultas set estado='cerrada' where id='40000000-0000-0000-0000-00000000000a';
select 'avisos tras reabrir y re-cerrar (debe 1, no duplica): ' || count(*) from public.notificaciones where titulo='Aptitud emitida' and texto like 'Ana%';
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a3',false) \g /dev/null
select 'RRHH-A ve aptitud tras cerrar (debe 1): ' || count(*) from public.ultima_aptitud where trabajador_id='30000000-0000-0000-0000-00000000000a';
reset role;
\pset tuples_only on
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false) \g /dev/null
-- flujo de la app al cerrar por primera vez: consulta→cerrada y luego aptitud nueva
insert into public.consultas (id,org_id,empresa_id,trabajador_id) values ('40000000-0000-0000-0000-0000000000a2','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a','30000000-0000-0000-0000-00000000000a');
insert into public.diagnosticos (org_id,consulta_id,cie10,descripcion) values ('10000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-0000000000a2','J00','Rinofaringitis');
update public.consultas set estado='cerrada' where id='40000000-0000-0000-0000-0000000000a2';
insert into public.aptitudes (org_id,consulta_id,trabajador_id,clasificacion) values ('10000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-0000000000a2','30000000-0000-0000-0000-00000000000a','elegible')
 on conflict (consulta_id) do update set clasificacion=excluded.clasificacion;
select 'Medico-A ve su diagnostico nuevo (debe 1): ' || count(*) from public.diagnosticos where consulta_id='40000000-0000-0000-0000-0000000000a2';
do $$ begin insert into public.diagnosticos (org_id,consulta_id,cie10,descripcion) values ('10000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-00000000000b','X','x'); raise notice 'Medico-A escribió diagnóstico en B: FALLA'; exception when others then raise notice 'Medico-A escribir en B: bloqueado (ok)'; end $$;
reset role;
select 'avisos de Ana en total (debe 2: una por cada consulta cerrada): ' || count(*) from public.notificaciones where titulo='Aptitud emitida' and texto like 'Ana%';
update clinico.consultas set estado='firmada' where id='40000000-0000-0000-0000-0000000000a2';
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false) \g /dev/null
delete from public.consultas where id='40000000-0000-0000-0000-0000000000a2';
reset role;
select 'firmada sigue existiendo (debe 1): ' || count(*) from clinico.consultas where id='40000000-0000-0000-0000-0000000000a2';
