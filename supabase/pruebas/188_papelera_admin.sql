-- Papelera del administrador (Cesar, 03-nov): eliminar consultas y trabajadores duplicados o erróneos con motivo,
-- bitácora y «Restaurar» que los devuelve idénticos (mismos id, firma, número de historia y enlaces).
\pset tuples_only on
reset role;
insert into public.trabajadores (id, org_id, empresa_id, cedula, nombres, apellidos, estado) values
  ('30000000-0000-0000-0000-000000000188', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-00000000000a', 'V-188188', 'Dani', 'Doble', 'activo');
insert into clinico.consultas (id, org_id, empresa_id, trabajador_id, estado, fecha, hora_cierre, firmada_en, enfermedad_actual) values
  ('40000000-0000-0000-0000-000000000188', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-00000000000a', '30000000-0000-0000-0000-000000000188', 'firmada', '2026-11-02', '2026-11-02 16:20-04', '2026-11-02 16:24-04', 'Completa');
insert into clinico.consultas (id, org_id, empresa_id, trabajador_id, estado, fecha, duplicada_de, enfermedad_actual) values
  ('40000000-0000-0000-0000-000000000189', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-00000000000a', '30000000-0000-0000-0000-000000000188', 'borrador', '2026-11-02', '40000000-0000-0000-0000-000000000188', 'Duplicada al probar la firma');
insert into clinico.diagnosticos (org_id, consulta_id, cie10, descripcion) values
  ('10000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000188', 'I10', 'Hipertensión');
insert into clinico.aptitudes (org_id, consulta_id, trabajador_id, clasificacion, emitida_en) values
  ('10000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000188', '30000000-0000-0000-0000-000000000188', 'elegible', '2026-11-02 16:24-04');
insert into clinico.consultas_versiones (org_id, consulta_id, revision, contenido, motivo, reabierta_por) values
  ('10000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000188', 1, '{"x":1}', 'Prueba de corrección firmada', '00000000-0000-0000-0000-0000000000a1');
insert into clinico.reposos (id, org_id, consulta_id, trabajador_id, causa, desde, hasta) values
  ('60000000-0000-0000-0000-000000000188', '10000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000188', '30000000-0000-0000-0000-000000000188', 'enfermedad_comun', '2026-11-02', '2026-11-04');
insert into public.citas (id, org_id, empresa_id, trabajador_id, fecha, consulta_id) values
  ('61000000-0000-0000-0000-000000000188', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-00000000000a', '30000000-0000-0000-0000-000000000188', '2026-11-02', '40000000-0000-0000-0000-000000000188');
insert into clinico.alertas_clinicas (id, org_id, empresa_id, trabajador_id, consulta_id, texto, revisar_antes, creada_en) values
  ('50000000-0000-0000-0000-000000000188', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-00000000000a', '30000000-0000-0000-0000-000000000188', '40000000-0000-0000-0000-000000000188', 'Control de tensión', '2027-01-10', '2026-11-02');
insert into public.eventos (id, org_id, empresa_id, trabajador_id, tipo, fecha_hora) values
  ('62000000-0000-0000-0000-000000000188', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-00000000000a', '30000000-0000-0000-0000-000000000188', 'accidente', '2026-10-01 08:00-04');

-- Huella de todo lo del trabajador (sin la columna version, que la sincronía sube en cada cambio)
create or replace function pg_temp.huella188() returns text language sql as $$
  select md5(concat_ws('#',
    (select string_agg((to_jsonb(x) - 'version')::text, '|' order by x.id) from public.trabajadores x where x.id = '30000000-0000-0000-0000-000000000188'),
    (select string_agg((to_jsonb(x) - 'version')::text, '|' order by x.id) from clinico.consultas x where x.trabajador_id = '30000000-0000-0000-0000-000000000188'),
    (select string_agg((to_jsonb(x) - 'version')::text, '|' order by x.id) from clinico.diagnosticos x where x.consulta_id = '40000000-0000-0000-0000-000000000188'),
    (select string_agg((to_jsonb(x) - 'version')::text, '|' order by x.id) from clinico.aptitudes x where x.trabajador_id = '30000000-0000-0000-0000-000000000188'),
    (select string_agg((to_jsonb(x) - 'version')::text, '|' order by x.id) from clinico.consultas_versiones x where x.consulta_id = '40000000-0000-0000-0000-000000000188'),
    (select string_agg((to_jsonb(x) - 'version')::text, '|' order by x.id) from clinico.reposos x where x.id = '60000000-0000-0000-0000-000000000188'),
    (select string_agg((to_jsonb(x) - 'version')::text, '|' order by x.id) from public.citas x where x.id = '61000000-0000-0000-0000-000000000188'),
    (select string_agg((to_jsonb(x) - 'version')::text, '|' order by x.id) from clinico.alertas_clinicas x where x.id = '50000000-0000-0000-0000-000000000188'),
    (select string_agg((to_jsonb(x) - 'version' - 'actualizado_en')::text, '|' order by x.id) from public.eventos x where x.id = '62000000-0000-0000-0000-000000000188')))
$$;
create temp table h188 as select pg_temp.huella188() as h;
grant select on h188 to authenticated;
create temp table r188 (paso text, papelera uuid);
grant all on r188 to authenticated;

-- Solo el administrador con acceso clínico
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false) \g /dev/null
do $$ begin perform public.eliminar_consulta('40000000-0000-0000-0000-000000000189', 'Duplicada'); raise notice 'NO'; exception when insufficient_privilege then null; end $$;
select 'el médico no elimina (debe 2): ' || count(*) from clinico.consultas where id in ('40000000-0000-0000-0000-000000000188', '40000000-0000-0000-0000-000000000189');
select 'el médico no ve la papelera (debe 0): ' || count(*) from public.papelera;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false) \g /dev/null
do $$ begin perform public.eliminar_consulta('40000000-0000-0000-0000-000000000189', ' '); raise notice 'NO'; exception when raise_exception then null; end $$;
select 'sin motivo no se elimina (debe 1): ' || count(*) from clinico.consultas where id = '40000000-0000-0000-0000-000000000189';

-- Vista previa
select 'vista previa: 3 consultas firmadas o no… (debe 2): ' || (public.papelera_vista_previa('trabajador', '30000000-0000-0000-0000-000000000188') -> 'resumen' ->> 'clinico.consultas');
select 'vista previa: 1 firmada (debe 1): ' || (public.papelera_vista_previa('trabajador', '30000000-0000-0000-0000-000000000188') ->> 'firmadas');
select 'vista previa: el reposo queda suelto, no se borra (debe 1): ' || (public.papelera_vista_previa('consulta', '40000000-0000-0000-0000-000000000188') -> 'sueltas' ->> 'clinico.reposos');

-- 1) La duplicada en borrador
insert into r188 select 'dup', public.eliminar_consulta('40000000-0000-0000-0000-000000000189', 'Duplicada al probar la firma');
select 'la duplicada ya no está (debe 0): ' || count(*) from clinico.consultas where id = '40000000-0000-0000-0000-000000000189';
select 'la firmada sigue (debe 1): ' || count(*) from clinico.consultas where id = '40000000-0000-0000-0000-000000000188';
select 'queda en la papelera con motivo (debe 1): ' || count(*) from public.papelera where objeto_id = '40000000-0000-0000-0000-000000000189' and motivo like 'Duplicada%' and eliminado_por = '00000000-0000-0000-0000-0000000000a1';
do $$ begin perform filas from public.papelera; raise notice 'NO'; exception when insufficient_privilege then null; end $$;
select 'las filas guardadas no se leen directo (debe 1): 1';
select 'bitácora del borrado (debe 1): ' || count(*) from public.bitacora where accion = 'ELIMINAR_A_PAPELERA' and registro_id = '40000000-0000-0000-0000-000000000189';
select 'restaurar devuelve el título (debe 1): ' || (public.restaurar_papelera((select papelera from r188 where paso = 'dup')) like 'Consulta del 02/11/2026 · Dani Doble%')::int;
reset role;
select 'vuelve idéntica (debe 1): ' || (pg_temp.huella188() = (select h from h188))::int;
set role authenticated;
do $$ begin perform public.restaurar_papelera((select papelera from r188 where paso = 'dup')); raise notice 'NO'; exception when raise_exception then null; end $$;
select 'no se restaura dos veces (debe 1): ' || count(*) from clinico.consultas where id = '40000000-0000-0000-0000-000000000189';

-- 2) La firmada: se lleva diagnóstico, aptitud y versión; suelta reposo, cita, alerta y la duplicada
insert into r188 select 'firmada', public.eliminar_consulta('40000000-0000-0000-0000-000000000188', 'Registrada al paciente equivocado');
select 'firmada eliminada con lo suyo (debe 0): ' || (select count(*) from clinico.consultas where id = '40000000-0000-0000-0000-000000000188')
  + (select count(*) from clinico.diagnosticos where consulta_id = '40000000-0000-0000-0000-000000000188')
  + (select count(*) from clinico.aptitudes where consulta_id = '40000000-0000-0000-0000-000000000188')
  + (select count(*) from clinico.consultas_versiones where consulta_id = '40000000-0000-0000-0000-000000000188');
select 'reposo, cita y alerta se quedan sin la consulta (debe 3): ' || (select count(*) from clinico.reposos where id = '60000000-0000-0000-0000-000000000188' and consulta_id is null)
  + (select count(*) from public.citas where id = '61000000-0000-0000-0000-000000000188' and consulta_id is null)
  + (select count(*) from clinico.alertas_clinicas where id = '50000000-0000-0000-0000-000000000188' and consulta_id is null);
select 'la duplicada se queda sin «duplicada de» (debe 1): ' || count(*) from clinico.consultas where id = '40000000-0000-0000-0000-000000000189' and duplicada_de is null;
select public.restaurar_papelera((select papelera from r188 where paso = 'firmada')) \g /dev/null
reset role;
select 'firmada restaurada idéntica con sus enlaces (debe 1): ' || (pg_temp.huella188() = (select h from h188))::int;
set role authenticated;

-- 3) El trabajador completo: consultas, aptitud, citas, alertas…; el accidente queda sin lesionado hasta restaurar
insert into r188 select 'trab', public.eliminar_trabajador('30000000-0000-0000-0000-000000000188', 'Registrado dos veces');
select 'trabajador eliminado con todo (debe 0): ' || (select count(*) from public.trabajadores where id = '30000000-0000-0000-0000-000000000188')
  + (select count(*) from clinico.consultas where trabajador_id = '30000000-0000-0000-0000-000000000188')
  + (select count(*) from clinico.reposos where trabajador_id = '30000000-0000-0000-0000-000000000188')
  + (select count(*) from public.citas where trabajador_id = '30000000-0000-0000-0000-000000000188');
select 'el accidente queda sin lesionado (debe 1): ' || count(*) from public.eventos where id = '62000000-0000-0000-0000-000000000188' and trabajador_id is null;
select public.restaurar_papelera((select papelera from r188 where paso = 'trab')) \g /dev/null
reset role;
select 'trabajador restaurado idéntico, mismo n.º de historia (debe 1): ' || (pg_temp.huella188() = (select h from h188))::int;
set role authenticated;

-- 4) Consulta de un trabajador eliminado: primero el trabajador
insert into r188 select 'c2', public.eliminar_consulta('40000000-0000-0000-0000-000000000189', 'Duplicada');
insert into r188 select 't2', public.eliminar_trabajador('30000000-0000-0000-0000-000000000188', 'Registrado dos veces');
do $$ begin perform public.restaurar_papelera((select papelera from r188 where paso = 'c2')); raise notice 'NO'; exception when raise_exception then null; end $$;
select 'sin el trabajador la consulta no vuelve (debe 0): ' || count(*) from clinico.consultas where id = '40000000-0000-0000-0000-000000000189';
select public.restaurar_papelera((select papelera from r188 where paso = 't2')) \g /dev/null
select public.restaurar_papelera((select papelera from r188 where paso = 'c2')) \g /dev/null
reset role;
select 'en orden vuelve todo idéntico (debe 1): ' || (pg_temp.huella188() = (select h from h188))::int;
set role authenticated;

