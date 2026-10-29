-- Consulta abierta, cerrada y firmada en la PC sin internet: la bandeja la sube como un solo INSERT ya «firmada».
-- Solo al aplicar la bandeja se acepta, con la regla de validar_firma; fuera de ella sigue negada (45_autoria).
\pset tuples_only on
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a4',false) \g /dev/null
do $$ begin insert into clinico.consultas (org_id,empresa_id,trabajador_id,estado,hora_cierre,firmada_en) values ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a','30000000-0000-0000-0000-00000000000a','firmada',now(),now());
 raise notice 'fuera de la bandeja creó una consulta ya firmada: FALLA'; exception when others then raise notice 'fuera de la bandeja, consulta ya firmada rechazada (ok)'; end $$;
select set_config('sync.cambio_id', gen_random_uuid()::text, false) \g /dev/null
select set_config('sync.equipo_id', '14200000-0000-0000-0000-0000000000e1', false) \g /dev/null
select set_config('sync.hora_anclada', 'on', false) \g /dev/null
insert into clinico.consultas (id,org_id,empresa_id,trabajador_id,estado,hora_cierre,firmada_en) values ('14200000-0000-0000-0000-0000000000f1','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a','30000000-0000-0000-0000-00000000000a','firmada','2026-10-29 15:00+00','2026-10-29 15:01+00');
select 'bandeja: el médico sube su consulta firmada en la PC con su hora (debe 1): ' || count(*) from clinico.consultas
 where id = '14200000-0000-0000-0000-0000000000f1' and estado = 'firmada' and firmada_en = timestamptz '2026-10-29 15:01+00' and (hora_equipo #>> '{firmada_en,verificada}')::boolean;
-- Sus filas hijas suben después: otra PC o la web no pueden agregarlas; la PC que firmó sí, y la empresa recibe el aviso
select set_config('sync.equipo_id', '14200000-0000-0000-0000-0000000000e2', false) \g /dev/null
do $$ begin insert into clinico.diagnosticos (org_id,consulta_id,cie10,descripcion) values ('10000000-0000-0000-0000-000000000001','14200000-0000-0000-0000-0000000000f1','Z00.0','Otra PC');
 raise notice 'bandeja de otra PC agrega un diagnóstico a la firmada: FALLA'; exception when insufficient_privilege then raise notice 'bandeja de otra PC no toca la firmada (ok)'; end $$;
select set_config('sync.equipo_id', '', false) \g /dev/null
do $$ begin insert into clinico.diagnosticos (org_id,consulta_id,cie10,descripcion) values ('10000000-0000-0000-0000-000000000001','14200000-0000-0000-0000-0000000000f1','Z00.0','Web');
 raise notice 'fuera de la bandeja se agrega un diagnóstico a la firmada: FALLA'; exception when insufficient_privilege then raise notice 'fuera de la bandeja la firmada no cambia (ok)'; end $$;
select set_config('sync.equipo_id', '14200000-0000-0000-0000-0000000000e1', false) \g /dev/null
insert into clinico.diagnosticos (org_id,consulta_id,cie10,descripcion) values ('10000000-0000-0000-0000-000000000001','14200000-0000-0000-0000-0000000000f1','Z00.0','Examen médico general');
insert into clinico.aptitudes (org_id,consulta_id,trabajador_id,clasificacion) values ('10000000-0000-0000-0000-000000000001','14200000-0000-0000-0000-0000000000f1','30000000-0000-0000-0000-00000000000a','elegible');
reset role;
select 'bandeja: la PC que firmó sube su diagnóstico (debe 1): ' || count(*) from clinico.diagnosticos where consulta_id = '14200000-0000-0000-0000-0000000000f1';
select 'bandeja: la aptitud de la consulta firmada sin internet avisa a la empresa (debe 1): ' || count(*) from clinico.aptitudes
 where consulta_id = '14200000-0000-0000-0000-0000000000f1' and avisada_en is not null;
select 'el aviso al crear una consulta cerrada o firmada existe y solo corre en la nube (debe 1): ' || count(*) from pg_trigger
 where tgname = 'avisar_aptitud_al_crear_cerrada' and tgrelid = 'clinico.consultas'::regclass and pg_get_triggerdef(oid) like '%es_base_local%';
set role authenticated;
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
select set_config('sync.equipo_id', '', false) \g /dev/null
select set_config('sync.hora_anclada', '', false) \g /dev/null
reset role;
delete from clinico.consultas where id in ('14200000-0000-0000-0000-0000000000f1', '14200000-0000-0000-0000-0000000000f2');
select set_config('request.jwt.claim.sub', '', false) \g /dev/null

-- ═══ Corregir sin internet: la versión y la consulta suben por la bandeja ═══
reset role;
insert into clinico.consultas (id,org_id,empresa_id,trabajador_id,medico_id,estado,hora_cierre) values
 ('14200000-0000-0000-0000-0000000000c1','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a','30000000-0000-0000-0000-00000000000a','00000000-0000-0000-0000-0000000000a4','cerrada',now());
update clinico.consultas set estado = 'firmada', enfermedad_actual = 'Firmado en la nube' where id = '14200000-0000-0000-0000-0000000000c1';
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a4',false) \g /dev/null
-- Desde la web (sin equipo) no se escribe una versión
do $$ begin insert into clinico.consultas_versiones (org_id,consulta_id,revision,contenido,motivo) values ('10000000-0000-0000-0000-000000000001','14200000-0000-0000-0000-0000000000c1',1,'{}','Corrección de prueba web');
 raise notice 'web escribe una versión: FALLA'; exception when others then raise notice 'web no escribe versiones (ok)'; end $$;
-- Ni se cambia la firmada sin versión, aunque venga de la bandeja
select set_config('sync.cambio_id', gen_random_uuid()::text, false) \g /dev/null
select set_config('sync.equipo_id', '14200000-0000-0000-0000-0000000000e1', false) \g /dev/null
update clinico.consultas set estado = 'borrador', revision = 2 where id = '14200000-0000-0000-0000-0000000000c1';
select 'bandeja sin versión no toca la firmada (debe 1): ' || count(*) from clinico.consultas where id = '14200000-0000-0000-0000-0000000000c1' and estado = 'firmada' and revision = 1;
-- Enfermería no corrige
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a5',false) \g /dev/null
do $$ begin insert into clinico.consultas_versiones (org_id,consulta_id,revision,firmada_en,contenido,motivo) values ('10000000-0000-0000-0000-000000000001','14200000-0000-0000-0000-0000000000c1',1,now(),'{}','Corrección de enfermería');
 raise notice 'enfermería corrige: FALLA'; exception when others then raise notice 'enfermería no corrige (ok)'; end $$;
-- Revisión que no corresponde (+2): negada
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a4',false) \g /dev/null
do $$ begin insert into clinico.consultas_versiones (org_id,consulta_id,revision,firmada_en,contenido,motivo) values ('10000000-0000-0000-0000-000000000001','14200000-0000-0000-0000-0000000000c1',3,now(),'{"consulta":{"estado":"firmada"}}','Revisión que no toca');
 raise notice 'versión con revisión equivocada: FALLA'; exception when others then raise notice 'versión con revisión equivocada negada (ok)'; end $$;
-- El médico corrige desde la PC: la copia falsificada se reemplaza por lo firmado en la nube
insert into clinico.consultas_versiones (id,org_id,consulta_id,revision,firmada_en,contenido,motivo) values ('14200000-0000-0000-0000-0000000000d1','10000000-0000-0000-0000-000000000001','14200000-0000-0000-0000-0000000000c1',1,'2001-01-01','{"consulta":{"estado":"firmada","enfermedad_actual":"Falsificado"}}','Corregir la tensión arterial');
update clinico.consultas set estado = 'borrador', revision = 2, enfermedad_actual = 'Corregido en la PC' where id = '14200000-0000-0000-0000-0000000000c1';
reset role;
select 'bandeja: la versión guarda lo firmado en la nube, no la copia de la PC (debe 1): ' || count(*) from clinico.consultas_versiones
 where id = '14200000-0000-0000-0000-0000000000d1' and contenido #>> '{consulta,enfermedad_actual}' = 'Firmado en la nube'
   and firmada_en > '2001-01-02' and reabierta_por = '00000000-0000-0000-0000-0000000000a4' and reabierta_en > now() - interval '1 minute';
select 'bandeja: la consulta queda en borrador con revisión 2 y sin firma (debe 1): ' || count(*) from clinico.consultas
 where id = '14200000-0000-0000-0000-0000000000c1' and estado = 'borrador' and revision = 2 and firmada_en is null and enfermedad_actual = 'Corregido en la PC';
set role authenticated;
-- Otra PC no repite la corrección ni toca la versión
select set_config('sync.equipo_id', '14200000-0000-0000-0000-0000000000e2', false) \g /dev/null
do $$ begin insert into clinico.consultas_versiones (org_id,consulta_id,revision,firmada_en,contenido,motivo) values ('10000000-0000-0000-0000-000000000001','14200000-0000-0000-0000-0000000000c1',1,now(),'{"consulta":{"estado":"firmada"}}','Otra PC corrige');
 raise notice 'otra PC repite la corrección: FALLA'; exception when others then raise notice 'otra PC no repite la corrección (ok)'; end $$;
do $$ begin update clinico.consultas_versiones set motivo = 'Editada después' where id = '14200000-0000-0000-0000-0000000000d1';
 raise notice 'editar una versión: FALLA'; exception when insufficient_privilege then raise notice 'una versión no se edita (ok)'; end $$;
do $$ begin delete from clinico.consultas_versiones where id = '14200000-0000-0000-0000-0000000000d1';
 raise notice 'borrar una versión: FALLA'; exception when insufficient_privilege then raise notice 'una versión no se borra (ok)'; end $$;
reset role;
select 'nadie edita ni borra una versión (debe 1): ' || count(*) from clinico.consultas_versiones where id = '14200000-0000-0000-0000-0000000000d1' and motivo = 'Corregir la tensión arterial';

-- Firmada y corregida sin internet antes de sincronizar: la consulta sube primero (cerrada → borrador, revisión 2)
-- y después la versión, cuya copia de la PC vale porque la nube nunca vio la firma y el último cambio es de esa PC
insert into clinico.consultas (id,org_id,empresa_id,trabajador_id,medico_id,estado,hora_cierre) values
 ('14200000-0000-0000-0000-0000000000c2','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a','30000000-0000-0000-0000-00000000000a','00000000-0000-0000-0000-0000000000a4','cerrada',now());
set role authenticated;
select set_config('sync.equipo_id', '14200000-0000-0000-0000-0000000000e1', false) \g /dev/null
update clinico.consultas set estado = 'borrador', revision = 2, hora_cierre = null where id = '14200000-0000-0000-0000-0000000000c2';
insert into clinico.consultas_versiones (id,org_id,consulta_id,revision,firmada_en,contenido,motivo) values ('14200000-0000-0000-0000-0000000000d2','10000000-0000-0000-0000-000000000001','14200000-0000-0000-0000-0000000000c2',1,'2026-10-29 15:00+00','{"consulta":{"estado":"firmada","enfermedad_actual":"Firmado en la PC"}}','Firmé y corregí sin internet');
reset role;
select 'bandeja: firmada y corregida sin internet guarda la copia de la PC (debe 1): ' || count(*) from clinico.consultas_versiones
 where id = '14200000-0000-0000-0000-0000000000d2' and contenido #>> '{consulta,enfermedad_actual}' = 'Firmado en la PC';

-- Corregida y vuelta a firmar en un solo cambio (firmada → firmada, revisión 2): pasa con su versión y revoca enlaces
insert into clinico.consultas (id,org_id,empresa_id,trabajador_id,medico_id,estado,hora_cierre) values
 ('14200000-0000-0000-0000-0000000000c3','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a','30000000-0000-0000-0000-00000000000a','00000000-0000-0000-0000-0000000000a4','cerrada',now());
update clinico.consultas set estado = 'firmada' where id = '14200000-0000-0000-0000-0000000000c3';
set role authenticated;
insert into clinico.consultas_versiones (org_id,consulta_id,revision,firmada_en,contenido,motivo) values ('10000000-0000-0000-0000-000000000001','14200000-0000-0000-0000-0000000000c3',1,now(),'{}','Corregir y volver a firmar');
update clinico.consultas set revision = 2, enfermedad_actual = 'Corregida y firmada', firmada_en = now() where id = '14200000-0000-0000-0000-0000000000c3';
reset role;
select 'bandeja: corregida y vuelta a firmar en un cambio (debe 1): ' || count(*) from clinico.consultas
 where id = '14200000-0000-0000-0000-0000000000c3' and estado = 'firmada' and revision = 2 and enfermedad_actual = 'Corregida y firmada';
select 'revocar enlaces al corregir y volver a firmar existe (debe 1): ' || count(*) from pg_trigger where tgname = 'revocar_enlaces_al_corregir';
select set_config('sync.cambio_id', '', false) \g /dev/null
select set_config('sync.equipo_id', '', false) \g /dev/null

-- Web: reabrir_consulta sigue igual (sin equipo)
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a4',false) \g /dev/null
select 'web: reabrir_consulta sigue funcionando (debe 3): ' || public.reabrir_consulta('14200000-0000-0000-0000-0000000000c3', 'Corrección hecha desde la web');
reset role;
delete from clinico.consultas_versiones where consulta_id in ('14200000-0000-0000-0000-0000000000c1','14200000-0000-0000-0000-0000000000c2','14200000-0000-0000-0000-0000000000c3');
delete from clinico.consultas where id in ('14200000-0000-0000-0000-0000000000c1','14200000-0000-0000-0000-0000000000c2','14200000-0000-0000-0000-0000000000c3');
select set_config('request.jwt.claim.sub', '', false) \g /dev/null

-- En la PC sin hora verificada, corregir espera (igual que firmar)
insert into clinico.consultas (id,org_id,empresa_id,trabajador_id,medico_id,estado,hora_cierre) values
 ('14200000-0000-0000-0000-0000000000c4','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a','30000000-0000-0000-0000-00000000000a','00000000-0000-0000-0000-0000000000a4','cerrada',now());
update clinico.consultas set estado = 'firmada' where id = '14200000-0000-0000-0000-0000000000c4';
select set_config('zamorapp.local', 'on', false) \g /dev/null
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a4',false) \g /dev/null
do $$ begin perform public.reabrir_consulta('14200000-0000-0000-0000-0000000000c4', 'Corrección sin hora verificada');
 raise notice 'PC sin hora verificada corrige: FALLA'; exception when others then
 raise notice 'PC sin hora verificada: corregir espera (ok: %)', left(sqlerrm, 60); end $$;
reset role;
select set_config('zamorapp.local', '', false) \g /dev/null
delete from clinico.consultas where id = '14200000-0000-0000-0000-0000000000c4';
select set_config('request.jwt.claim.sub', '', false) \g /dev/null
