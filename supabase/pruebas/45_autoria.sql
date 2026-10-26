-- Autoría: nadie crea consultas firmadas ni a nombre de otro médico, ni cambia el autor de una ajena.
\pset tuples_only on
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a5',false) \g /dev/null
do $$ begin insert into public.consultas (org_id,empresa_id,trabajador_id,medico_id,estado,firmada_en) values ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a','30000000-0000-0000-0000-00000000000a','00000000-0000-0000-0000-0000000000a4','firmada',now());
 raise notice 'creó consulta firmada a nombre de otro: FALLA'; exception when others then raise notice 'consulta firmada ajena rechazada (ok)'; end $$;
do $$ begin insert into public.consultas (org_id,empresa_id,trabajador_id,estado) values ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a','30000000-0000-0000-0000-00000000000a','firmada');
 raise notice 'creó consulta propia ya firmada: FALLA'; exception when others then raise notice 'consulta propia ya firmada rechazada (ok)'; end $$;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a4',false) \g /dev/null
insert into public.consultas (id,org_id,empresa_id,trabajador_id,estado) values ('40000000-0000-0000-0000-0000000000e2','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a','30000000-0000-0000-0000-00000000000a','cerrada');
select 'consulta cerrada creada a su nombre (sincronía sin conexión) (debe 1): ' || count(*) from public.consultas where id='40000000-0000-0000-0000-0000000000e2' and medico_id='00000000-0000-0000-0000-0000000000a4';
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false) \g /dev/null
do $$ begin update public.consultas set medico_id='00000000-0000-0000-0000-0000000000a2' where id='40000000-0000-0000-0000-0000000000e2';
 raise notice 'otro médico se apropió de la consulta: FALLA'; exception when others then raise notice 'cambio de autor rechazado (ok)'; end $$;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false) \g /dev/null
update public.consultas set medico_id='00000000-0000-0000-0000-0000000000a2' where id='40000000-0000-0000-0000-0000000000e2';
select 'el administrador reasigna el médico (debe 1): ' || count(*) from public.consultas where id='40000000-0000-0000-0000-0000000000e2' and medico_id='00000000-0000-0000-0000-0000000000a2';
reset role;
