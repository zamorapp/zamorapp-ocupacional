-- firmada_en y hora_cierre: solo las ponen cerrar, firmar y reabrir, con la hora del servidor; un UPDATE directo no las cambia.
\pset tuples_only on
reset role;
insert into clinico.consultas (id,org_id,empresa_id,trabajador_id,medico_id) values
 ('15400000-0000-0000-0000-0000000000c1','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a','30000000-0000-0000-0000-00000000000a','00000000-0000-0000-0000-0000000000a4');
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a4',false) \g /dev/null
update clinico.consultas set hora_cierre = '2020-01-01 10:00+00', firmada_en = '2020-01-01 10:00+00' where id = '15400000-0000-0000-0000-0000000000c1';
select 'borrador: un UPDATE directo no pone horas de cierre ni de firma (debe 1): ' || count(*) from clinico.consultas
 where id = '15400000-0000-0000-0000-0000000000c1' and hora_cierre is null and firmada_en is null;
select public.guardar_consulta('15400000-0000-0000-0000-0000000000c1', '{"tipo":"primera"}', '[]', null, null, true) \g /dev/null
select 'cerrar pone la hora del servidor (debe 1): ' || count(*) from clinico.consultas
 where id = '15400000-0000-0000-0000-0000000000c1' and estado = 'cerrada' and hora_cierre > now() - interval '1 minute' and firmada_en is null;
update clinico.consultas set hora_cierre = '2020-01-01 10:00+00' where id = '15400000-0000-0000-0000-0000000000c1';
select 'cerrada: un UPDATE directo no cambia la hora de cierre (debe 1): ' || count(*) from clinico.consultas
 where id = '15400000-0000-0000-0000-0000000000c1' and hora_cierre > now() - interval '1 minute';
update clinico.consultas set estado = 'firmada', firmada_en = '2020-01-01 10:00+00' where id = '15400000-0000-0000-0000-0000000000c1';
select 'firmar con una hora inventada deja la hora del servidor (debe 1): ' || count(*) from clinico.consultas
 where id = '15400000-0000-0000-0000-0000000000c1' and estado = 'firmada' and firmada_en > now() - interval '1 minute' and hora_cierre > now() - interval '1 minute';
-- Sin internet: la firma con la hora verificada de la PC sube por la bandeja y conserva esa hora (no la de la subida)
reset role;
insert into clinico.consultas (id,org_id,empresa_id,trabajador_id,medico_id,estado,hora_cierre) values
 ('15400000-0000-0000-0000-0000000000c2','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a','30000000-0000-0000-0000-00000000000a','00000000-0000-0000-0000-0000000000a4','cerrada','2026-10-29 14:00+00');
set role authenticated;
select set_config('sync.cambio_id', gen_random_uuid()::text, false) \g /dev/null
select set_config('sync.equipo_id', '15400000-0000-0000-0000-0000000000e1', false) \g /dev/null
select set_config('sync.hora_anclada', 'on', false) \g /dev/null
update clinico.consultas set estado = 'firmada', firmada_en = '2026-10-29 15:01+00' where id = '15400000-0000-0000-0000-0000000000c2';
select set_config('sync.cambio_id', '', false) \g /dev/null
select set_config('sync.equipo_id', '', false) \g /dev/null
select set_config('sync.hora_anclada', '', false) \g /dev/null
select 'bandeja: la firma sin internet conserva la hora verificada de la PC (debe 1): ' || count(*) from clinico.consultas
 where id = '15400000-0000-0000-0000-0000000000c2' and firmada_en = timestamptz '2026-10-29 15:01+00' and hora_cierre = timestamptz '2026-10-29 14:00+00';
-- Réplica (superusuario con replication_role = replica, como replica.mjs y bandeja.mjs en la PC): los disparadores
-- no corren aunque haya usuario en la sesión, y la hora llega tal cual
reset role;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a4',false) \g /dev/null
set session_replication_role = replica;
update clinico.consultas set firmada_en = '2026-10-29 15:02+00' where id = '15400000-0000-0000-0000-0000000000c2';
set session_replication_role = origin;
select 'réplica: la hora de firma llega tal cual (debe 1): ' || count(*) from clinico.consultas
 where id = '15400000-0000-0000-0000-0000000000c2' and firmada_en = timestamptz '2026-10-29 15:02+00';
delete from clinico.consultas where id = '15400000-0000-0000-0000-0000000000c2';
-- Fuera de la bandeja y sin servicio, migraciones e importaciones del SAME (sin usuario) siguen escribiendo sus horas
reset role;
select set_config('request.jwt.claim.sub', '', false) \g /dev/null
update clinico.consultas set firmada_en = '2021-05-05 10:00+00' where id = '15400000-0000-0000-0000-0000000000c1';
select 'sin usuario (importación) se respeta la hora (debe 1): ' || count(*) from clinico.consultas
 where id = '15400000-0000-0000-0000-0000000000c1' and firmada_en = timestamptz '2021-05-05 10:00+00';
select 'el disparador solo corre en la nube (debe 1): ' || count(*) from pg_trigger
 where tgname = 'horas_de_firma_fijas' and tgrelid = 'clinico.consultas'::regclass and pg_get_triggerdef(oid) like '%es_base_local%';
delete from clinico.consultas where id = '15400000-0000-0000-0000-0000000000c1';
select set_config('request.jwt.claim.sub', '', false) \g /dev/null
