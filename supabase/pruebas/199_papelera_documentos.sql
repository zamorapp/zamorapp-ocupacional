-- Papelera para todos los documentos (Cesar, 05-nov): accidente, investigación, ergonomía, informe de vigilancia y
-- notificación de riesgos. Solo el administrador clínico, con motivo, bitácora y restaurar idéntico.
\pset tuples_only on
reset role;
insert into public.trabajadores (id, org_id, empresa_id, cedula, nombres, apellidos, estado) values
  ('30000000-0000-0000-0000-000000000199', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-00000000000a', 'V-199199', 'Eva', 'Prueba', 'activo');
set session_replication_role = replica;
insert into public.eventos (id, org_id, empresa_id, trabajador_id, tipo, fecha_hora, estado) values
  ('62000000-0000-0000-0000-000000000199', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-00000000000a', '30000000-0000-0000-0000-000000000199', 'accidente', '2026-11-01 08:00-04', 'cerrado');
insert into clinico.investigaciones (id, org_id, evento_id, trabajador_id) values
  ('63000000-0000-0000-0000-000000000199', '10000000-0000-0000-0000-000000000001', '62000000-0000-0000-0000-000000000199', '30000000-0000-0000-0000-000000000199');
insert into public.evaluaciones_ergonomicas (id, org_id, empresa_id, puesto, metodo, estado, cerrada_en) values
  ('64000000-0000-0000-0000-000000000199', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-00000000000a', 'Soldador', 'rula', 'cerrada', '2026-11-01 10:00-04');
insert into public.informes_vigilancia (id, org_id, empresa_id, desde, hasta) values
  ('65000000-0000-0000-0000-000000000199', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-00000000000a', '2026-01-01', '2026-06-30');
insert into public.notificaciones_riesgo (id, org_id, empresa_id, trabajador_id, puesto, firmada_en) values
  ('66000000-0000-0000-0000-000000000199', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-00000000000a', '30000000-0000-0000-0000-000000000199', 'Soldador', '2026-11-01 11:00-04');
set session_replication_role = origin;

create or replace function pg_temp.huella199() returns text language sql as $$
  select md5(concat_ws('#',
    (select string_agg((to_jsonb(x) - 'version' - 'actualizado_en')::text, '|') from public.eventos x where x.id = '62000000-0000-0000-0000-000000000199'),
    (select string_agg((to_jsonb(x) - 'version' - 'actualizado_en')::text, '|') from clinico.investigaciones x where x.id = '63000000-0000-0000-0000-000000000199'),
    (select string_agg((to_jsonb(x) - 'version' - 'actualizado_en')::text, '|') from public.evaluaciones_ergonomicas x where x.id = '64000000-0000-0000-0000-000000000199'),
    (select string_agg((to_jsonb(x) - 'version' - 'actualizado_en')::text, '|') from public.informes_vigilancia x where x.id = '65000000-0000-0000-0000-000000000199'),
    (select string_agg((to_jsonb(x) - 'version' - 'actualizado_en')::text, '|') from public.notificaciones_riesgo x where x.id = '66000000-0000-0000-0000-000000000199')))
$$;
create temp table h199 as select pg_temp.huella199() as h;
grant select on h199 to authenticated;
create temp table r199 (tipo text, papelera uuid);
grant all on r199 to authenticated;

set role authenticated;
-- El médico no administrador no elimina
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false) \g /dev/null
do $$ begin perform public.eliminar_documento('ergonomia', '64000000-0000-0000-0000-000000000199', 'Hecha por error'); raise notice 'NO'; exception when insufficient_privilege then null; end $$;
select 'el médico no elimina ergonomía (debe 1): ' || count(*) from public.evaluaciones_ergonomicas where id = '64000000-0000-0000-0000-000000000199';

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false) \g /dev/null
do $$ begin perform public.eliminar_documento('consulta', '64000000-0000-0000-0000-000000000199', 'Hecha por error'); raise notice 'NO'; exception when raise_exception then null; end $$;
select 'consulta y trabajador no van por eliminar_documento (debe 1): 1';
select 'vista previa: el accidente cerrado se lleva su investigación (debe 1): ' || (public.papelera_vista_previa('evento', '62000000-0000-0000-0000-000000000199') -> 'resumen' ->> 'clinico.investigaciones');
select 'vista previa: accidente cerrado cuenta como cerrado (debe 1): ' || (public.papelera_vista_previa('evento', '62000000-0000-0000-0000-000000000199') ->> 'firmadas');
select 'vista previa: ergonomía cerrada (debe 1): ' || (public.papelera_vista_previa('ergonomia', '64000000-0000-0000-0000-000000000199') ->> 'firmadas');

insert into r199 select 'investigacion', public.eliminar_documento('investigacion', '63000000-0000-0000-0000-000000000199', 'Investigación duplicada');
insert into r199 select 'evento', public.eliminar_documento('evento', '62000000-0000-0000-0000-000000000199', 'Accidente registrado dos veces');
insert into r199 select 'ergonomia', public.eliminar_documento('ergonomia', '64000000-0000-0000-0000-000000000199', 'Evaluación de prueba');
insert into r199 select 'informe', public.eliminar_documento('informe_vigilancia', '65000000-0000-0000-0000-000000000199', 'Informe de prueba');
insert into r199 select 'notificacion', public.eliminar_documento('notificacion_riesgo', '66000000-0000-0000-0000-000000000199', 'Puesto equivocado');
select 'los 5 documentos ya no están (debe 0): ' ||
  (select count(*) from public.eventos where id = '62000000-0000-0000-0000-000000000199')
  + (select count(*) from clinico.investigaciones where id = '63000000-0000-0000-0000-000000000199')
  + (select count(*) from public.evaluaciones_ergonomicas where id = '64000000-0000-0000-0000-000000000199')
  + (select count(*) from public.informes_vigilancia where id = '65000000-0000-0000-0000-000000000199')
  + (select count(*) from public.notificaciones_riesgo where id = '66000000-0000-0000-0000-000000000199');
select 'quedan en la papelera con su tipo (debe 5): ' || count(distinct tipo) from public.papelera where objeto_id::text like '6_000000-0000-0000-0000-000000000199';
select 'título del informe con la empresa (debe 1): ' || count(*) from public.papelera where objeto_id = '65000000-0000-0000-0000-000000000199' and titulo like 'Informe de vigilancia 01/01/2026 al 30/06/2026 · %';
select 'bitácora de los 5 (debe 5): ' || count(*) from public.bitacora where accion = 'ELIMINAR_A_PAPELERA' and registro_id::text like '6_000000-0000-0000-0000-000000000199';

-- Restaurar: primero el accidente (la investigación depende de él)
select 'restaura el accidente (debe 1): ' || (public.restaurar_papelera((select papelera from r199 where tipo = 'evento')) like 'Accidente del 01/11/2026 · Eva Prueba')::int;
select 'restaura la investigación (debe 1): ' || (length(public.restaurar_papelera((select papelera from r199 where tipo = 'investigacion'))) > 0)::int;
select 'restaura los demás (debe 3): ' || count(public.restaurar_papelera(papelera)) from r199 where tipo in ('ergonomia', 'informe', 'notificacion');
select 'bitácora de restaurar con su tabla (debe 1): ' || count(*) from public.bitacora where accion = 'RESTAURAR_DE_PAPELERA' and registro_id = '64000000-0000-0000-0000-000000000199' and tabla = 'public.evaluaciones_ergonomicas';
reset role;
select 'vuelven idénticos (debe 1): ' || (pg_temp.huella199() = (select h from h199))::int;
