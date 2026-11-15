-- Correo de «Proponer otra hora» con reintento (20261030802000): 3 intentos con espera, aviso al servicio si no sale.
\pset tuples_only on
reset role;
insert into public.avisos_push_clave (org_id, clave_hash) values ('10000000-0000-0000-0000-000000000001', sha256(convert_to(repeat('k', 40), 'UTF8')))
 on conflict (org_id) do update set clave_hash = excluded.clave_hash;
insert into public.citas (id, org_id, empresa_id, trabajador_id, fecha, hora, estado, origen) values
 ('19500000-0000-0000-0000-0000000000c1', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-00000000000a', '30000000-0000-0000-0000-00000000000a', public.hoy_caracas() + 12, '08:00', 'solicitada', 'portal');
update public.citas set propuesta_fecha = public.hoy_caracas() + 13, propuesta_desde = '09:00', propuesta_modo = 'exacta'
 where id = '19500000-0000-0000-0000-0000000000c1';

set role anon;
create temp table t195 as select * from public.correos_propuestas_por_enviar(repeat('k', 40));
select 'toma la propuesta con su cita (debe 1): ' || count(*) from t195 where '19500000-0000-0000-0000-0000000000c1' = any (citas) and 'rrhhA@x' = any (para);
select 'otra clave no informa nada (debe 0): ' || public.resultado_correo_propuesta(repeat('x', 40), array['19500000-0000-0000-0000-0000000000c1'::uuid], false, 'x');
select 'primer fallo: informado (debe 1): ' || public.resultado_correo_propuesta(repeat('k', 40), array['19500000-0000-0000-0000-0000000000c1'::uuid], false, 'SMTP 421');
reset role;
select 'queda «reintentar» con el motivo (debe 1): ' || count(*) from public.citas
 where id = '19500000-0000-0000-0000-0000000000c1' and propuesta_correo_estado = 'reintentar' and propuesta_correo_intentos = 1 and propuesta_correo_error = 'SMTP 421';
set role anon;
select 'antes de la espera no se reintenta (debe 0): ' || count(*) from public.correos_propuestas_por_enviar(repeat('k', 40)) where '19500000-0000-0000-0000-0000000000c1' = any (citas);
reset role;
update public.citas set propuesta_correo_en = public.ahora() - interval '6 minutes' where id = '19500000-0000-0000-0000-0000000000c1';
set role anon;
select 'pasada la espera se reintenta (debe 1): ' || count(*) from public.correos_propuestas_por_enviar(repeat('k', 40)) where '19500000-0000-0000-0000-0000000000c1' = any (citas);
select public.resultado_correo_propuesta(repeat('k', 40), array['19500000-0000-0000-0000-0000000000c1'::uuid], false, 'SMTP 421') \g /dev/null
reset role;
update public.citas set propuesta_correo_en = public.ahora() - interval '11 minutes' where id = '19500000-0000-0000-0000-0000000000c1';
set role anon;
select 'tercer intento (debe 1): ' || count(*) from public.correos_propuestas_por_enviar(repeat('k', 40)) where '19500000-0000-0000-0000-0000000000c1' = any (citas);
select public.resultado_correo_propuesta(repeat('k', 40), array['19500000-0000-0000-0000-0000000000c1'::uuid], false, 'SMTP 550 buzón lleno') \g /dev/null
reset role;
select 'al 3.er fallo queda «fallido» (debe 1): ' || count(*) from public.citas
 where id = '19500000-0000-0000-0000-0000000000c1' and propuesta_correo_estado = 'fallido' and propuesta_correo_intentos = 3;
select 'el servicio recibe «No salió el correo» con el motivo (debe 1): ' || count(*) from public.notificaciones
 where usuario_id = '00000000-0000-0000-0000-0000000000a1' and titulo = 'No salió el correo de la propuesta' and texto like '%buzón lleno%WhatsApp%';
select 'RR. HH. no recibe ese aviso (debe 0): ' || count(*) from public.notificaciones
 where usuario_id = '00000000-0000-0000-0000-0000000000a3' and titulo = 'No salió el correo de la propuesta';
update public.citas set propuesta_correo_en = public.ahora() - interval '1 hour' where id = '19500000-0000-0000-0000-0000000000c1';
set role anon;
select 'fallido no se vuelve a tomar (debe 0): ' || count(*) from public.correos_propuestas_por_enviar(repeat('k', 40)) where '19500000-0000-0000-0000-0000000000c1' = any (citas);
reset role;

-- RR. HH. no puede reiniciar ni maquillar el correo de la propuesta (Analizar, 04-nov)
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a3',false) \g /dev/null
do $$ begin
  update public.citas set propuesta_correo_estado = null, propuesta_correo_intentos = 0 where id = '19500000-0000-0000-0000-0000000000c1';
  raise notice 'FALLA: RR. HH. reinició el correo de la propuesta';
exception when insufficient_privilege then null;
end $$;
do $$ begin
  update public.citas set propuesta_correo_en = null where id = '19500000-0000-0000-0000-0000000000c1';
  raise notice 'FALLA: RR. HH. borró la hora del correo';
exception when insufficient_privilege then null;
end $$;
do $$ begin
  update public.citas set propuesta_correo_estado = 'enviado' where id = '19500000-0000-0000-0000-0000000000c1';
  raise notice 'FALLA: RR. HH. marcó el correo como enviado';
exception when insufficient_privilege then null;
end $$;
do $$ begin
  update public.citas set propuesta_recordada_en = public.ahora() where id = '19500000-0000-0000-0000-0000000000c1';
  raise notice 'FALLA: RR. HH. apagó el recordatorio';
exception when insufficient_privilege then null;
end $$;
select set_config('request.jwt.claim.sub', '', false) \g /dev/null
reset role;
select 'tras los intentos de RR. HH. la fila no cambió (debe 1): ' || count(*) from public.citas
 where id = '19500000-0000-0000-0000-0000000000c1' and propuesta_correo_estado = 'fallido' and propuesta_correo_intentos = 3;

-- Proponer otra hora reinicia el correo; con éxito queda «enviado» y no se repite
update public.citas set propuesta_desde = '10:00' where id = '19500000-0000-0000-0000-0000000000c1';
select 'nueva propuesta: correo desde cero (debe 1): ' || count(*) from public.citas
 where id = '19500000-0000-0000-0000-0000000000c1' and propuesta_correo_estado is null and propuesta_correo_intentos = 0 and propuesta_correo_error is null;
set role anon;
select 'se toma de nuevo (debe 1): ' || count(*) from public.correos_propuestas_por_enviar(repeat('k', 40)) where '19500000-0000-0000-0000-0000000000c1' = any (citas);
select public.resultado_correo_propuesta(repeat('k', 40), array['19500000-0000-0000-0000-0000000000c1'::uuid], true, null) \g /dev/null
reset role;
select 'enviado (debe 1): ' || count(*) from public.citas where id = '19500000-0000-0000-0000-0000000000c1' and propuesta_correo_estado = 'enviado';
update public.citas set propuesta_correo_en = public.ahora() - interval '1 hour' where id = '19500000-0000-0000-0000-0000000000c1';
set role anon;
select 'enviado no se repite (debe 0): ' || count(*) from public.correos_propuestas_por_enviar(repeat('k', 40)) where '19500000-0000-0000-0000-0000000000c1' = any (citas);
select 'un resultado tardío no cambia lo enviado (debe 0): ' || public.resultado_correo_propuesta(repeat('k', 40), array['19500000-0000-0000-0000-0000000000c1'::uuid], false, 'x');
reset role;

-- Sin ningún correo en la empresa: fallido de una vez (no se reintenta)
update public.citas set propuesta_desde = '11:00' where id = '19500000-0000-0000-0000-0000000000c1';
set role anon;
select count(*) from public.correos_propuestas_por_enviar(repeat('k', 40)) \g /dev/null
select public.resultado_correo_propuesta(repeat('k', 40), array['19500000-0000-0000-0000-0000000000c1'::uuid], false, 'La empresa no tiene correo registrado', true) \g /dev/null
reset role;
select 'sin correo: fallido al primer intento (debe 1): ' || count(*) from public.citas
 where id = '19500000-0000-0000-0000-0000000000c1' and propuesta_correo_estado = 'fallido' and propuesta_correo_intentos = 1;

-- La ruta se cayó a mitad del 3.er intento: a los 10 min queda fallido con aviso
update public.citas set propuesta_desde = '12:00' where id = '19500000-0000-0000-0000-0000000000c1';
update public.citas set propuesta_correo_estado = 'enviando', propuesta_correo_intentos = 3, propuesta_correo_en = public.ahora() - interval '11 minutes'
 where id = '19500000-0000-0000-0000-0000000000c1';
set role anon;
select 'envío caído sin intentos: no se toma (debe 0): ' || count(*) from public.correos_propuestas_por_enviar(repeat('k', 40)) where '19500000-0000-0000-0000-0000000000c1' = any (citas);
reset role;
select 'envío caído: fallido «El envío no terminó» (debe 1): ' || count(*) from public.citas
 where id = '19500000-0000-0000-0000-0000000000c1' and propuesta_correo_estado = 'fallido' and propuesta_correo_error = 'El envío no terminó';
select 'avisos al servicio: 3 (debe 3): ' || count(*) from public.notificaciones
 where usuario_id = '00000000-0000-0000-0000-0000000000a1' and titulo = 'No salió el correo de la propuesta';

-- Limpieza
delete from public.notificaciones where titulo = 'No salió el correo de la propuesta' or enlace = '/portal#propuestas'
   or texto like '%' || to_char(public.hoy_caracas() + 12, 'DD/MM/YYYY') || '%';
delete from public.citas where id = '19500000-0000-0000-0000-0000000000c1';
