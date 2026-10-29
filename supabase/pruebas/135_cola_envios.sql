-- Cola de envíos del escritorio: el correo se registra «en_cola», solo quien lo registró lo toma (en_cola → enviando →
-- enviado) y su PDF en espera vive en su propia carpeta del bucket privado. Deja los datos como los encontró.
\pset tuples_only on
reset role;
select set_config('request.jwt.claim.sub','',false) \g /dev/null
insert into clinico.consultas (id,org_id,empresa_id,trabajador_id,estado,fecha) values
 ('c1350000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a','30000000-0000-0000-0000-00000000000a','firmada',public.hoy_caracas());
insert into public.empresa_contactos (id,org_id,empresa_id,nombre,correo,recibe_consulta) values
 ('c1350000-0000-0000-0000-0000000000a1','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a','RRHH 135','rrhh135@a.com',false);

set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false) \g /dev/null
insert into public.envios (id,org_id,empresa_id,fecha_lote,canal,destinatario,contacto_id,consultas,documentos,asunto,mensaje,estado) values
 ('c1350000-0000-0000-0000-0000000000e1','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a',public.hoy_caracas(),'correo','rrhh135@a.com','c1350000-0000-0000-0000-0000000000a1','{c1350000-0000-0000-0000-000000000001}','{constancia}','x','x','en_cola'),
 ('c1350000-0000-0000-0000-0000000000e2','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a',public.hoy_caracas(),'correo','rrhh135@a.com','c1350000-0000-0000-0000-0000000000a1','{c1350000-0000-0000-0000-000000000001}','{constancia}','x','x','en_cola');
select 'el escritorio registra correos en cola (debe 2): ' || count(*) from public.envios where id::text like 'c1350000-%' and estado = 'en_cola';
do $$ begin
  insert into public.envios (org_id,empresa_id,fecha_lote,canal,destinatario,consultas,documentos,asunto,mensaje,estado) values
   ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a',public.hoy_caracas(),'whatsapp','584140000135','{c1350000-0000-0000-0000-000000000001}','{constancia}','x','x','en_cola');
  raise notice 'FALLA: un WhatsApp quedó en cola';
exception when others then raise notice 'WhatsApp no se encola (debe 1): 1';
end $$;

-- Nunca un relé abierto: en cola solo a un contacto activo de la empresa, con su propio correo, y con tope diario
do $$ begin
  insert into public.envios (org_id,empresa_id,fecha_lote,canal,destinatario,consultas,documentos,asunto,mensaje,estado) values
   ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a',public.hoy_caracas(),'correo','cualquiera@x.com','{c1350000-0000-0000-0000-000000000001}','{constancia}','x','x','en_cola');
  raise notice 'FALLA: la cola mandó a un correo suelto';
exception when others then
  if sqlerrm like '%contactos guardados%' then raise notice 'la cola no va a un correo suelto (debe 1): 1'; else raise notice 'FALLA: %', sqlerrm; end if;
end $$;
do $$ begin
  insert into public.envios (org_id,empresa_id,fecha_lote,canal,destinatario,contacto_id,consultas,documentos,asunto,mensaje,estado) values
   ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a',public.hoy_caracas(),'correo','otro@x.com','c1350000-0000-0000-0000-0000000000a1','{c1350000-0000-0000-0000-000000000001}','{constancia}','x','x','en_cola');
  raise notice 'FALLA: la cola usó un contacto con otro correo';
exception when others then
  if sqlerrm like '%contactos guardados%' then raise notice 'la cola usa el correo del contacto (debe 1): 1'; else raise notice 'FALLA: %', sqlerrm; end if;
end $$;
do $$ begin
  for i in 1..98 loop
    insert into public.envios (org_id,empresa_id,fecha_lote,canal,destinatario,contacto_id,consultas,documentos,asunto,mensaje,estado) values
     ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a',public.hoy_caracas(),'correo','rrhh135@a.com','c1350000-0000-0000-0000-0000000000a1','{c1350000-0000-0000-0000-000000000001}','{constancia}','tope','x','en_cola');
  end loop;
  insert into public.envios (org_id,empresa_id,fecha_lote,canal,destinatario,contacto_id,consultas,documentos,asunto,mensaje,estado) values
   ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a',public.hoy_caracas(),'correo','rrhh135@a.com','c1350000-0000-0000-0000-0000000000a1','{c1350000-0000-0000-0000-000000000001}','{constancia}','tope','x','en_cola');
  raise notice 'FALLA: pasó el tope de 100 en cola por día';
exception when others then
  if sqlerrm like '%tope de 100%' then raise notice 'tope de 100 correos en cola por día (debe 1): 1'; else raise notice 'FALLA: %', sqlerrm; end if;
end $$;
-- PDF en espera: solo en su carpeta y solo para un envío suyo en cola
insert into storage.objects (bucket_id,name) values ('envios-cola','00000000-0000-0000-0000-0000000000a2/c1350000-0000-0000-0000-0000000000e1/Constancias.pdf');
select 'sube el PDF de su envío en cola (debe 1): ' || count(*) from storage.objects where bucket_id = 'envios-cola' and name like '%c1350000-0000-0000-0000-0000000000e1%';
do $$ begin
  insert into storage.objects (bucket_id,name) values ('envios-cola','00000000-0000-0000-0000-0000000000a1/c1350000-0000-0000-0000-0000000000e1/x.pdf');
  raise notice 'FALLA: subió a la carpeta de otro usuario';
