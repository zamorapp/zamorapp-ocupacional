-- «Responder y enviar»: el documento de una solicitud sale por Envíos. Constancia a cualquier contacto; lo médico, solo
-- por correo al personal de salud y solo lo envía personal clínico o el administrador. Deja los datos como los encontró.
\pset tuples_only on
reset role;
select set_config('request.jwt.claim.sub','',false) \g /dev/null
insert into public.empresa_contactos (id,org_id,empresa_id,nombre,correo,telefono,recibe_consulta) values
 ('c1640000-0000-0000-0000-0000000000a1','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a','RRHH 164','rrhh164@a.com','+584140000164',false),
 ('c1640000-0000-0000-0000-0000000000a2','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a','Salud 164','salud164@a.com',null,true);
insert into public.solicitudes (id,org_id,empresa_id,tipo,detalle,solicitada_por,estado,solo_salud,documento_nombre,documento_ruta) values
 ('c1640000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a','Informe','Detalle','00000000-0000-0000-0000-0000000000a3','respondida',true,'Informe médico.pdf',
  '10000000-0000-0000-0000-000000000001/20000000-0000-0000-0000-00000000000a/c1640000-0000-0000-0000-000000000001/i.pdf'),
 ('c1640000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a','Copia','Detalle','00000000-0000-0000-0000-0000000000a3','respondida',false,'Constancia de aptitud.pdf',
  '10000000-0000-0000-0000-000000000001/20000000-0000-0000-0000-00000000000a/c1640000-0000-0000-0000-000000000002/c.pdf'),
 ('c1640000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000b','Copia','Detalle','00000000-0000-0000-0000-0000000000a3','respondida',false,'Constancia de aptitud.pdf',
  '10000000-0000-0000-0000-000000000001/20000000-0000-0000-0000-00000000000b/c1640000-0000-0000-0000-000000000003/c.pdf');
insert into auth.users (id,email) values ('00000000-0000-0000-0000-000000000164','recep164@x') on conflict do nothing;
insert into public.miembros (org_id,usuario_id,rol,empresas_permitidas) values
 ('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000164','recepcion','{20000000-0000-0000-0000-00000000000a}');

set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false) \g /dev/null
insert into public.envios (org_id,empresa_id,fecha_lote,canal,destinatario,contacto_id,consultas,documentos,ruta,asunto,mensaje,estado) values
 ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a',public.hoy_caracas(),'correo','rrhh164@a.com','c1640000-0000-0000-0000-0000000000a1','{}','{solicitud}','/api/solicitudes/c1640000-0000-0000-0000-000000000002','x','x','enviando'),
 ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a',public.hoy_caracas(),'correo','salud164@a.com','c1640000-0000-0000-0000-0000000000a2','{}','{solicitud}','/api/solicitudes/c1640000-0000-0000-0000-000000000001','x','x','enviando');
select 'constancia a RR. HH. e informe a salud (debe 2): ' || count(*) from public.envios where documentos = '{solicitud}' and destinatario like '%164@a.com';
do $$ begin
  insert into public.envios (org_id,empresa_id,fecha_lote,canal,destinatario,contacto_id,consultas,documentos,ruta,asunto,mensaje,estado) values
   ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a',public.hoy_caracas(),'correo','rrhh164@a.com','c1640000-0000-0000-0000-0000000000a1','{}','{solicitud}','/api/solicitudes/c1640000-0000-0000-0000-000000000001','x','x','enviando');
  raise notice 'FALLA: el informe médico llegó a RR. HH.';
exception when others then
  if sqlerrm like '%personal de salud autorizado%' then raise notice 'el informe no va a RR. HH. (debe 1): 1'; else raise notice 'FALLA: %', sqlerrm; end if;
end $$;
do $$ begin
  insert into public.envios (org_id,empresa_id,fecha_lote,canal,destinatario,contacto_id,consultas,documentos,ruta,asunto,mensaje,estado) values
   ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a',public.hoy_caracas(),'whatsapp','584140000164','c1640000-0000-0000-0000-0000000000a2','{}','{solicitud}','/api/solicitudes/c1640000-0000-0000-0000-000000000001','x','x','enlace');
  raise notice 'FALLA: el informe médico salió por WhatsApp';
exception when others then
  if sqlerrm like '%personal de salud autorizado%' then raise notice 'el informe no va por WhatsApp (debe 1): 1'; else raise notice 'FALLA: %', sqlerrm; end if;
end $$;
do $$ begin
  insert into public.envios (org_id,empresa_id,fecha_lote,canal,destinatario,contacto_id,consultas,documentos,ruta,asunto,mensaje,estado) values
   ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a',public.hoy_caracas(),'correo','rrhh164@a.com','c1640000-0000-0000-0000-0000000000a1','{}','{solicitud}','/api/solicitudes/c1640000-0000-0000-0000-000000000003','x','x','enviando');
  raise notice 'FALLA: se envió la solicitud de otra empresa';
exception when others then
  if sqlerrm like '%no es de una solicitud de esta empresa%' then raise notice 'solicitud de otra empresa rechazada (debe 1): 1'; else raise notice 'FALLA: %', sqlerrm; end if;
end $$;

-- Recepción: manda la constancia, no el informe médico
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000164',false) \g /dev/null
do $$ begin
  insert into public.envios (org_id,empresa_id,fecha_lote,canal,destinatario,contacto_id,consultas,documentos,ruta,asunto,mensaje,estado) values
   ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a',public.hoy_caracas(),'correo','salud164@a.com','c1640000-0000-0000-0000-0000000000a2','{}','{solicitud}','/api/solicitudes/c1640000-0000-0000-0000-000000000001','x','x','enviando');
  raise notice 'FALLA: recepción envió un documento médico';
exception when others then
  if sqlerrm like '%Solo el personal de salud%' or sqlerrm like '%row-level security%' then raise notice 'recepción no envía el informe (debe 1): 1'; else raise notice 'FALLA: %', sqlerrm; end if;
end $$;

-- RR. HH.: no registra envíos
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a3',false) \g /dev/null
do $$ begin
  insert into public.envios (org_id,empresa_id,fecha_lote,canal,destinatario,contacto_id,consultas,documentos,ruta,asunto,mensaje,estado) values
   ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a',public.hoy_caracas(),'correo','rrhh164@a.com','c1640000-0000-0000-0000-0000000000a1','{}','{solicitud}','/api/solicitudes/c1640000-0000-0000-0000-000000000002','x','x','enviando');
  raise notice 'FALLA: RR. HH. registró un envío';
exception when others then raise notice 'RR. HH. no registra envíos (debe 1): 1';
end $$;

reset role;
delete from public.envios where documentos = '{solicitud}' and destinatario like '%164%';
delete from public.solicitudes where id::text like 'c1640000-%';
delete from public.empresa_contactos where id::text like 'c1640000-%';
delete from public.miembros where usuario_id='00000000-0000-0000-0000-000000000164';
