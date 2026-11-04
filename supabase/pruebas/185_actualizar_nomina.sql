-- Actualizar la nómina con la plantilla de RR. HH. (Cesar, 04-nov-2026): completa datos, corrige cargos (con historial),
-- registra nuevos e inactiva; Deshacer el mismo día lo devuelve todo salvo lo que alguien cambió o usó después.
\pset tuples_only on
reset role;
insert into public.puestos (id, org_id, empresa_id, nombre) values
  ('18500000-0000-0000-0000-0000000000c1', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-00000000000a', 'Operador 185'),
  ('18500000-0000-0000-0000-0000000000c2', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-00000000000a', 'Supervisor 185'),
  ('18500000-0000-0000-0000-0000000000c3', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-00000000000b', 'Cargo de B 185');
insert into public.trabajadores (id, org_id, empresa_id, cedula, nombres, apellidos, estado, puesto_id, fecha_ingreso_cargo) values
  ('18500000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-00000000000a', 'V-1850001', 'Ana', 'Nomina', 'activo', '18500000-0000-0000-0000-0000000000c1', '2020-01-01'),
  ('18500000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-00000000000a', 'V-1850002', 'Beto', 'Nomina', 'reposo', null, null),
  ('18500000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-00000000000b', 'V-1850003', 'Ciro', 'DeOtra', 'activo', null, null);

set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false) \g /dev/null
create temp table lote185 as select public.aplicar_nomina(null, '20000000-0000-0000-0000-00000000000a', 'nomina.xlsx',
  '[{"id":"18500000-0000-0000-0000-000000000001","campos":{"sexo":"F","fecha_nacimiento":"1990-05-01","puesto_id":"18500000-0000-0000-0000-0000000000c2"}},
    {"id":"18500000-0000-0000-0000-000000000003","campos":{"sexo":"M"}}]',
  '[{"cedula":"V-1850009","nombres":"Nuevo","apellidos":"Ingreso","sexo":"M","puesto_id":"18500000-0000-0000-0000-0000000000c1"}]',
  array['18500000-0000-0000-0000-000000000002']::uuid[], null) as r;
select 'una ficha cambiada, un nuevo, un inactivo (debe 3): ' || ((r->>'cambios')::int + (r->>'nuevos')::int + (r->>'inactivados')::int) from lote185;
select 'la de otra empresa no se toca (debe 1): ' || count(*) from public.trabajadores where id = '18500000-0000-0000-0000-000000000003' and sexo is null;
select 'datos completados y cargo nuevo desde hoy (debe 1): ' || count(*) from public.trabajadores where id = '18500000-0000-0000-0000-000000000001'
   and sexo = 'F' and fecha_nacimiento = '1990-05-01' and puesto_id = '18500000-0000-0000-0000-0000000000c2' and fecha_ingreso_cargo = public.hoy_caracas();
select 'el cargo anterior queda una vez en el historial (debe 1): ' || count(*) from public.cargos_historial where trabajador_id = '18500000-0000-0000-0000-000000000001' and cargo = 'Operador 185' and desde = '2020-01-01';
select 'el nuevo quedó activo en la empresa (debe 1): ' || count(*) from public.trabajadores where cedula = 'V-1850009' and estado = 'activo' and empresa_id = '20000000-0000-0000-0000-00000000000a';
select 'el de RR. HH. «NO» quedó inactivo con su motivo (debe 1): ' || count(*) from public.trabajadores where id = '18500000-0000-0000-0000-000000000002' and estado = 'inactivo' and motivo_inactivo like 'No está en la nómina%';
reset role;
select 'la bitácora anota cada fila con quién la cambió (debe 2): ' || count(distinct registro_id) from public.bitacora where tabla = 'public.trabajadores' and accion = 'UPDATE'
   and usuario_id = '00000000-0000-0000-0000-0000000000a1' and registro_id in ('18500000-0000-0000-0000-000000000001', '18500000-0000-0000-0000-000000000002');
set role authenticated;

-- Una segunda parte continúa el mismo registro
select 'la segunda parte usa el mismo registro (debe 1): ' || ((public.aplicar_nomina((select (r->>'lote')::uuid from lote185), '20000000-0000-0000-0000-00000000000a', 'nomina.xlsx',
  '[]', '[{"cedula":"V-1850010","nombres":"Otro","apellidos":"Nuevo"}]', '{}', null) ->> 'lote') = (select r->>'lote' from lote185))::int;

-- Catálogos de otra empresa y columnas no permitidas se rechazan
do $$ begin perform public.aplicar_nomina(null, '20000000-0000-0000-0000-00000000000a', null,
  '[{"id":"18500000-0000-0000-0000-000000000001","campos":{"puesto_id":"18500000-0000-0000-0000-0000000000c3"}}]', '[]', '{}', null);
  raise notice 'cargo de otra empresa: FALLA';
exception when invalid_parameter_value then raise notice 'cargo de otra empresa rechazado (ok)'; end $$;
do $$ begin perform public.aplicar_nomina(null, '20000000-0000-0000-0000-00000000000a', null,
  '[{"id":"18500000-0000-0000-0000-000000000001","campos":{"grupo_sanguineo":"O+"}}]', '[]', '{}', null);
  raise notice 'campo clínico por la nómina: FALLA';
exception when invalid_parameter_value then raise notice 'campo clínico rechazado (ok)'; end $$;

-- RR. HH. (gerente de la empresa) y un médico de otra empresa no pueden
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a3',false) \g /dev/null
do $$ begin perform public.aplicar_nomina(null, '20000000-0000-0000-0000-00000000000a', null, '[]', '[]', '{}', null);
  raise notice 'RR. HH. actualiza la nómina: FALLA';
exception when insufficient_privilege then raise notice 'RR. HH. no actualiza la nómina (ok)'; end $$;
select 'RR. HH. no ve el registro (debe 0): ' || count(*) from public.nomina_actualizaciones;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false) \g /dev/null
do $$ begin perform public.aplicar_nomina(null, '20000000-0000-0000-0000-00000000000b', null, '[]', '[]', '{}', null);
  raise notice 'médico de A actualiza la nómina de B: FALLA';
