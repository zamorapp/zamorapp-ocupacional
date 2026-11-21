-- Registro de especialistas (migración 20261030971000; Cesar 19-nov): leer la puede todo el personal;
-- gestionar, solo gerencia y recepción. El anónimo no ve ni toca nada.
\pset tuples_only on

-- El anónimo no lee ni escribe (sin permiso sobre la tabla)
set role anon;
do $$ begin
  perform count(*) from public.especialistas;
  raise notice 'anónimo lee: FALLA';
exception when insufficient_privilege then null; end $$;
do $$ begin
  insert into public.especialistas (org_id, nombres, apellidos, especialidad)
  values ('10000000-0000-0000-0000-000000000001', 'Anon', 'Imo', 'Traumatología');
  raise notice 'anónimo inserta: FALLA';
exception when insufficient_privilege then null; end $$;
reset role;

-- Recepción registra; el médico lee pero no registra ni edita; RR. HH. no toca
insert into auth.users (id,email) values ('26900000-0000-0000-0000-0000000000f1','recep-269@x');
insert into public.miembros (org_id,usuario_id,rol,empresas_permitidas) values ('10000000-0000-0000-0000-000000000001','26900000-0000-0000-0000-0000000000f1','recepcion',null);
set role authenticated;
select set_config('request.jwt.claim.sub','26900000-0000-0000-0000-0000000000f1',false) \g /dev/null
insert into public.especialistas (id, org_id, nombres, apellidos, especialidad, direccion, telefono)
values ('26900000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'María', 'Pérez', 'Traumatología', 'Torre Empresarial, piso 2', '0414-1234567');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false) \g /dev/null
do $$ begin
  insert into public.especialistas (org_id, nombres, apellidos, especialidad)
  values ('10000000-0000-0000-0000-000000000001', 'No', 'Puede', 'Cardiología');
  raise notice 'médico registra: FALLA';
exception when insufficient_privilege then null; end $$;
select 'médico lee el registro (debe 1): ' || count(*) from public.especialistas where id = '26900000-0000-0000-0000-000000000001';
-- El médico intenta editar: la RLS filtra en silencio (0 filas), sin error; se verifica que nada cambió
update public.especialistas set telefono = '0000' where id = '26900000-0000-0000-0000-000000000001';
reset role;
select 'el médico no pudo editar (debe 1): ' || (select (telefono = '0414-1234567')::int from public.especialistas where id = '26900000-0000-0000-0000-000000000001');
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a3',false) \g /dev/null
do $$ begin
  insert into public.especialistas (org_id, nombres, apellidos, especialidad)
  values ('10000000-0000-0000-0000-000000000001', 'Rrhh', 'Notoca', 'Oftalmología');
  raise notice 'RR. HH. registra: FALLA';
exception when insufficient_privilege then null; end $$;

-- Recepción edita y desactiva (nada se borra)
select set_config('request.jwt.claim.sub','26900000-0000-0000-0000-0000000000f1',false) \g /dev/null
update public.especialistas set activo = false, telefono = '0424-7654321' where id = '26900000-0000-0000-0000-000000000001';
reset role;
select 'recepción editó y desactivó (debe 1): ' || (select (not activo and telefono = '0424-7654321')::int from public.especialistas where id = '26900000-0000-0000-0000-000000000001');
select 'quedó en la bitácora (debe 1): ' || (select (count(*) > 0)::int from public.bitacora where tabla = 'public.especialistas');

delete from public.miembros where usuario_id = '26900000-0000-0000-0000-0000000000f1';
delete from auth.users where id = '26900000-0000-0000-0000-0000000000f1';
delete from public.especialistas where id::text like '26900000-%';
select set_config('request.jwt.claim.sub', '', false) \g /dev/null
