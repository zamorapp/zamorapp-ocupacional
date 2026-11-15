-- Envíos de todos los documentos: constancia de atención a cualquiera; referencias y récipes solo por correo al personal
-- de salud; informes (puesto, vigilancia, atendidos) solo con la ruta de su propia empresa. Deja los datos como los encontró.
\pset tuples_only on
reset role;
select set_config('request.jwt.claim.sub','',false) \g /dev/null
insert into clinico.consultas (id,org_id,empresa_id,trabajador_id,estado,fecha) values
 ('c1270000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a','30000000-0000-0000-0000-00000000000a','firmada',public.hoy_caracas());
insert into public.empresa_contactos (id,org_id,empresa_id,nombre,correo,telefono,recibe_consulta) values
 ('c1270000-0000-0000-0000-0000000000a1','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a','RRHH 127','rrhh127@a.com','+584140000127',false),
 ('c1270000-0000-0000-0000-0000000000a2','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a','Salud 127','salud127@a.com',null,true);
insert into public.puestos (id,org_id,empresa_id,nombre) values
 ('c1270000-0000-0000-0000-0000000000f1','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a','Puesto A 127'),
 ('c1270000-0000-0000-0000-0000000000f2','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000b','Puesto B 127');

set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false) \g /dev/null
-- Constancia de atención (sin diagnóstico): a RR. HH. por correo y por WhatsApp
insert into public.envios (org_id,empresa_id,fecha_lote,canal,destinatario,contacto_id,consultas,documentos,asunto,mensaje,estado) values
 ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a',public.hoy_caracas(),'correo','rrhh127@a.com','c1270000-0000-0000-0000-0000000000a1','{c1270000-0000-0000-0000-000000000001}','{constancia,atencion}','x','x','enviando'),
 ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a',public.hoy_caracas(),'whatsapp','584140000127','c1270000-0000-0000-0000-0000000000a1','{c1270000-0000-0000-0000-000000000001}','{atencion}','x','x','enlace');
select 'la constancia de atención va a RR. HH. por correo y WhatsApp (debe 2): ' || count(*) from public.envios where 'atencion' = any (documentos) and destinatario in ('rrhh127@a.com','584140000127');
-- Referencias y récipes: solo al personal de salud por correo
do $$ begin
  insert into public.envios (org_id,empresa_id,fecha_lote,canal,destinatario,contacto_id,consultas,documentos,asunto,mensaje,estado) values
   ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a',public.hoy_caracas(),'correo','rrhh127@a.com','c1270000-0000-0000-0000-0000000000a1','{c1270000-0000-0000-0000-000000000001}','{constancia,referencia}','x','x','enviando');
  raise notice 'FALLA: una referencia médica llegó a RR. HH.';
exception when others then
  if sqlerrm like '%personal de salud autorizado%' then raise notice 'la referencia no va a RR. HH. (debe 1): 1';
  else raise notice 'FALLA: %', sqlerrm; end if;
end $$;
do $$ begin
  insert into public.envios (org_id,empresa_id,fecha_lote,canal,destinatario,contacto_id,consultas,documentos,asunto,mensaje,estado) values
   ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a',public.hoy_caracas(),'correo','otro@a.com',null,'{c1270000-0000-0000-0000-000000000001}','{recipe}','x','x','enviando');
  raise notice 'FALLA: un récipe salió a un correo escrito a mano';
exception when others then
  if sqlerrm like '%personal de salud autorizado%' then raise notice 'el récipe no va a un correo suelto (debe 1): 1';
  else raise notice 'FALLA: %', sqlerrm; end if;
end $$;
insert into public.envios (org_id,empresa_id,fecha_lote,canal,destinatario,contacto_id,consultas,documentos,asunto,mensaje,estado) values
 ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a',public.hoy_caracas(),'correo','salud127@a.com','c1270000-0000-0000-0000-0000000000a2','{c1270000-0000-0000-0000-000000000001}','{consulta,referencia,recipe}','x','x','enviando');
select 'consulta, referencias y récipes van al personal de salud (debe 1): ' || count(*) from public.envios where destinatario = 'salud127@a.com' and documentos @> '{referencia,recipe}';

-- Informes: solo con la ruta del documento de su empresa
insert into public.envios (org_id,empresa_id,fecha_lote,canal,destinatario,contacto_id,consultas,documentos,ruta,asunto,mensaje,estado) values
 ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a',public.hoy_caracas(),'correo','rrhh127@a.com','c1270000-0000-0000-0000-0000000000a1','{}','{puesto}','/imprimir/puesto/c1270000-0000-0000-0000-0000000000f1','x','x','enviando'),
 ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a',public.hoy_caracas(),'correo','rrhh127@a.com','c1270000-0000-0000-0000-0000000000a1','{}','{vigilancia}','/imprimir/vigilancia?empresa=20000000-0000-0000-0000-00000000000a&anio=2026&trimestre=3&para=empresa','x','x','enviando'),
 ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a',public.hoy_caracas(),'whatsapp','584140000127','c1270000-0000-0000-0000-0000000000a1','{}','{atendidos}','/imprimir/atendidos?empresa=20000000-0000-0000-0000-00000000000a&desde=2026-10-01&hasta=2026-10-31','x','x','enlace');
