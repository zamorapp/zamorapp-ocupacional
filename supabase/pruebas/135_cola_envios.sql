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

-- PDF en espera: solo en su carpeta y solo para un envío suyo en cola
insert into storage.objects (bucket_id,name) values ('envios-cola','00000000-0000-0000-0000-0000000000a2/c1350000-0000-0000-0000-0000000000e1/Constancias.pdf');
select 'sube el PDF de su envío en cola (debe 1): ' || count(*) from storage.objects where bucket_id = 'envios-cola' and name like '%c1350000-0000-0000-0000-0000000000e1%';
do $$ begin
  insert into storage.objects (bucket_id,name) values ('envios-cola','00000000-0000-0000-0000-0000000000a1/c1350000-0000-0000-0000-0000000000e1/x.pdf');
  raise notice 'FALLA: subió a la carpeta de otro usuario';
exception when insufficient_privilege then raise notice 'no sube a la carpeta de otro (debe 1): 1';
end $$;

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
do $$ begin
  insert into storage.objects (bucket_id,name) values ('envios-cola','00000000-0000-0000-0000-0000000000a2/c1350000-0000-0000-0000-0000000000e1/otra.pdf');
  raise notice 'FALLA: subió un PDF a un envío ya enviado';
exception when insufficient_privilege then raise notice 'no sube PDF a un envío ya enviado (debe 1): 1';
end $$;
delete from storage.objects where bucket_id = 'envios-cola' and name like '00000000-0000-0000-0000-0000000000a2/c1350000-%';
select 'borra su PDF después de enviar (debe 0): ' || count(*) from storage.objects where bucket_id = 'envios-cola';

reset role;
select set_config('request.jwt.claim.sub','',false) \g /dev/null
select 'tablas de envíos en la copia de la PC (debe 4): ' || count(*) from sync.tablas
 where nombre in ('public.empresa_contactos','public.plantillas_correo','public.envios','public.solicitudes');
select 'las solicitudes solo bajan a la PC (debe false): ' || subible from sync.tablas where nombre = 'public.solicitudes';
select 'la versión avanza al cerrar un envío (debe 3): ' || version from public.envios where id = 'c1350000-0000-0000-0000-0000000000e1';
delete from storage.objects where bucket_id = 'envios-cola';
delete from public.envios where id::text like 'c1350000-%';
delete from public.empresa_contactos where id::text like 'c1350000-%';
delete from clinico.consultas where id::text like 'c1350000-%';
