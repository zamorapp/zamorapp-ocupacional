-- Consulta abierta, cerrada y firmada en la PC sin internet: la bandeja la sube como un solo INSERT ya «firmada».
-- Solo al aplicar la bandeja se acepta, con la regla de validar_firma; fuera de ella sigue negada (45_autoria).
\pset tuples_only on
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a4',false) \g /dev/null
do $$ begin insert into clinico.consultas (org_id,empresa_id,trabajador_id,estado,hora_cierre,firmada_en) values ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a','30000000-0000-0000-0000-00000000000a','firmada',now(),now());
 raise notice 'fuera de la bandeja creó una consulta ya firmada: FALLA'; exception when others then raise notice 'fuera de la bandeja, consulta ya firmada rechazada (ok)'; end $$;
select set_config('sync.cambio_id', gen_random_uuid()::text, false) \g /dev/null
select set_config('sync.hora_anclada', 'on', false) \g /dev/null
insert into clinico.consultas (id,org_id,empresa_id,trabajador_id,estado,hora_cierre,firmada_en) values ('14200000-0000-0000-0000-0000000000f1','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a','30000000-0000-0000-0000-00000000000a','firmada','2026-10-29 15:00+00','2026-10-29 15:01+00');
select 'bandeja: el médico sube su consulta firmada en la PC con su hora (debe 1): ' || count(*) from clinico.consultas
 where id = '14200000-0000-0000-0000-0000000000f1' and estado = 'firmada' and firmada_en = timestamptz '2026-10-29 15:01+00' and (hora_equipo #>> '{firmada_en,verificada}')::boolean;
do $$ begin insert into clinico.consultas (org_id,empresa_id,trabajador_id,estado,firmada_en) values ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a','30000000-0000-0000-0000-00000000000a','firmada',now());
 raise notice 'bandeja: firmada sin hora de cierre aceptada: FALLA'; exception when others then raise notice 'bandeja: firmada sin cerrar rechazada (ok)'; end $$;
do $$ begin insert into clinico.consultas (org_id,empresa_id,trabajador_id,medico_id,estado,hora_cierre,firmada_en) values ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a','30000000-0000-0000-0000-00000000000a','00000000-0000-0000-0000-0000000000a2','firmada',now(),now());
 raise notice 'bandeja: firmada a nombre de otro médico aceptada: FALLA'; exception when others then raise notice 'bandeja: firmada a nombre de otro rechazada (ok)'; end $$;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a5',false) \g /dev/null
do $$ begin insert into clinico.consultas (org_id,empresa_id,trabajador_id,estado,hora_cierre,firmada_en) values ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a','30000000-0000-0000-0000-00000000000a','firmada',now(),now());
 raise notice 'bandeja: enfermería sube una consulta firmada: FALLA'; exception when others then raise notice 'bandeja: enfermería no firma (ok)'; end $$;
-- Sin hora verificada la consulta sube igual, pero la hora de firma es la de la nube y la de la PC queda anotada
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a4',false) \g /dev/null
select set_config('sync.hora_anclada', 'off', false) \g /dev/null
insert into clinico.consultas (id,org_id,empresa_id,trabajador_id,estado,hora_cierre,firmada_en) values ('14200000-0000-0000-0000-0000000000f2','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a','30000000-0000-0000-0000-00000000000a','firmada','2020-01-01 10:00+00','2020-01-01 10:01+00');
select 'bandeja sin hora verificada: firma con la hora de la nube (debe 1): ' || count(*) from clinico.consultas
 where id = '14200000-0000-0000-0000-0000000000f2' and firmada_en > now() - interval '1 minute' and (hora_equipo #>> '{firmada_en,hora}')::timestamptz = timestamptz '2020-01-01 10:01+00';
select set_config('sync.cambio_id', '', false) \g /dev/null
select set_config('sync.hora_anclada', '', false) \g /dev/null
reset role;
delete from clinico.consultas where id in ('14200000-0000-0000-0000-0000000000f1', '14200000-0000-0000-0000-0000000000f2');
select set_config('request.jwt.claim.sub', '', false) \g /dev/null
