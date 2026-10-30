-- Datos del trabajador desde la consulta: el médico de A completa la ficha (estado civil incluido); RR. HH. lee el estado civil.
\pset tuples_only on
reset role;
select 'listas de ficha copiadas a la organización (debe 11): ' || count(*) from public.lista_items
 where org_id = '10000000-0000-0000-0000-000000000001' and lista in ('estado_civil', 'nivel_educativo');
-- En la base local de la PC la migración no crea listas (llegan por la réplica con los ids de la nube)
delete from public.lista_items where lista in ('estado_civil', 'nivel_educativo');
select set_config('zamorapp.local', 'on', false) \g /dev/null
\i supabase/migrations/20261030480000_ficha_trabajador_consulta.sql
select 'base local: la migración no crea ítems de lista (debe 0): ' || count(*) from public.lista_items where lista in ('estado_civil', 'nivel_educativo');
select set_config('zamorapp.local', '', false) \g /dev/null
\i supabase/migrations/20261030480000_ficha_trabajador_consulta.sql
select 'nube: la migración repuesta crea la base y la copia de la organización (debe 22): ' || count(*) from public.lista_items
 where lista in ('estado_civil', 'nivel_educativo') and (org_id is null or org_id = '10000000-0000-0000-0000-000000000001');
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false) \g /dev/null
update public.trabajadores set estado_civil = 'Casado(a)', sexo = 'F', fecha_nacimiento = '1990-05-01', telefono = '0414', direccion = 'Maturín'
 where id = '30000000-0000-0000-0000-00000000000a';
select 'médico completa la ficha de A (debe 1): ' || count(*) from public.trabajadores
 where id = '30000000-0000-0000-0000-00000000000a' and estado_civil = 'Casado(a)' and direccion = 'Maturín';
with x as (update public.trabajadores set estado_civil = 'X' where id = '30000000-0000-0000-0000-00000000000b' returning 1)
select 'médico de A no toca la ficha de B (debe 0): ' || count(*) from x;
-- Cambio de cargo: el anterior queda en el historial y la antigüedad del nuevo empieza hoy
reset role;
insert into public.puestos (id, org_id, empresa_id, nombre) values
 ('70000000-0000-0000-0000-000000000152','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a','Cargo viejo 152'),
 ('70000000-0000-0000-0000-000000000153','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a','Cargo nuevo 152');
update public.trabajadores set puesto_id = '70000000-0000-0000-0000-000000000152', fecha_ingreso_cargo = '2020-02-01' where id = '30000000-0000-0000-0000-00000000000a';
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false) \g /dev/null
update public.trabajadores set puesto_id = '70000000-0000-0000-0000-000000000153' where id = '30000000-0000-0000-0000-00000000000a';
select 'cargo anterior en el historial con sus fechas (debe 1): ' || count(*) from public.cargos_historial
 where trabajador_id = '30000000-0000-0000-0000-00000000000a' and cargo = 'Cargo viejo 152' and desde = '2020-02-01';
select 'antigüedad del cargo nuevo empieza hoy (debe 1): ' || count(*) from public.trabajadores
 where id = '30000000-0000-0000-0000-00000000000a' and fecha_ingreso_cargo = public.hoy_caracas();
do $$ begin
  insert into public.cargos_historial (org_id, trabajador_id, cargo, hasta) values ('10000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-00000000000a','x', '2020-01-01');
  raise notice 'médico escribe el historial a mano: FALLA';
exception when insufficient_privilege then raise notice 'el historial solo lo escribe el disparador (ok)'; end $$;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a3',false) \g /dev/null
select 'RR. HH. de A ve el historial de cargos (debe 1): ' || count(*) from public.cargos_historial where cargo = 'Cargo viejo 152';
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a3',false) \g /dev/null
select 'RR. HH. de A lee el estado civil (debe 1): ' || count(*) from public.trabajadores where estado_civil = 'Casado(a)';
reset role;
update public.trabajadores set estado_civil = null, direccion = null, telefono = null, puesto_id = null, fecha_ingreso_cargo = null where id = '30000000-0000-0000-0000-00000000000a';
delete from public.cargos_historial where cargo = 'Cargo viejo 152';
delete from public.puestos where id in ('70000000-0000-0000-0000-000000000152', '70000000-0000-0000-0000-000000000153');
