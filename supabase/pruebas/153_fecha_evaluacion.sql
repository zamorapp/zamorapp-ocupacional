-- Fecha de la evaluación editable (pasado o futuro); las horas reales no cambian y cada cambio queda en la bitácora.
\pset tuples_only on
reset role;
insert into clinico.consultas (id,org_id,empresa_id,trabajador_id,medico_id,fecha,creado_en,hora_inicio) values
 ('15300000-0000-0000-0000-0000000000c1','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a','30000000-0000-0000-0000-00000000000a','00000000-0000-0000-0000-0000000000a4','2026-10-30','2026-10-30 14:00+00','2026-10-30 14:00+00');
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a4',false) \g /dev/null
-- Al pasado, con aptitud sin vigencia: la vigencia por defecto cuenta desde la fecha de la evaluación
select public.guardar_consulta('15300000-0000-0000-0000-0000000000c1', '{"fecha":"2026-09-15","tipo":"primera"}', '[]', '{"clasificacion":"elegible"}', null, false) \g /dev/null
select 'fecha de la evaluación al pasado (debe 1): ' || count(*) from clinico.consultas where id = '15300000-0000-0000-0000-0000000000c1' and fecha = date '2026-09-15';
select 'la vigencia de la aptitud cuenta desde la evaluación (debe 1): ' || count(*) from clinico.aptitudes a, public.organizaciones o
 where a.consulta_id = '15300000-0000-0000-0000-0000000000c1' and o.id = a.org_id
   and a.vigente_hasta = (date '2026-09-15' + make_interval(months => coalesce((o.ajustes ->> 'meses_examen_periodico')::int, 12)))::date;
-- Al futuro
select public.guardar_consulta('15300000-0000-0000-0000-0000000000c1', format('{"fecha":"%s","tipo":"primera"}', public.hoy_caracas() + 10)::jsonb, '[]', null, null, false) \g /dev/null
select 'fecha de la evaluación al futuro (debe 1): ' || count(*) from clinico.consultas where id = '15300000-0000-0000-0000-0000000000c1' and fecha = public.hoy_caracas() + 10;
-- Sin fecha en el guardado (versiones viejas de la pantalla) se conserva la que tiene
select public.guardar_consulta('15300000-0000-0000-0000-0000000000c1', '{"tipo":"primera"}', '[]', null, null, false) \g /dev/null
select 'guardar sin fecha la conserva (debe 1): ' || count(*) from clinico.consultas where id = '15300000-0000-0000-0000-0000000000c1' and fecha = public.hoy_caracas() + 10;
do $$ begin perform public.guardar_consulta('15300000-0000-0000-0000-0000000000c1', '{"fecha":"20260-01-01","tipo":"primera"}', '[]', null, null, false);
 raise notice 'fecha absurda aceptada: FALLA'; exception when others then raise notice 'fecha absurda rechazada (ok)'; end $$;
do $$ begin perform public.guardar_consulta('15300000-0000-0000-0000-0000000000c1', format('{"fecha":"%s","tipo":"primera"}', public.hoy_caracas() + 400)::jsonb, '[]', null, null, false);
 raise notice 'fecha a más de un año aceptada: FALLA'; exception when others then raise notice 'fecha a más de un año rechazada (ok)'; end $$;
-- Las horas reales de registro no las cambia el usuario
update clinico.consultas set creado_en = '2020-01-01 10:00+00', hora_inicio = '2020-01-01 10:00+00' where id = '15300000-0000-0000-0000-0000000000c1';
select 'el usuario no cambia la hora real de registro (debe 1): ' || count(*) from clinico.consultas
 where id = '15300000-0000-0000-0000-0000000000c1' and creado_en = timestamptz '2026-10-30 14:00+00' and hora_inicio = timestamptz '2026-10-30 14:00+00';
reset role;
select 'cada cambio de fecha queda en la bitácora con quién y la fecha anterior (debe 2): ' || count(*) from public.bitacora
 where registro_id = '15300000-0000-0000-0000-0000000000c1' and accion = 'FECHA_EVALUACION' and usuario_id = '00000000-0000-0000-0000-0000000000a4'
   and antes ? 'fecha' and despues ? 'registrada_en';
select 'la bitácora guarda la fecha anterior y la nueva (debe 1): ' || count(*) from public.bitacora
 where registro_id = '15300000-0000-0000-0000-0000000000c1' and accion = 'FECHA_EVALUACION'
   and antes ->> 'fecha' = '2026-10-30' and despues ->> 'fecha' = '2026-09-15';
-- Una consulta que llega por la bandeja ya con otra fecha (INSERT fusionado) también se anota
set role authenticated;
select set_config('sync.cambio_id', gen_random_uuid()::text, false) \g /dev/null
select set_config('sync.equipo_id', '15300000-0000-0000-0000-0000000000e1', false) \g /dev/null
select set_config('sync.hora_anclada', 'on', false) \g /dev/null
insert into clinico.consultas (id,org_id,empresa_id,trabajador_id,fecha,creado_en,hora_inicio) values ('15300000-0000-0000-0000-0000000000c2','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a','30000000-0000-0000-0000-00000000000a','2026-08-01','2026-10-30 14:00+00','2026-10-30 14:00+00');
insert into clinico.consultas (id,org_id,empresa_id,trabajador_id,fecha,creado_en,hora_inicio) values ('15300000-0000-0000-0000-0000000000c3','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a','30000000-0000-0000-0000-00000000000a','2026-10-30','2026-10-30 14:00+00','2026-10-30 14:00+00');
select set_config('sync.cambio_id', '', false) \g /dev/null
select set_config('sync.equipo_id', '', false) \g /dev/null
select set_config('sync.hora_anclada', '', false) \g /dev/null
reset role;
select 'bandeja: consulta que llega con otra fecha queda anotada; la del mismo día no (debe 1): ' || count(*) from public.bitacora
 where registro_id in ('15300000-0000-0000-0000-0000000000c2', '15300000-0000-0000-0000-0000000000c3') and accion = 'FECHA_EVALUACION';
-- En la base de la PC no se anota (la bitácora no sube): la anota la nube al recibir la fila
select 'disparadores de fecha y horas solo en la nube (debe 2): ' || count(*) from pg_trigger
 where tgname in ('anotar_fecha_evaluacion', 'horas_reales_fijas') and tgrelid = 'clinico.consultas'::regclass and pg_get_triggerdef(oid) like '%es_base_local%';
delete from clinico.consultas where id::text like '15300000-%';
select set_config('request.jwt.claim.sub', '', false) \g /dev/null