select 'puesto, vigilancia y atendidos de su empresa se envían (debe 3): ' || count(*) from public.envios where ruta is not null and destinatario in ('rrhh127@a.com','584140000127');
do $$ begin
  insert into public.envios (org_id,empresa_id,fecha_lote,canal,destinatario,consultas,documentos,ruta,asunto,mensaje,estado) values
   ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a',public.hoy_caracas(),'correo','rrhh127@a.com','{}','{puesto}','/imprimir/puesto/c1270000-0000-0000-0000-0000000000f2','x','x','enviando');
  raise notice 'FALLA: se envió a A el puesto de B';
exception when others then
  if sqlerrm like '%no es de esta empresa%' then raise notice 'el puesto de otra empresa no se envía (debe 1): 1';
  else raise notice 'FALLA: %', sqlerrm; end if;
end $$;
do $$ begin
  insert into public.envios (org_id,empresa_id,fecha_lote,canal,destinatario,consultas,documentos,ruta,asunto,mensaje,estado) values
   ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a',public.hoy_caracas(),'correo','rrhh127@a.com','{}','{vigilancia}','/imprimir/vigilancia?empresa=20000000-0000-0000-0000-00000000000a&empresa=20000000-0000-0000-0000-00000000000b&para=empresa','x','x','enviando');
  raise notice 'FALLA: vigilancia con dos empresas';
exception when others then
  if sqlerrm like '%no es de esta empresa%' then raise notice 'la vigilancia no mezcla empresas (debe 1): 1';
  else raise notice 'FALLA: %', sqlerrm; end if;
end $$;
do $$ begin
  insert into public.envios (org_id,empresa_id,fecha_lote,canal,destinatario,consultas,documentos,ruta,asunto,mensaje,estado) values
   ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a',public.hoy_caracas(),'correo','rrhh127@a.com','{}','{vigilancia}','/imprimir/vigilancia?empresa=20000000-0000-0000-0000-00000000000a&anio=2026','x','x','enviando');
  raise notice 'FALLA: salió la vigilancia con la cifra de discapacidad';
exception when others then
  if sqlerrm like '%reservados al servicio%' then raise notice 'la vigilancia solo sale en su versión para la empresa (debe 1): 1';
  else raise notice 'FALLA: %', sqlerrm; end if;
end $$;
do $$ begin
  insert into public.envios (org_id,empresa_id,fecha_lote,canal,destinatario,consultas,documentos,ruta,asunto,mensaje,estado) values
   ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a',public.hoy_caracas(),'correo','rrhh127@a.com','{}','{atendidos}','/imprimir/lote?doc=consulta&empresa=20000000-0000-0000-0000-00000000000a','x','x','enviando');
  raise notice 'FALLA: un informe apuntó a otra página';
exception when others then
  if sqlerrm like '%no es de esta empresa%' then raise notice 'un informe no apunta a otra página (debe 1): 1';
  else raise notice 'FALLA: %', sqlerrm; end if;
end $$;
do $$ begin
  insert into public.envios (org_id,empresa_id,fecha_lote,canal,destinatario,consultas,documentos,asunto,mensaje,estado) values
   ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a',public.hoy_caracas(),'correo','rrhh127@a.com','{}','{constancia}','x','x','enviando');
  raise notice 'FALLA: un envío de constancias sin consultas';
exception when check_violation then raise notice 'constancias sin consultas no se registran (debe 1): 1';
end $$;
-- RR. HH. no envía informes
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a3',false) \g /dev/null
do $$ begin
  insert into public.envios (org_id,empresa_id,fecha_lote,canal,destinatario,consultas,documentos,ruta,asunto,mensaje,estado) values
   ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a',public.hoy_caracas(),'correo','x@a.com','{}','{puesto}','/imprimir/puesto/c1270000-0000-0000-0000-0000000000f1','x','x','enviando');
  raise notice 'FALLA: RR. HH. envió un informe';
exception when others then raise notice 'RR. HH. no envía informes (debe 1): 1';
end $$;

reset role;
select set_config('request.jwt.claim.sub','',false) \g /dev/null
delete from public.envio_archivos where enlace_id in (select l.id from public.envio_enlaces l join public.envios e on e.id = l.envio_id where e.destinatario in ('rrhh127@a.com','salud127@a.com','584140000127'));
delete from public.envio_enlaces where envio_id in (select id from public.envios where destinatario in ('rrhh127@a.com','salud127@a.com','584140000127'));
delete from public.envios where destinatario in ('rrhh127@a.com','salud127@a.com','584140000127');
delete from public.puestos where id::text like 'c1270000-%';
delete from public.empresa_contactos where id::text like 'c1270000-%';
delete from clinico.consultas where id::text like 'c1270000-%';
