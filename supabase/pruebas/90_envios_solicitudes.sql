-- Envíos a la empresa (registro solo-agregar, consulta médica solo a autorizados, enlaces de WhatsApp) y solicitudes extras.
\pset tuples_only on
reset role;
select set_config('request.jwt.claim.sub','',false) \g /dev/null
-- Consulta firmada de A (la que se envía) y contactos de A y B
insert into clinico.consultas (id,org_id,empresa_id,trabajador_id,estado,fecha) values
 ('49000000-0000-0000-0000-00000000000a','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a','30000000-0000-0000-0000-00000000000a','firmada',current_date),
 ('49000000-0000-0000-0000-00000000000b','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a','30000000-0000-0000-0000-00000000000a','borrador',current_date);
insert into public.empresa_contactos (id,org_id,empresa_id,nombre,correo,telefono,recibe_consulta) values
 ('59000000-0000-0000-0000-0000000000a1','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a','RRHH A','rrhh@a.com','+584140000000',false),
 ('59000000-0000-0000-0000-0000000000a2','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a','Médico A','Salud@A.com',null,true),
 ('59000000-0000-0000-0000-0000000000b1','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000b','RRHH B','rrhh@b.com',null,false);

set role authenticated;
-- ── Contactos
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a3',false) \g /dev/null
select 'RR. HH. de A no ve los contactos (debe 0): ' || count(*) from public.empresa_contactos;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false) \g /dev/null
select 'médico de A ve solo los contactos de A (debe 2): ' || count(*) from public.empresa_contactos;
select 'el correo se guarda en minúsculas (debe 1): ' || count(*) from public.empresa_contactos where correo = 'salud@a.com';
do $$ begin
  update public.empresa_contactos set recibe_consulta = true where id = '59000000-0000-0000-0000-0000000000a1';
  raise notice 'FALLA: un médico autorizó a RR. HH. a recibir la consulta';
exception when others then
  if sqlerrm like '%Solo el gerente médico o el administrador%' then raise notice 'médico no autoriza destinatarios de la consulta (debe 1): 1';
  else raise notice 'FALLA: %', sqlerrm; end if;
end $$;

-- ── Envíos
do $$ begin
  insert into public.envios (org_id,empresa_id,fecha_lote,canal,destinatario,consultas,documentos,asunto,mensaje,estado)
  values ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a',current_date,'correo','rrhh@a.com',
          '{49000000-0000-0000-0000-00000000000b}','{constancia}','x','x','enviado');
  raise notice 'FALLA: se envió una consulta sin firmar';
exception when others then
  if sqlerrm like '%Solo se envían consultas firmadas%' then raise notice 'consulta sin firmar no se envía (debe 1): 1';
  else raise notice 'FALLA: %', sqlerrm; end if;
end $$;
do $$ begin
  insert into public.envios (org_id,empresa_id,fecha_lote,canal,destinatario,contacto_id,consultas,documentos,asunto,mensaje,estado)
  values ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a',current_date,'correo','rrhh@a.com','59000000-0000-0000-0000-0000000000a1',
          '{49000000-0000-0000-0000-00000000000a}','{constancia,consulta}','x','x','enviado');
  raise notice 'FALLA: la consulta médica fue a RR. HH.';
exception when others then
  if sqlerrm like '%solo va por correo al personal de salud autorizado%' then raise notice 'consulta médica no va a RR. HH. (debe 1): 1';
  else raise notice 'FALLA: %', sqlerrm; end if;
end $$;
do $$ begin
  insert into public.envios (org_id,empresa_id,fecha_lote,canal,destinatario,consultas,documentos,asunto,mensaje,estado)
  values ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a',current_date,'correo','otro@gmail.com',
          '{49000000-0000-0000-0000-00000000000a}','{consulta}','x','x','enviado');
  raise notice 'FALLA: la consulta médica fue a un correo escrito a mano';
exception when others then
  if sqlerrm like '%solo va por correo al personal de salud autorizado%' then raise notice 'consulta médica no va a correo libre (debe 1): 1';
  else raise notice 'FALLA: %', sqlerrm; end if;
end $$;
do $$ begin
  insert into public.envios (org_id,empresa_id,fecha_lote,canal,destinatario,contacto_id,consultas,documentos,asunto,mensaje,estado)
  values ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a',current_date,'correo','rrhh@b.com','59000000-0000-0000-0000-0000000000b1',
          '{49000000-0000-0000-0000-00000000000a}','{constancia}','x','x','enviado');
  raise notice 'FALLA: se usó un contacto de otra empresa';
