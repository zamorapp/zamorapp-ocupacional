-- Disponibilidad para las citas de RR. HH. (Cesar, 31-oct): horario con cupos, bloqueos, proponer otra hora y choques.
\pset tuples_only on
reset role;
-- Horario de prueba todos los días: 8:00 a 10:00, turnos de 30 min, 2 cupos (4 turnos)
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a3',false) \g /dev/null
do $$ begin
  insert into public.horario_atencion (org_id, dia, desde, hasta) values ('10000000-0000-0000-0000-000000000001', 1, '08:00', '09:00');
  raise notice 'FALLA: RR. HH. pudo cargar horario';
exception when insufficient_privilege or check_violation then null;
end $$;
select 'sin horario, la agenda dice «no configurado» (debe 1): ' || (not (public.agenda_portal('20000000-0000-0000-0000-00000000000a', public.hoy_caracas() + 7) ->> 'configurado')::boolean)::int;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false) \g /dev/null
insert into public.horario_atencion (org_id, dia, desde, hasta, minutos, cupos)
  select '10000000-0000-0000-0000-000000000001', d, '08:00', '10:00', 30, 2 from generate_series(1, 7) d;
insert into public.bloqueos_agenda (id, org_id, fecha, desde, hasta, motivo) values
 ('18300000-0000-0000-0000-0000000000b1', '10000000-0000-0000-0000-000000000001', public.hoy_caracas() + 7, '09:30', '10:00', 'Charla en empresa B'),
 ('18300000-0000-0000-0000-0000000000b2', '10000000-0000-0000-0000-000000000001', public.hoy_caracas() + 8, null, null, 'Feriado');
