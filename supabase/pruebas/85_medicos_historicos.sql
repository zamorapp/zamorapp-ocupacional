-- Médicos históricos del SAME: los ve el personal clínico, no la empresa; solo el administrador los crea.
\pset tuples_only on
insert into public.medicos_historicos (id,org_id,nombre_completo,origen,codigo_origen) values
 ('50000000-0000-0000-0000-0000000000d1','10000000-0000-0000-0000-000000000001','Dr. Histórico','integral','dr1');
update clinico.consultas set medico_historico_id='50000000-0000-0000-0000-0000000000d1' where id='40000000-0000-0000-0000-00000000000a';
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false) \g /dev/null
select 'el médico ve al médico histórico (debe 1): ' || count(*) from public.medicos_historicos;
select 'la consulta expone medico_historico_id (debe 1): ' || count(*) from public.consultas where medico_historico_id='50000000-0000-0000-0000-0000000000d1';
do $$ begin insert into public.medicos_historicos (org_id,nombre_completo) values ('10000000-0000-0000-0000-000000000001','Intruso');
 raise notice 'un médico creó un médico histórico: FALLA'; exception when others then raise notice 'médico no puede crear médicos históricos (ok)'; end $$;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a3',false) \g /dev/null
select 'la empresa no ve médicos históricos (debe 0): ' || count(*) from public.medicos_historicos;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false) \g /dev/null
insert into public.medicos_historicos (org_id,nombre_completo) values ('10000000-0000-0000-0000-000000000001','Otro histórico');
select 'el administrador los crea (debe 2): ' || count(*) from public.medicos_historicos;
reset role;
set role anon;
do $$ begin perform 1 from public.medicos_historicos; raise notice 'anon leyó médicos históricos: FALLA'; exception when others then raise notice 'anon sin acceso (ok)'; end $$;
reset role;
