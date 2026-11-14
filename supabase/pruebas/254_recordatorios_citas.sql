-- Recordatorios de citas (Cesar, 14-nov-2026): 3 días / 1 día / 1 hora antes, sin repetir, solo las empresas que cada
-- uno ve, ajustes de la organización, celular apagable y correo con reintento (solo en la nube).
\pset tuples_only on
reset role;
delete from public.recordatorios_citas_correos;
delete from public.notificaciones where enlace like '%&rc=%';
update public.organizaciones set ajustes = ajustes - 'recordatorio_citas' where id = '10000000-0000-0000-0000-000000000001';
insert into public.citas (id, org_id, empresa_id, trabajador_id, fecha, hora, estado) values
 ('25400000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a','30000000-0000-0000-0000-00000000000a','2026-11-17','09:00','citado'),
 ('25400000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000b','30000000-0000-0000-0000-00000000000b','2026-11-17','10:00','citado'),
 ('25400000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a','30000000-0000-0000-0000-00000000000a','2026-11-15','08:00','citado'),
 ('25400000-0000-0000-0000-000000000004','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a','30000000-0000-0000-0000-00000000000a','2026-11-14','08:45','citado'),
 ('25400000-0000-0000-0000-000000000005','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a','30000000-0000-0000-0000-00000000000a','2026-11-14','10:00','citado'),
 ('25400000-0000-0000-0000-000000000006','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a','30000000-0000-0000-0000-00000000000a','2026-11-17','11:00','cancelada');

-- En la PC (hora anclada de la puerta): sábado 14-nov-2026, 8:00 a. m. de Caracas
select set_config('zamorapp.local','on',false) \g /dev/null
select set_config('zamorapp.ahora','2026-11-14 08:00:00-04',false) \g /dev/null
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false) \g /dev/null
select 'administrador: 3 días, mañana y la de las 8:45 (debe 3): ' || public.recordar_citas();
select 'en 3 días agrupa las 2 del martes (sin la cancelada) (debe 1): ' || count(*) from public.notificaciones
 where titulo = 'En 3 días (martes 17) tienes 2 citas' and enlace = '/atencion?dia=2026-11-17&rc=d3';
select 'mañana con la lista (debe 1): ' || count(*) from public.notificaciones
 where titulo = 'Mañana tienes 1 cita' and texto like '8:00 a. m. %' and enlace = '/atencion?dia=2026-11-15&rc=d1';
select 'la de 1 hora antes es un aviso con su hora (debe 1): ' || count(*) from public.notificaciones
 where titulo = 'Cita a las 8:45 a. m.' and texto like 'Dentro de 1 hora · %' and nivel = 'aviso';
select 'no se repite (debe 0): ' || public.recordar_citas();
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false) \g /dev/null
select 'médico limitado a la empresa A (debe 3): ' || public.recordar_citas();
select 'y no ve la cita de la empresa B (debe 1): ' || count(*) from public.notificaciones where titulo = 'En 3 días (martes 17) tienes 1 cita';
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a3',false) \g /dev/null
select 'RR. HH. no recibe recordatorios del servicio (debe 0): ' || public.recordar_citas();
reset role;
select 'en la PC no se encola correo (debe 0): ' || count(*) from public.recordatorios_citas_correos;

-- Ajustes: 1 día antes desde las 9 a. m. y 30 minutos antes, sin celular
delete from public.notificaciones where enlace like '%&rc=%';
update public.organizaciones set ajustes = ajustes || '{"recordatorio_citas":{"avisos":[{"valor":1,"unidad":"dias","activo":true},{"valor":30,"unidad":"minutos","activo":true},{"valor":1,"unidad":"horas","activo":false}],"celular":false,"hora_dias":9}}'
 where id = '10000000-0000-0000-0000-000000000001';
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false) \g /dev/null
select 'a las 8:00: ni el de días (desde las 9) ni el de 30 min (debe 0): ' || public.recordar_citas();
select set_config('zamorapp.ahora','2026-11-14 08:20:00-04',false) \g /dev/null
select 'a las 8:20: el de 30 minutos (debe 1): ' || public.recordar_citas();
select set_config('zamorapp.ahora','2026-11-14 09:05:00-04',false) \g /dev/null
select 'a las 9:05: el de mañana (debe 1): ' || public.recordar_citas();
reset role;
select 'celular apagado: quedan marcados como enviados (debe 2): ' || count(*) from public.avisos_push_enviadas e
 join public.notificaciones n on n.id = e.notificacion_id where n.enlace like '%&rc=%';