exception when insufficient_privilege then raise notice 'no sube a la carpeta de otro (debe 1): 1';
end $$;
do $$ begin
  insert into storage.objects (bucket_id,name) values ('envios-cola','00000000-0000-0000-0000-0000000000a2/x/y/z.pdf');
  raise notice 'FALLA: subió con un nombre fuera de <uid>/<envío>/<archivo>.pdf';
exception when insufficient_privilege then raise notice 'el nombre debe ser <uid>/<envío>/<archivo>.pdf (debe 1): 1';
end $$;
do $$ begin
  insert into storage.objects (bucket_id,name) values ('envios-cola','00000000-0000-0000-0000-0000000000a2/c1350000-0000-0000-0000-0000000000e1/x.exe');
  raise notice 'FALLA: subió un archivo que no termina en .pdf';
exception when insufficient_privilege then raise notice 'solo archivos .pdf (debe 1): 1';
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a3',false) \g /dev/null
do $$ begin
  insert into storage.objects (bucket_id,name) values ('envios-cola','00000000-0000-0000-0000-0000000000a3/c1350000-0000-0000-0000-0000000000e1/x.pdf');
  raise notice 'FALLA: RR. HH. subió a la cola de envíos';
exception when insufficient_privilege then raise notice 'RR. HH. no sube a la cola (debe 1): 1';
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false) \g /dev/null

-- Otro usuario no toma el envío ajeno (la RLS no le muestra la fila para actualizar)
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false) \g /dev/null
update public.envios set estado = 'enviando' where id = 'c1350000-0000-0000-0000-0000000000e1';
select 'el administrador no ve el PDF en espera de otro (debe 0): ' || count(*) from storage.objects where bucket_id = 'envios-cola';
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false) \g /dev/null
select 'otro usuario no toma el envío (debe en_cola): ' || estado from public.envios where id = 'c1350000-0000-0000-0000-0000000000e1';

-- Quien lo registró: en_cola → enviando → enviado; nunca en_cola → enviado de un salto
do $$ begin
  update public.envios set estado = 'enviado' where id = 'c1350000-0000-0000-0000-0000000000e1';
  raise notice 'FALLA: pasó de en cola a enviado sin tomarlo';
exception when others then raise notice 'en cola no salta a enviado (debe 1): 1';
end $$;
update public.envios set estado = 'enviando' where id = 'c1350000-0000-0000-0000-0000000000e1' and estado = 'en_cola';
update public.envios set estado = 'enviando' where id = 'c1350000-0000-0000-0000-0000000000e1' and estado = 'en_cola';
update public.envios set estado = 'enviado' where id = 'c1350000-0000-0000-0000-0000000000e1';
update public.envios set estado = 'fallido', error = 'sin internet' where id = 'c1350000-0000-0000-0000-0000000000e2';
select 'enviado y fallido cerrados por su autor (debe enviado,fallido): ' || string_agg(estado, ',' order by id) from public.envios where id::text like 'c1350000-%';
-- Huérfanos: el PDF del envío ya enviado, con más de 7 días, sale en la lista; el de un envío en cola o reciente no
insert into storage.objects (bucket_id,name) values ('envios-cola','00000000-0000-0000-0000-0000000000a2/c1350000-0000-0000-0000-0000000000e3/1.pdf');
reset role;
update storage.objects set created_at = now() - interval '8 days' where bucket_id = 'envios-cola'
   and name in ('00000000-0000-0000-0000-0000000000a2/c1350000-0000-0000-0000-0000000000e1/Constancias.pdf',
                '00000000-0000-0000-0000-0000000000a2/c1350000-0000-0000-0000-0000000000e3/1.pdf');
set role authenticated;
select 'huérfano viejo de un envío ya cerrado (debe 1): ' || count(*) from public.envios_cola_huerfanos() h where h like '%0000000000e1/%';
select 'huérfano viejo sin envío en la nube (debe 1): ' || count(*) from public.envios_cola_huerfanos() h where h like '%0000000000e3/%';
select 'nada más en la lista (debe 2): ' || count(*) from public.envios_cola_huerfanos();
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false) \g /dev/null
select 'no ve los huérfanos de otro (debe 0): ' || count(*) from public.envios_cola_huerfanos();
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false) \g /dev/null
delete from storage.objects where bucket_id = 'envios-cola' and name like '00000000-0000-0000-0000-0000000000a2/c1350000-%';
select 'borra su PDF después de enviar (debe 0): ' || count(*) from storage.objects where bucket_id = 'envios-cola';

reset role;
select set_config('request.jwt.claim.sub','',false) \g /dev/null
select 'tablas de envíos en la copia de la PC (debe 4): ' || count(*) from sync.tablas
 where nombre in ('public.empresa_contactos','public.plantillas_correo','public.envios','public.solicitudes');
select 'las solicitudes suben desde la PC, como en el #110 (debe true): ' || subible from sync.tablas where nombre = 'public.solicitudes';
select 'límite de 10 MB por PDF (debe 10485760): ' || file_size_limit from storage.buckets where id = 'envios-cola';
select 'la versión avanza al cerrar un envío (debe 3): ' || version from public.envios where id = 'c1350000-0000-0000-0000-0000000000e1';
delete from storage.objects where bucket_id = 'envios-cola';
delete from public.envios where id::text like 'c1350000-%' or destinatario = 'rrhh135@a.com';
delete from public.empresa_contactos where id::text like 'c1350000-%';
delete from clinico.consultas where id::text like 'c1350000-%';
