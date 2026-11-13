-- Avisos de los enlaces públicos (20261030932000): al abrir (sin contar vistas previas de WhatsApp) y al completar, el
-- servicio recibe un aviso en la campana (que sale al celular por el trigger de siempre). Y el acuse de cada celular.
\pset tuples_only on
reset role;
select set_config('request.jwt.claim.sub','',false) \g /dev/null
delete from public.notificaciones;

-- Datos de apoyo sin pasar por las validaciones de envío (no son lo que se prueba aquí)
set session_replication_role = replica;
insert into public.envios (id,org_id,empresa_id,fecha_lote,canal,destinatario,consultas,documentos,asunto,mensaje,estado,enviado_por) values
 ('23100000-0000-0000-0000-0000000000e1','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a',public.hoy_caracas(),
  'whatsapp','584140000231','{40000000-0000-0000-0000-00000000000a}','{constancia}','x','x','enlace','00000000-0000-0000-0000-0000000000a1');
insert into public.envio_enlaces (id,org_id,envio_id,token_hash) values
 ('23100000-0000-0000-0000-0000000000f1','10000000-0000-0000-0000-000000000001','23100000-0000-0000-0000-0000000000e1',sha256('env-231'::bytea));
insert into public.enlaces_trabajador (id,org_id,trabajador_id,empresa_id,consulta_id,documento,ruta,telefono,token_hash,enviado_por) values
 ('23100000-0000-0000-0000-0000000000a1','10000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-00000000000a','20000000-0000-0000-0000-00000000000a',
  '40000000-0000-0000-0000-00000000000a','dieta','/imprimir/dieta/x','584141234567',sha256('trab-231'::bytea),'00000000-0000-0000-0000-0000000000a1');
set session_replication_role = origin;

-- 1. Documentos a RR. HH. (/e): la vista previa de WhatsApp no cuenta; la primera apertura real sí, una sola vez
insert into public.envio_aperturas (enlace_id, agente) values ('23100000-0000-0000-0000-0000000000f1', 'WhatsApp/2.24.1 A');
select 'vista previa de WhatsApp: sin aviso (debe 0): ' || count(*) from public.notificaciones where titulo = 'RR. HH. abrió los documentos';
insert into public.envio_aperturas (enlace_id, agente) values ('23100000-0000-0000-0000-0000000000f1', 'Mozilla/5.0 (Linux; Android 14) Chrome/130');
select 'RR. HH. abre: aviso al administrador (debe 1): ' || count(*) from public.notificaciones
 where titulo = 'RR. HH. abrió los documentos' and texto = 'A abrió el enlace de constancias que le enviaste.' and enlace = '/envios'
   and usuario_id = '00000000-0000-0000-0000-0000000000a1';
select 'y al médico de A (debe 1): ' || count(*) from public.notificaciones
 where titulo = 'RR. HH. abrió los documentos' and usuario_id = '00000000-0000-0000-0000-0000000000a2';
insert into public.envio_aperturas (enlace_id, agente) values ('23100000-0000-0000-0000-0000000000f1', 'Mozilla/5.0 (Linux; Android 14) Chrome/130');
select 'la segunda apertura no repite el aviso (debe 1): ' || count(*) from public.notificaciones
 where titulo = 'RR. HH. abrió los documentos' and usuario_id = '00000000-0000-0000-0000-0000000000a1';
select 'RR. HH. no recibe el aviso del servicio (debe 0): ' || count(*) from public.notificaciones n
  join public.miembros m on m.usuario_id = n.usuario_id where n.titulo = 'RR. HH. abrió los documentos' and m.rol = 'gerente_empresa';

-- 2. Documentos al trabajador (/t)
insert into public.enlaces_trabajador_aperturas (enlace_id, agente) values ('23100000-0000-0000-0000-0000000000a1', 'facebookexternalhit/1.1');
insert into public.enlaces_trabajador_aperturas (enlace_id, agente) values ('23100000-0000-0000-0000-0000000000a1', 'Mozilla/5.0 Chrome/130');
insert into public.enlaces_trabajador_aperturas (enlace_id, agente) values ('23100000-0000-0000-0000-0000000000a1', 'Mozilla/5.0 Chrome/130');
select 'trabajador abre: un aviso por persona del servicio con su nombre y su ficha (debe 1): ' || count(*) from public.notificaciones
 where titulo = 'Trabajador abrió sus documentos' and texto = 'Ana A abrió el enlace que le enviaste.'
   and enlace = '/pacientes/30000000-0000-0000-0000-00000000000a' and usuario_id = '00000000-0000-0000-0000-0000000000a1';

-- 3. Depurar nómina (/nomina): al entrar con su teléfono y al enviar
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false) \g /dev/null
create temp table enlace_231 as select public.crear_depuracion_nomina('20000000-0000-0000-0000-00000000000a', 'Daniela', '0414-7654321') as r;
reset role;
select set_config('request.jwt.claim.sub','',false) \g /dev/null
update public.depuraciones_nomina set dispositivo_hash = sha256('aparato'::bytea), dispositivo_en = public.ahora() where rrhh_nombre = 'Daniela';
select 'RR. HH. entra: aviso con su nombre y la empresa (debe 1): ' || count(*) from public.notificaciones
 where titulo = 'RR. HH. abrió la depuración de nómina' and texto = 'Daniela (A) abrió el enlace para depurar la nómina.'
   and enlace = '/empresas/20000000-0000-0000-0000-00000000000a' and usuario_id = '00000000-0000-0000-0000-0000000000a1';