exception when others then
  if sqlerrm like '%no pertenece a esta empresa%' then raise notice 'contacto de otra empresa rechazado (debe 1): 1';
  else raise notice 'FALLA: %', sqlerrm; end if;
end $$;
with x as (
  insert into public.envios (org_id,empresa_id,fecha_lote,canal,destinatario,contacto_id,consultas,documentos,asunto,mensaje,estado,enviado_por)
  values ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a',current_date,'correo','salud@a.com','59000000-0000-0000-0000-0000000000a2',
          '{49000000-0000-0000-0000-00000000000a}','{constancia,consulta}','Evaluaciones','Adjunto…','enviado','00000000-0000-0000-0000-0000000000a1')
  returning enviado_por)
select 'médico envía la consulta al autorizado, a su nombre (debe 1): ' || count(*) from x where enviado_por = '00000000-0000-0000-0000-0000000000a2';
do $$ begin
  update public.envios set estado = 'fallido';
  raise notice 'FALLA: se editó el registro de envíos';
exception when insufficient_privilege then raise notice 'el registro no se edita (debe 1): 1';
end $$;
do $$ begin
  delete from public.envios;
  raise notice 'FALLA: se pudo intentar borrar envíos';
exception when insufficient_privilege then raise notice 'el registro no se borra (debe 1): 1';
end $$;

-- B: médico limitado a A no envía consultas de B
do $$ begin
  insert into public.envios (org_id,empresa_id,fecha_lote,canal,destinatario,consultas,documentos,asunto,mensaje,estado)
  values ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000b',current_date,'correo','rrhh@b.com',
          '{40000000-0000-0000-0000-00000000000b}','{constancia}','x','x','enviado');
  raise notice 'FALLA: médico de A envió a B';
exception when others then raise notice 'médico de A no envía a B (debe 1): 1';
end $$;

-- ── Enlace de WhatsApp
insert into public.envios (id,org_id,empresa_id,fecha_lote,canal,destinatario,contacto_id,consultas,documentos,asunto,mensaje,estado)
values ('5a000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a',current_date,'whatsapp','+584140000000','59000000-0000-0000-0000-0000000000a1',
        '{49000000-0000-0000-0000-00000000000a}','{constancia}','x','x','enlace');
insert into public.envio_enlaces (id,org_id,envio_id,token_hash,vence) values
 ('5b000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','5a000000-0000-0000-0000-000000000001',
  sha256(convert_to('tok-0123456789-0123456789-0123456789-0123456789','UTF8')), now() + interval '30 days');
insert into public.envio_archivos (enlace_id,nombre,contenido) values ('5b000000-0000-0000-0000-000000000001','c.pdf','\x255044462d');
select 'el vencimiento se limita a 7 días (debe 1): ' || count(*) from public.envio_enlaces where vence <= now() + interval '7 days';
do $$ begin
  perform 1 from public.envio_archivos;
  raise notice 'FALLA: el médico leyó el PDF guardado';
exception when insufficient_privilege then raise notice 'nadie lee el PDF guardado por la API (debe 1): 1';
end $$;

set role anon;
select set_config('request.jwt.claim.sub','',false) \g /dev/null
select 'anónimo con token válido abre el PDF (debe 1): ' || count(*) from public.abrir_enlace('tok-0123456789-0123456789-0123456789-0123456789', 'prueba');
select 'anónimo con token falso no abre nada (debe 0): ' || count(*) from public.abrir_enlace('tok-0123456789-0123456789-0123456789-XXXXXXXXXX', null);
do $$ begin
  perform 1 from public.envios;
  raise notice 'FALLA: anónimo leyó envíos';
exception when insufficient_privilege then raise notice 'anónimo no lee envíos (debe 1): 1';
end $$;

set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false) \g /dev/null
select 'la apertura quedó anotada (debe 1): ' || count(*) from public.envio_aperturas;
do $$ begin
  update public.envio_enlaces set vence = now() + interval '1 year' where id = '5b000000-0000-0000-0000-000000000001';
  raise notice 'FALLA: se alargó el enlace';
exception when others then
  if sqlerrm like '%solo se puede revocar%' then raise notice 'el enlace no se alarga (debe 1): 1'; else raise notice 'FALLA: %', sqlerrm; end if;