-- Una cita de la empresa B a las 8:00 ocupa un cupo
insert into public.citas (id, org_id, empresa_id, trabajador_id, fecha, hora, estado) values
 ('18300000-0000-0000-0000-0000000000c0', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-00000000000b', '30000000-0000-0000-0000-00000000000b', public.hoy_caracas() + 7, '08:00', 'citado');

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a3',false) \g /dev/null
select 'RR. HH. no ve los bloqueos ni su motivo (debe 0): ' || count(*) from public.bloqueos_agenda;
select 'RR. HH. ve el horario (debe 7): ' || count(*) from public.horario_atencion;
create temp table a181 as select public.agenda_portal('20000000-0000-0000-0000-00000000000a', public.hoy_caracas() + 7) as j;
select 'turnos del día sin el bloqueado (debe 3): ' || jsonb_array_length(j -> 'horas') from a181;
select 'a las 8:00 queda 1 cupo (debe 1): ' || (h ->> 'libres') from a181, jsonb_array_elements(j -> 'horas') h where h ->> 'hora' = '08:00';
select 'la agenda no dice de qué empresa es la otra cita (debe 0): ' || (j::text ~ '"B"|empresa')::int from a181;
select 'el día feriado no sale entre los días con cupo (debe 0): ' || count(*) from a181, jsonb_array_elements(j -> 'dias') d where d ->> 'fecha' = (public.hoy_caracas() + 8)::text;
select 'RR. HH. no ve la agenda de una empresa ajena (debe 1): ' || (public.agenda_portal('20000000-0000-0000-0000-00000000000b', public.hoy_caracas() + 7) is null)::int;

-- RR. HH. pide: hora libre sí; bloqueada, fuera del horario o sin hora, no
insert into public.citas (id, org_id, empresa_id, trabajador_id, fecha, hora, estado, origen, solicitada_por) values
 ('18300000-0000-0000-0000-0000000000c1', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-00000000000a', '30000000-0000-0000-0000-00000000000a', public.hoy_caracas() + 7, '08:00', 'solicitada', 'portal', '00000000-0000-0000-0000-0000000000a3');
select 'pide la última hora libre de las 8:00 (debe 1): ' || count(*) from public.citas where id = '18300000-0000-0000-0000-0000000000c1';
do $$
declare h time; f int;
begin
  foreach h in array array['08:00', '09:30', '11:00']::time[] loop
    begin
      insert into public.citas (org_id, empresa_id, trabajador_id, fecha, hora, estado, origen)
      values ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-00000000000a', '30000000-0000-0000-0000-00000000000a', public.hoy_caracas() + 7, h, 'solicitada', 'portal');
      raise notice 'FALLA: RR. HH. pidió la hora % que no está libre', h;
    exception when check_violation then null;
    end;
  end loop;
  begin
    insert into public.citas (org_id, empresa_id, trabajador_id, fecha, hora, estado, origen)
    values ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-00000000000a', '30000000-0000-0000-0000-00000000000a', public.hoy_caracas() + 7, null, 'solicitada', 'portal');
    raise notice 'FALLA: RR. HH. pidió sin hora habiendo horario';
  exception when check_violation then null;
  end;
  -- Dos trabajadores a las 8:30 en una sola instrucción (2 cupos): entran; un tercero, no
  insert into public.citas (org_id, empresa_id, trabajador_id, fecha, hora, estado, origen)
  select '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-00000000000a', '30000000-0000-0000-0000-00000000000a', public.hoy_caracas() + 7, '08:30', 'solicitada', 'portal'
    from generate_series(1, 2);
  begin
    insert into public.citas (org_id, empresa_id, trabajador_id, fecha, hora, estado, origen)
    values ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-00000000000a', '30000000-0000-0000-0000-00000000000a', public.hoy_caracas() + 7, '08:30', 'solicitada', 'portal');
    raise notice 'FALLA: tercer trabajador en un turno de 2 cupos';
  exception when check_violation then null;
  end;
end $$;
do $$ begin
  update public.citas set propuesta_fecha = public.hoy_caracas() + 9, propuesta_desde = '08:00', propuesta_modo = 'exacta' where id = '18300000-0000-0000-0000-0000000000c1';
  raise notice 'FALLA: RR. HH. se puso una propuesta';
exception when insufficient_privilege then null;
end $$;

-- El servicio propone «entre 8:00 y 9:00» con nota → RR. HH. recibe el aviso
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false) \g /dev/null
select 'choque informativo a las 8:00 (debe 1): ' || (array_length(public.choques_agenda(public.hoy_caracas() + 7, '08:00', '18300000-0000-0000-0000-0000000000c1'), 1) >= 1)::int;
select 'choque por bloqueo con su motivo (debe 1): ' || (array_to_string(public.choques_agenda(public.hoy_caracas() + 7, '09:30', null), ' ') like '%Charla en empresa B%')::int;
update public.citas set propuesta_fecha = public.hoy_caracas() + 9, propuesta_desde = '08:00', propuesta_hasta = '09:00', propuesta_modo = 'rango', propuesta_nota = 'Ese día tengo otra empresa'
 where id = '18300000-0000-0000-0000-0000000000c1';
select 'la propuesta queda con su hora (debe 1): ' || count(*) from public.citas where id = '18300000-0000-0000-0000-0000000000c1' and propuesta_en is not null;
reset role;
select 'RR. HH. recibe «Nueva hora propuesta» con la nota (debe 1): ' || count(*) from public.notificaciones
 where usuario_id = '00000000-0000-0000-0000-0000000000a3' and titulo = 'Nueva hora propuesta' and texto like '%entre las%Ese día tengo otra empresa%';

-- Correo: con la clave del servidor, una vez, a RR. HH.
insert into public.avisos_push_clave (org_id, clave_hash) values ('10000000-0000-0000-0000-000000000001', sha256(convert_to(repeat('k', 40), 'UTF8')))
 on conflict (org_id) do update set clave_hash = excluded.clave_hash;
set role anon;
select 'correo sin clave: nada (debe 0): ' || count(*) from public.correos_propuestas_por_enviar(repeat('x', 40));
select 'correo a RR. HH. de la empresa (debe 1): ' || count(*) from public.correos_propuestas_por_enviar(repeat('k', 40)) where 'rrhhA@x' = any (para) and texto like '%Ana A%';
select 'el correo sale una sola vez (debe 0): ' || count(*) from public.correos_propuestas_por_enviar(repeat('k', 40));
reset role;

-- RR. HH. acepta a las 8:30 (dentro del rango) → confirmada; fuera del rango, no
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a3',false) \g /dev/null
do $$ begin
  perform public.responder_propuesta('18300000-0000-0000-0000-0000000000c1', true, '09:30');
  raise notice 'FALLA: aceptó fuera del rango';
exception when check_violation then null;
end $$;
select public.responder_propuesta('18300000-0000-0000-0000-0000000000c1', true, '08:30') \g /dev/null
select 'aceptada: confirmada el día y hora propuestos (debe 1): ' || count(*) from public.citas
 where id = '18300000-0000-0000-0000-0000000000c1' and estado = 'citado' and fecha = public.hoy_caracas() + 9 and hora = '08:30'
   and propuesta_fecha is null and respuesta_empresa = 'aceptada' and confirmada_en is not null;
reset role;
select 'el servicio recibe «RR. HH. aceptó la hora» (debe 1): ' || count(*) from public.notificaciones
 where usuario_id = '00000000-0000-0000-0000-0000000000a1' and titulo = 'RR. HH. aceptó la hora';

-- Pedir otra: RR. HH. elige otro día y hora libres, con nota
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false) \g /dev/null
update public.citas set estado = 'solicitada', propuesta_fecha = public.hoy_caracas() + 10, propuesta_desde = '09:00', propuesta_modo = 'exacta', propuesta_nota = null
 where id = '18300000-0000-0000-0000-0000000000c1';
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a3',false) \g /dev/null
do $$ begin
  perform public.responder_propuesta('18300000-0000-0000-0000-0000000000c1', false, '09:30', public.hoy_caracas() + 7, null);
  raise notice 'FALLA: pidió otra hora bloqueada';
