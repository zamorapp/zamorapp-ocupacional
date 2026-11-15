-- Ergonomía: OCRA y KIM se aceptan; un método desconocido sigue rechazado.
\pset tuples_only on
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false) \g /dev/null
insert into public.evaluaciones_ergonomicas (id, org_id, empresa_id, puesto, metodo) values
 ('19600000-0000-0000-0000-0000000000e1','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a','Empacadora 196','ocra'),
 ('19600000-0000-0000-0000-0000000000e2','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a','Almacenista 196','kim');
select 'OCRA y KIM aceptados (debe 2): ' || count(*) from public.evaluaciones_ergonomicas where id::text like '19600000%';
do $$ begin
  insert into public.evaluaciones_ergonomicas (org_id, empresa_id, puesto, metodo) values
   ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a','X','owas');
  raise notice 'método desconocido: FALLA';
exception when check_violation then null; end $$;
reset role;
delete from public.evaluaciones_ergonomicas where id::text like '19600000%';
