-- Alta de pacientes con las columnas de salud ocultas (#41): grupo_sanguineo y discapacidad no tienen SELECT para
-- authenticated. La app crea el id y no pide la fila de vuelta (return=minimal): así funciona para todos los roles.
-- Pedir la fila completa (RETURNING *, lo que hace PostgREST con return=representation sin select) da 42501.
\pset tuples_only on
reset role;
select 'columnas de salud ocultas para authenticated (debe 2): ' || count(*)
from pg_attribute where attrelid = 'public.trabajadores'::regclass and attname in ('grupo_sanguineo', 'discapacidad')
  and not has_column_privilege('authenticated', 'public.trabajadores', attname, 'SELECT');
set role authenticated;

-- Médico (servicio médico) y RR. HH. de la empresa (portal): alta con id propio, sin RETURNING
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false) \g /dev/null
insert into public.trabajadores (id, org_id, empresa_id, cedula, nombres, apellidos)
values ('14000000-0000-0000-0000-0000000000a1','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a','V-14000001','Nuevo','Médico');
select 'médico registra un paciente nuevo sin pedir la fila (debe 1): ' || count(*) from public.trabajadores where id = '14000000-0000-0000-0000-0000000000a1';
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a3',false) \g /dev/null
insert into public.trabajadores (id, org_id, empresa_id, cedula, nombres, apellidos)
values ('14000000-0000-0000-0000-0000000000a3','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a','V-14000003','Nuevo','Portal');
select 'RR. HH. registra un trabajador nuevo desde el portal (debe 1): ' || count(*) from public.trabajadores where id = '14000000-0000-0000-0000-0000000000a3';
-- Pedir solo el id también sirve; pedir la fila completa no (es lo que no debe volver a hacer el código)
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false) \g /dev/null
do $$ declare v uuid; begin
  insert into public.trabajadores (org_id, empresa_id, cedula, nombres, apellidos)
  values ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a','V-14000004','Solo','Id') returning id into v;
  raise notice 'alta pidiendo solo el id (ok)';
exception when others then raise notice 'alta pidiendo solo el id: FALLA %', sqlerrm; end $$;
do $$ declare r record; begin
  insert into public.trabajadores (org_id, empresa_id, cedula, nombres, apellidos)
  values ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a','V-14000005','Fila','Completa') returning * into r;
  raise notice 'alta pidiendo la fila completa no falló: FALLA (revisar los permisos por columna)';
exception when insufficient_privilege then raise notice 'alta pidiendo la fila completa da 42501 (ok: por eso la app no la pide)'; end $$;

reset role;
delete from public.trabajadores where cedula in ('V-14000001', 'V-14000003', 'V-14000004', 'V-14000005');
select set_config('request.jwt.claim.sub', '', false) \g /dev/null