-- Los disparadores quedan encendidos y la sincronía anotó el borrado y la vuelta
reset role;
select 'disparadores encendidos (debe 0): ' || count(*) from pg_trigger t where not t.tgisinternal and t.tgenabled = 'D'
  and t.tgrelid in ('clinico.consultas'::regclass, 'public.trabajadores'::regclass, 'clinico.aptitudes'::regclass, 'public.citas'::regclass, 'clinico.alertas_clinicas'::regclass, 'public.eventos'::regclass);
select 'la sincronía vio borrar y volver la consulta (debe 1): ' || (count(*) filter (where op = 'D') > 0 and count(*) filter (where op = 'I') > 1)::int
  from sync.registro where fila_id = '40000000-0000-0000-0000-000000000188';

-- Deja la base como estaba
delete from public.eventos where id = '62000000-0000-0000-0000-000000000188';
delete from public.citas where trabajador_id = '30000000-0000-0000-0000-000000000188';
delete from clinico.reposos where trabajador_id = '30000000-0000-0000-0000-000000000188';
delete from clinico.alertas_clinicas where trabajador_id = '30000000-0000-0000-0000-000000000188';
delete from clinico.aptitudes where trabajador_id = '30000000-0000-0000-0000-000000000188';
update clinico.consultas set duplicada_de = null where trabajador_id = '30000000-0000-0000-0000-000000000188';
delete from clinico.consultas where trabajador_id = '30000000-0000-0000-0000-000000000188';
delete from public.trabajadores where id = '30000000-0000-0000-0000-000000000188';
delete from public.papelera where objeto_id in ('30000000-0000-0000-0000-000000000188', '40000000-0000-0000-0000-000000000188', '40000000-0000-0000-0000-000000000189');
