-- Alcance por empresa: el coordinador SST limitado a una empresa no ve puestos ni el informe consolidado de otras.
\pset tuples_only on
reset role;
select set_config('request.jwt.claim.sub','',false) \g /dev/null
insert into auth.users (id,email) values ('00000000-0000-0000-0000-000000000c21','sstA102@x'), ('00000000-0000-0000-0000-000000000c22','sstTodo102@x');
insert into public.miembros (org_id,usuario_id,rol,empresas_permitidas) values
 ('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000c21','coordinador_sst','{20000000-0000-0000-0000-00000000000a}');
insert into public.miembros (org_id,usuario_id,rol) values
 ('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000c22','coordinador_sst');
insert into public.puestos (id,org_id,empresa_id,nombre) values
 ('70000000-0000-0000-0000-000000000a02','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a','Puesto A 102'),
 ('70000000-0000-0000-0000-000000000b02','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000b','Puesto B 102');
insert into public.informes_vigilancia (org_id,empresa_id,desde,hasta,conclusiones) values
 ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000b','2026-05-01','2026-07-31','Informe B 102'),
 ('10000000-0000-0000-0000-000000000001',null,'2026-05-01','2026-07-31','Consolidado 102');
set role authenticated;

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000c21',false) \g /dev/null
select 'SST de A ve su puesto (debe 1): ' || count(*) from public.puestos where id='70000000-0000-0000-0000-000000000a02';
select 'SST de A no ve puestos de B (debe 0): ' || count(*) from public.puestos where empresa_id='20000000-0000-0000-0000-00000000000b';
with x as (update public.puestos set nombre='cambiado' where id='70000000-0000-0000-0000-000000000b02' returning 1)
select 'SST de A no edita puestos de B (debe 0): ' || count(*) from x;
do $$ begin
  insert into public.puestos (org_id,empresa_id,nombre) values ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000b','Intruso');
  raise notice 'SST de A crea puesto en B: FALLA';
exception when insufficient_privilege then raise notice 'SST de A no crea puestos en B (ok)'; end $$;
with x as (update public.puestos set nombre='Puesto A 102 bis' where id='70000000-0000-0000-0000-000000000a02' returning 1)
select 'SST de A edita su puesto (debe 1): ' || count(*) from x;
select 'SST de A no ve el informe de B (debe 0): ' || count(*) from public.informes_vigilancia where empresa_id='20000000-0000-0000-0000-00000000000b';
select 'SST de A no ve el consolidado (debe 0): ' || count(*) from public.informes_vigilancia where empresa_id is null;

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000c22',false) \g /dev/null
select 'SST sin límite ve puestos de B (debe 1): ' || count(*) from public.puestos where id='70000000-0000-0000-0000-000000000b02';
select 'SST sin límite ve el consolidado (debe 1): ' || least(count(*),1) from public.informes_vigilancia where empresa_id is null;

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false) \g /dev/null
select 'médico sigue viendo el consolidado (debe 1): ' || least(count(*),1) from public.informes_vigilancia where empresa_id is null;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a3',false) \g /dev/null
select 'RRHH de A no ve puestos de B (debe 0): ' || count(*) from public.puestos where empresa_id='20000000-0000-0000-0000-00000000000b';
reset role;