end $$;
-- La consulta se reabre para corregirla: el enlace se revoca solo y el PDF se borra
reset role;
update clinico.consultas set estado = 'cerrada' where id = '49000000-0000-0000-0000-00000000000a';
select 'reabrir la consulta revoca el enlace (debe 1): ' || count(*) from public.envio_enlaces where revocado_en is not null;
select 'y borra el PDF guardado (debe 0): ' || count(*) from public.envio_archivos;
set role anon;
select 'enlace revocado ya no abre (debe 0): ' || count(*) from public.abrir_enlace('tok-0123456789-0123456789-0123456789-0123456789', null);
reset role;
update clinico.consultas set estado = 'firmada' where id = '49000000-0000-0000-0000-00000000000a';

-- ── Solicitudes extras
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a3',false) \g /dev/null
with x as (
  insert into public.solicitudes (org_id,empresa_id,tipo_id,trabajador_id,detalle,estado,respuesta)
  select '10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a', id,'30000000-0000-0000-0000-00000000000a','Informe para el seguro','respondida','auto'
  from public.lista_items where lista = 'tipo_solicitud' and codigo = 'INF' and org_id is null
  returning estado, respuesta, tipo)
select 'RR. HH. crea la solicitud, queda pendiente y sin respuesta (debe 1): ' || count(*) from x where estado = 'pendiente' and respuesta is null and tipo = 'Informe médico';
do $$ begin
  insert into public.solicitudes (org_id,empresa_id,tipo,detalle) values ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000b','Otra','para B');
  raise notice 'FALLA: RR. HH. de A pidió para B';
exception when others then raise notice 'RR. HH. de A no pide para B (debe 1): 1';
end $$;
do $$ begin
  insert into public.solicitudes (org_id,empresa_id,tipo,trabajador_id,detalle) values ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a','Otra','30000000-0000-0000-0000-00000000000b','de B');
  raise notice 'FALLA: se pidió por un trabajador de otra empresa';
exception when others then raise notice 'trabajador de otra empresa rechazado (debe 1): 1';
end $$;
with x as (update public.solicitudes set estado = 'respondida' returning 1)
select 'RR. HH. no cambia el estado (debe 0): ' || count(*) from x;
select 'RR. HH. ve su solicitud (debe 1): ' || count(*) from public.solicitudes;
reset role;
select 'el servicio recibió el aviso (debe 1): ' || (count(*) > 0)::int from public.notificaciones where titulo = 'Nueva solicitud de la empresa';
set role authenticated;

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false) \g /dev/null
with x as (update public.solicitudes set estado = 'respondida', respuesta = 'Adjunto el informe' returning atendida_por)
select 'médico responde la solicitud (debe 1): ' || count(*) from x where atendida_por = '00000000-0000-0000-0000-0000000000a2';
do $$ begin
  update public.solicitudes set detalle = 'otra cosa';
  raise notice 'FALLA: se reescribió lo que pidió la empresa';
exception when others then
  if sqlerrm like '%no se modifica%' then raise notice 'lo pedido no se reescribe (debe 1): 1'; else raise notice 'FALLA: %', sqlerrm; end if;
end $$;
do $$ begin
  update public.solicitudes set documento_ruta = 'otra/ruta/x.pdf';
  raise notice 'FALLA: ruta de documento libre';
exception when others then
  if sqlerrm like '%Ruta de documento inválida%' then raise notice 'ruta del documento validada (debe 1): 1'; else raise notice 'FALLA: %', sqlerrm; end if;
end $$;
reset role;
select 'la empresa recibió el aviso de respuesta (debe 1): ' || (count(*) > 0)::int from public.notificaciones where titulo = 'Solicitud respondida';

-- Documento de respuesta en Storage
insert into storage.objects (bucket_id,name)
select 'solicitudes', org_id || '/' || empresa_id || '/' || id || '/informe.pdf' from public.solicitudes;
insert into storage.objects (bucket_id,name) values ('solicitudes','10000000-0000-0000-0000-000000000001/20000000-0000-0000-0000-00000000000b/00000000-0000-0000-0000-000000000000/x.pdf');
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a3',false) \g /dev/null
select 'RR. HH. de A descarga su respuesta (debe 1): ' || count(*) from storage.objects where bucket_id = 'solicitudes';
do $$ begin
  insert into storage.objects (bucket_id,name) select 'solicitudes', org_id || '/' || empresa_id || '/' || id || '/falso.pdf' from public.solicitudes;
  raise notice 'FALLA: RR. HH. subió la respuesta';
exception when others then raise notice 'RR. HH. no sube respuestas (debe 1): 1';
end $$;
reset role;