select 'la de 30 min dice cuánto falta (debe 1): ' || count(*) from public.notificaciones where texto like 'Dentro de 30 minutos · %';

-- En la nube: correo con la lista del día y reintento
select set_config('zamorapp.local','',false) \g /dev/null
select set_config('zamorapp.ahora','',false) \g /dev/null
delete from public.notificaciones where enlace like '%&rc=%';
delete from public.citas where id::text like '25400000-%';
update public.organizaciones set ajustes = ajustes || '{"recordatorio_citas":{"hora_dias":0}}' where id = '10000000-0000-0000-0000-000000000001';
insert into public.citas (id, org_id, empresa_id, trabajador_id, fecha, hora, estado) values
 ('25400000-0000-0000-0000-000000000007','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a','30000000-0000-0000-0000-00000000000a',public.hoy_caracas() + 1,null,'citado');
delete from public.avisos_push_clave;
insert into public.avisos_push_clave (org_id, clave_hash) values ('10000000-0000-0000-0000-000000000001', sha256(convert_to('clave-de-prueba-254-con-mas-de-32-letras', 'UTF8')));
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false) \g /dev/null
select 'en la nube crea el de mañana (debe 1): ' || public.recordar_citas();
reset role;
select 'un correo a su dirección con la agenda de mañana (debe 1): ' || count(*) from public.recordatorios_citas_correos
 where para = 'admin@x' and asunto like 'Tu agenda de mañana (%): 1 cita' and texto like 'sin hora · %';
set role anon;
select 'sin la clave no sale nada (debe 0): ' || count(*) from public.correos_recordatorio_citas('otra-clave-de-mas-de-32-letras-xxxxxxxx');
select 'con la clave se toma el correo (debe 1): ' || count(*) from public.correos_recordatorio_citas('clave-de-prueba-254-con-mas-de-32-letras');
select 'tomado no se vuelve a dar enseguida (debe 0): ' || count(*) from public.correos_recordatorio_citas('clave-de-prueba-254-con-mas-de-32-letras');
reset role;
\pset tuples_only off
select id as rid from public.recordatorios_citas_correos limit 1 \gset
\pset tuples_only on
set role anon;
select public.resultado_correo_recordatorio('clave-de-prueba-254-con-mas-de-32-letras', :'rid', 'buzón lleno') \g /dev/null
select 'falla 1: vuelve a la cola (debe 1): ' || count(*) from public.correos_recordatorio_citas('clave-de-prueba-254-con-mas-de-32-letras');
select public.resultado_correo_recordatorio('clave-de-prueba-254-con-mas-de-32-letras', :'rid', 'buzón lleno') \g /dev/null
select 'falla 2: vuelve a la cola (debe 1): ' || count(*) from public.correos_recordatorio_citas('clave-de-prueba-254-con-mas-de-32-letras');
select public.resultado_correo_recordatorio('clave-de-prueba-254-con-mas-de-32-letras', :'rid', 'buzón lleno') \g /dev/null
select 'falla 3: ya no se toma (debe 0): ' || count(*) from public.correos_recordatorio_citas('clave-de-prueba-254-con-mas-de-32-letras');
do $$ begin perform 1 from public.recordatorios_citas_correos; raise notice 'anon lee la cola: FALLA';
exception when insufficient_privilege then raise notice 'la cola no se lee directo (ok)'; end $$;
reset role;
select 'al 3.er fallo queda fallido (debe 1): ' || count(*) from public.recordatorios_citas_correos where estado = 'fallido' and intentos = 3;
select 'y la campana lo dice (debe 1): ' || count(*) from public.notificaciones where titulo = 'No salió el correo de tus citas' and usuario_id = '00000000-0000-0000-0000-0000000000a1';

-- El latido del celular y la constancia de la PC llaman al generador (parches por texto)
select 'latido y constancia lo llaman (debe 2): ' || count(*) from pg_proc
 where proname in ('avisos_campana_para_celular', 'constancia_diferida') and prosrc like '%public.recordar_citas()%';
set role anon;
do $$ begin perform public.recordar_citas(); raise notice 'anon corre el generador: FALLA';
exception when insufficient_privilege then raise notice 'solo con sesión (ok)'; end $$;
reset role;

-- Limpieza
delete from public.notificaciones where enlace like '%&rc=%' or titulo = 'No salió el correo de tus citas';
delete from public.recordatorios_citas_correos;
delete from public.citas where id::text like '25400000-%';
delete from public.avisos_push_clave;
update public.organizaciones set ajustes = ajustes - 'recordatorio_citas' where id = '10000000-0000-0000-0000-000000000001';