exception when insufficient_privilege then raise notice 'médico de A no toca la nómina de B (ok)'; end $$;

-- Deshacer: el nuevo que ya tiene una consulta y la ficha que alguien volvió a cambiar se quedan
reset role;
insert into clinico.consultas (id, org_id, empresa_id, trabajador_id, estado, fecha)
  select '18500000-0000-0000-0000-0000000000f1', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-00000000000a', id, 'borrador', public.hoy_caracas()
    from public.trabajadores where cedula = 'V-1850010';
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false) \g /dev/null
create temp table deshecho185 as select public.deshacer_nomina((select (r->>'lote')::uuid from lote185)) as d;
select 'se devolvió la ficha y el inactivo, y se quitó el nuevo sin uso (debe 3): ' || ((d->>'cambios')::int + (d->>'reactivados')::int + (d->>'nuevos')::int) from deshecho185;
select 'el nuevo con consulta se queda (debe 1): ' || (d->>'nuevos_quedan') from deshecho185;
select 'la ficha volvió a como estaba (debe 1): ' || count(*) from public.trabajadores where id = '18500000-0000-0000-0000-000000000001'
   and sexo is null and fecha_nacimiento is null and puesto_id = '18500000-0000-0000-0000-0000000000c1' and fecha_ingreso_cargo = '2020-01-01';
select 'sin el cargo anotado en el historial (debe 0): ' || count(*) from public.cargos_historial where trabajador_id = '18500000-0000-0000-0000-000000000001';
select 'volvió a reposo (debe 1): ' || count(*) from public.trabajadores where id = '18500000-0000-0000-0000-000000000002' and estado = 'reposo' and fecha_inactivo is null;
select 'sin cierre en su historial de empresas (debe 0): ' || count(*) from public.trabajador_periodos where trabajador_id = '18500000-0000-0000-0000-000000000002';
select 'el nuevo sin uso ya no está (debe 0): ' || count(*) from public.trabajadores where cedula = 'V-1850009';
select 'el nuevo con consulta sigue (debe 1): ' || count(*) from public.trabajadores where cedula = 'V-1850010';
do $$ begin perform public.deshacer_nomina((select (r->>'lote')::uuid from lote185));
  raise notice 'deshacer dos veces: FALLA';
exception when invalid_parameter_value then raise notice 'no se deshace dos veces (ok)'; end $$;

-- Si alguien cambió la ficha después, Deshacer la respeta
create temp table lote185b as select public.aplicar_nomina(null, '20000000-0000-0000-0000-00000000000a', null,
  '[{"id":"18500000-0000-0000-0000-000000000001","campos":{"telefono":"04141234567"}}]', '[]', '{}', null) as r;
update public.trabajadores set telefono = '04249999999' where id = '18500000-0000-0000-0000-000000000001';
select 'la ficha cambiada después se queda (debe 1): ' || (public.deshacer_nomina((select (r->>'lote')::uuid from lote185b)) ->> 'cambios_quedan');
select 'con el teléfono que puso la persona (debe 1): ' || count(*) from public.trabajadores where id = '18500000-0000-0000-0000-000000000001' and telefono = '04249999999';

reset role;
delete from clinico.consultas where id = '18500000-0000-0000-0000-0000000000f1';
delete from public.trabajadores where cedula in ('V-1850001', 'V-1850002', 'V-1850003', 'V-1850009', 'V-1850010');
delete from public.puestos where id in ('18500000-0000-0000-0000-0000000000c1', '18500000-0000-0000-0000-0000000000c2', '18500000-0000-0000-0000-0000000000c3');
delete from public.nomina_actualizaciones;