exception when check_violation then null;
end $$;
select public.responder_propuesta('18300000-0000-0000-0000-0000000000c1', false, '09:00', public.hoy_caracas() + 11, 'Mejor el jueves') \g /dev/null
select 'pidió otra: vuelve al servicio con su nueva hora y nota (debe 1): ' || count(*) from public.citas
 where id = '18300000-0000-0000-0000-0000000000c1' and estado = 'solicitada' and fecha = public.hoy_caracas() + 11 and hora = '09:00'
   and propuesta_fecha is null and respuesta_empresa = 'pidio_otra' and nota_empresa = 'Mejor el jueves';
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false) \g /dev/null
do $$ begin
  perform public.responder_propuesta('18300000-0000-0000-0000-0000000000c1', true);
  raise notice 'FALLA: el médico respondió como RR. HH.';
exception when insufficient_privilege then null;
end $$;
reset role;
select 'el servicio recibe «RR. HH. pidió otra hora» (debe 1): ' || count(*) from public.notificaciones
 where usuario_id = '00000000-0000-0000-0000-0000000000a1' and titulo = 'RR. HH. pidió otra hora' and texto like '%Mejor el jueves%';

-- Recordatorio a las 24 h, una sola vez
update public.citas set propuesta_fecha = public.hoy_caracas() + 10, propuesta_desde = '09:00', propuesta_modo = 'exacta' where id = '18300000-0000-0000-0000-0000000000c1';
update public.citas set propuesta_en = public.ahora() - interval '25 hours' where id = '18300000-0000-0000-0000-0000000000c1';
select 'recordatorio de propuestas sin respuesta (debe 1): ' || public.recordar_propuestas();
select 'no se repite (debe 0): ' || public.recordar_propuestas();

-- RR. HH. activa avisos en su celular y el latido le manda solo lo suyo
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a3',false) \g /dev/null
select public.guardar_suscripcion_push('10000000-0000-0000-0000-000000000001', 'https://push.ejemplo/rrhh181', repeat('p', 87), repeat('a', 22), 'Android', repeat('k', 40)) \g /dev/null
select 'RR. HH. activó avisos (debe 1): ' || count(*) from public.suscripciones_push where endpoint = 'https://push.ejemplo/rrhh181';
reset role;
delete from public.avisos_push_latido;
set role anon;
select set_config('request.jwt.claim.sub', '', false) \g /dev/null
create temp table l181 as select * from public.avisos_campana_para_celular(repeat('k', 40));
select 'el latido avisa al celular de RR. HH. (debe 1): ' || (count(*) >= 1)::int from l181 where endpoint = 'https://push.ejemplo/rrhh181';
reset role;
select 'RR. HH. no recibe avisos del servicio (debe 0): ' || count(*) from public.notificaciones
 where usuario_id = '00000000-0000-0000-0000-0000000000a3' and titulo in ('Resultados por recibir', 'Alerta para la próxima evaluación', 'Post vacacional pendiente');

-- Limpieza
delete from public.suscripciones_push where endpoint = 'https://push.ejemplo/rrhh181';
delete from public.notificaciones where enlace in ('/portal#propuestas') or titulo in ('RR. HH. aceptó la hora', 'RR. HH. pidió otra hora', 'RR. HH. no ha respondido')
   or (empresa_id in ('20000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000b') and texto like '%' || to_char(public.hoy_caracas() + 7, 'DD/MM/YYYY') || '%');
delete from public.citas where org_id = '10000000-0000-0000-0000-000000000001' and fecha between public.hoy_caracas() + 7 and public.hoy_caracas() + 11;
delete from public.bloqueos_agenda where id in ('18300000-0000-0000-0000-0000000000b1', '18300000-0000-0000-0000-0000000000b2');
delete from public.horario_atencion where org_id = '10000000-0000-0000-0000-000000000001';
select set_config('request.jwt.claim.sub', '', false) \g /dev/null