update public.depuraciones_nomina set respuestas = '{"30000000-0000-0000-0000-00000000000a":{"e":"no"}}', enviado_en = public.ahora() where rrhh_nombre = 'Daniela';
select 'RR. HH. envía: aviso con el resumen (debe 1): ' || count(*) from public.notificaciones
 where titulo = 'RR. HH. envió la depuración de nómina' and texto = 'A: 1 sale. Revisa y confirma.' and usuario_id = '00000000-0000-0000-0000-0000000000a1';
update public.depuraciones_nomina set enviado_en = public.ahora() + interval '1 minute' where rrhh_nombre = 'Daniela';
select 'enviar otra vez enseguida no repite el aviso (debe 1): ' || count(*) from public.notificaciones
 where titulo = 'RR. HH. envió la depuración de nómina' and usuario_id = '00000000-0000-0000-0000-0000000000a1';

-- 3b. Enlace del paciente (/registro): título parejo y la ruta de la 931000 (/atencion/enlaces) intacta
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false) \g /dev/null
insert into public.solicitudes_paciente (id,org_id,token_hash,nombre) values
 ('23100000-0000-0000-0000-0000000000b1','10000000-0000-0000-0000-000000000001',sha256('reg-231-0123456789-0123456789-0123456789'),'Rosa');
reset role;
select set_config('request.jwt.claim.sub','',false) \g /dev/null
update public.solicitudes_paciente set abierto_en = public.ahora() where id = '23100000-0000-0000-0000-0000000000b1';
select 'paciente abre: «Paciente abrió su enlace» con la ruta de los enlaces (debe 1): ' || count(*) from public.notificaciones
 where titulo = 'Paciente abrió su enlace' and texto = 'Rosa abrió el enlace que le enviaste.'
   and enlace = '/atencion/enlaces' and usuario_id = '00000000-0000-0000-0000-0000000000a1';
select 'el parche solo cambió los títulos (debe 0): ' || (position('Enlace abierto' in pg_get_functiondef('public.avisar_enlace_paciente()'::regprocedure)) > 0
  or position('Documentos descargados' in pg_get_functiondef('public.avisar_enlace_paciente()'::regprocedure)) > 0)::int;
delete from public.solicitudes_paciente where id = '23100000-0000-0000-0000-0000000000b1';

-- 4. La puerta única: nadie de afuera la llama, y un aviso nunca hace fallar lo que se está haciendo
select 'avisar_enlace no es pública (debe 0): ' || (has_function_privilege('anon', 'public.avisar_enlace(uuid,uuid,text,text,text)', 'execute')
  or has_function_privilege('authenticated', 'public.avisar_enlace(uuid,uuid,text,text,text)', 'execute'))::int;
select 'ruta ajena no se guarda (debe 0): ' || count(*) from (select public.avisar_enlace('10000000-0000-0000-0000-000000000001', null, 'Prueba ruta', 'x', '//sitio-ajeno')) x
  join public.notificaciones n on n.titulo = 'Prueba ruta' and n.enlace is not null;
select 'vista previa de Telegram y bots (debe 3): ' || (public.es_vista_previa('TelegramBot (like TwitterBot)')::int + public.es_vista_previa('Googlebot/2.1')::int
  + public.es_vista_previa('WhatsApp/2.23')::int + public.es_vista_previa('Mozilla/5.0 (Linux; Android 14) Chrome/130 Mobile Safari/537.36')::int);

-- 5. Acuse del celular: solo con la clave del servidor y solo su suscripción
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false) \g /dev/null
select public.guardar_suscripcion_push('10000000-0000-0000-0000-000000000001', 'https://push.ejemplo/231', repeat('p', 87), repeat('a', 22), 'Android', repeat('k', 40)) \g /dev/null
set role anon;
select set_config('request.jwt.claim.sub','',false) \g /dev/null
select public.acuse_aviso_push('https://push.ejemplo/231', repeat('x', 40), true) \g /dev/null
reset role;
select 'clave errada: sin acuse (debe 0): ' || count(ultimo_acuse) from public.suscripciones_push where endpoint = 'https://push.ejemplo/231';
set role anon;
select public.acuse_aviso_push('https://push.ejemplo/231', repeat('k', 40), false) \g /dev/null
reset role;
select 'con la clave: acuse anotado y «no se pudo mostrar» (debe 1): ' || count(*) from public.suscripciones_push
 where endpoint = 'https://push.ejemplo/231' and ultimo_acuse is not null and acuse_mostrado = false;
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false) \g /dev/null
select 'el dueño lee su acuse (debe 1): ' || count(*) from public.suscripciones_push where endpoint = 'https://push.ejemplo/231' and ultimo_acuse is not null;
do $$ begin
  update public.suscripciones_push set ultimo_acuse = null where endpoint = 'https://push.ejemplo/231';
  if found then raise notice 'el dueño cambia su acuse: FALLA'; end if;
exception when insufficient_privilege then null; end $$;

-- Limpieza
reset role;
select set_config('request.jwt.claim.sub','',false) \g /dev/null
delete from public.suscripciones_push;
delete from public.avisos_push_clave;
delete from public.notificaciones;
delete from public.depuraciones_nomina where rrhh_nombre = 'Daniela';
delete from public.enlaces_trabajador where id = '23100000-0000-0000-0000-0000000000a1';
delete from public.envio_enlaces where id = '23100000-0000-0000-0000-0000000000f1';
delete from public.envios where id = '23100000-0000-0000-0000-0000000000e1';
