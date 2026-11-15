-- Hora de cada paso de citas y solicitudes: la pone la base; un usuario no la escribe; la sincronía la conserva
\pset tuples_only on
reset role;
select set_config('request.jwt.claim.sub','',false) \g /dev/null
set role authenticated;

-- Médico de A: crea la cita intentando poner horas propias
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false) \g /dev/null
insert into public.citas (id, org_id, empresa_id, trabajador_id, fecha, estado, confirmada_en, atendida_en)
values ('c1580000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a',
        '30000000-0000-0000-0000-00000000000a', current_date, 'citado', '2020-01-01', '2020-01-01');
select 'alta: confirmada con la hora de la base (debe 1): ' || count(*) from public.citas
 where id='c1580000-0000-0000-0000-000000000001' and confirmada_en > now() - interval '1 minute';
select 'alta: la hora inventada de atendido se descarta (debe 1): ' || count(*) from public.citas
 where id='c1580000-0000-0000-0000-000000000001' and atendida_en is null;
update public.citas set estado='en_espera' where id='c1580000-0000-0000-0000-000000000001';
select 'llegó: la base pone la llegada si no viene (debe 1): ' || count(*) from public.citas
 where id='c1580000-0000-0000-0000-000000000001' and llegada is not null;
update public.citas set atendida_en='2020-01-01', confirmada_en=null where id='c1580000-0000-0000-0000-000000000001';
select 'sin cambio de estado las horas no se tocan (debe 1): ' || count(*) from public.citas
 where id='c1580000-0000-0000-0000-000000000001' and atendida_en is null and confirmada_en is not null;
update public.citas set estado='en_consulta' where id='c1580000-0000-0000-0000-000000000001';
update public.citas set estado='atendido', atendida_en='2020-01-01' where id='c1580000-0000-0000-0000-000000000001';
select 'atendido con la hora de la base (debe 1): ' || count(*) from public.citas
 where id='c1580000-0000-0000-0000-000000000001' and atendida_en > now() - interval '1 minute' and en_consulta_en is not null;

-- RR. HH. de A ve las horas
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a3',false) \g /dev/null
select 'RRHH ve la hora de cada paso (debe 1): ' || count(*) from public.citas
 where id='c1580000-0000-0000-0000-000000000001' and confirmada_en is not null and llegada is not null and atendida_en is not null;
insert into public.citas (id, org_id, empresa_id, trabajador_id, fecha, estado, origen, cerrada_en)
values ('c1580000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a',
        '30000000-0000-0000-0000-00000000000a', current_date + 3, 'solicitada', 'portal', '2020-01-01');
update public.citas set estado='cancelada', cerrada_en='2020-01-01' where id='c1580000-0000-0000-0000-000000000002';
select 'RRHH cancela: hora de la base, no la suya (debe 1): ' || count(*) from public.citas
 where id='c1580000-0000-0000-0000-000000000002' and cerrada_en > now() - interval '1 minute';

-- Solicitudes: RR. HH. pide; el servicio la atiende
insert into public.solicitudes (id, org_id, empresa_id, tipo, detalle, en_proceso_en, respondida_en)
values ('c1580000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a',
        'Copia', 'Copia de la constancia', '2020-01-01', '2020-01-01');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false) \g /dev/null
select 'solicitud nueva sin horas inventadas (debe 1): ' || count(*) from public.solicitudes
 where id='c1580000-0000-0000-0000-000000000003' and en_proceso_en is null and respondida_en is null;
update public.solicitudes set estado='en_proceso' where id='c1580000-0000-0000-0000-000000000003';
update public.solicitudes set estado='respondida', respuesta='Listo', en_proceso_en='2020-01-01' where id='c1580000-0000-0000-0000-000000000003';
select 'en proceso y respondida con hora de la base (debe 1): ' || count(*) from public.solicitudes
 where id='c1580000-0000-0000-0000-000000000003' and en_proceso_en > now() - interval '1 minute' and respondida_en > now() - interval '1 minute';

-- Sincronía del escritorio (corre con su propio rol): conserva la hora real de la PC
reset role;
update public.citas set estado='no_asistio', cerrada_en='2026-10-30 09:15-04' where id='c1580000-0000-0000-0000-000000000002';
select 'sincronía: la hora de la PC llega tal cual (debe 1): ' || count(*) from public.citas
 where id='c1580000-0000-0000-0000-000000000002' and cerrada_en = '2026-10-30 09:15-04';

delete from public.citas where id::text like 'c1580000-%';
delete from public.solicitudes where id::text like 'c1580000-%';
