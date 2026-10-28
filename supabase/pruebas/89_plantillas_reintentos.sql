-- Prueba 89 (va antes de 91 y deja todo como lo encontró). Plantillas de correo (generales solo gerente médico/administrador, por empresa según permisos) y reintentos de envíos.
\pset tuples_only on
reset role;
select set_config('request.jwt.claim.sub','',false) \g /dev/null
insert into clinico.consultas (id,org_id,empresa_id,trabajador_id,estado,fecha) values
 ('4a000000-0000-0000-0000-00000000000a','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a','30000000-0000-0000-0000-00000000000a','firmada',public.hoy_caracas());
insert into public.empresa_contactos (id,org_id,empresa_id,nombre,correo,recibe_consulta) values
 ('5a000000-0000-0000-0000-0000000000a1','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a','RRHH A2','rrhh2@a.com',false);
select 'la organización que ya existía trae su plantilla general (debe 1): ' || count(*) from public.plantillas_correo
  where empresa_id is null and predeterminada and org_id not in ('10000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000009');
-- La organización de prueba se crea después de las migraciones: su plantilla general se agrega aquí
insert into public.plantillas_correo (org_id,nombre,asunto,mensaje,predeterminada) values ('10000000-0000-0000-0000-000000000001','General','Evaluaciones médicas · [empresa]','Adjunto…',true);

set role authenticated;
-- ── Plantillas
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a3',false) \g /dev/null
select 'RR. HH. de la empresa no ve plantillas (debe 0): ' || count(*) from public.plantillas_correo;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false) \g /dev/null
select 'médico ve la plantilla general (debe 1): ' || count(*) from public.plantillas_correo where empresa_id is null;
do $$ begin
  update public.plantillas_correo set mensaje = 'otro' where empresa_id is null;
  raise notice 'FALLA: un médico cambió la plantilla general';
exception when others then
  if sqlerrm like '%Solo el gerente médico o el administrador%' then raise notice 'médico no cambia la plantilla general (debe 1): 1';
  else raise notice 'FALLA: %', sqlerrm; end if;
end $$;
insert into public.plantillas_correo (org_id,empresa_id,nombre,asunto,mensaje,predeterminada)
values ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a','Para A','Asunto A','Hola [empresa]',true);
select 'médico crea la plantilla de su empresa (debe 1): ' || count(*) from public.plantillas_correo where empresa_id = '20000000-0000-0000-0000-00000000000a';
do $$ begin
  insert into public.plantillas_correo (org_id,empresa_id,nombre,asunto,mensaje)
  values ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000b','Para B','x','x');
  raise notice 'FALLA: un médico creó plantilla de una empresa que no ve';
exception when insufficient_privilege then raise notice 'médico no crea plantilla de otra empresa (debe 1): 1';
end $$;
do $$ begin
  insert into public.plantillas_correo (org_id,empresa_id,nombre,asunto,mensaje,predeterminada)
  values ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a','Otra A','x','x',true);
  raise notice 'FALLA: dos plantillas predeterminadas para la misma empresa';
exception when unique_violation then raise notice 'una sola predeterminada por empresa (debe 1): 1';
end $$;
do $$ begin
  delete from public.plantillas_correo;
  raise notice 'FALLA: se borró una plantilla';
exception when insufficient_privilege then raise notice 'las plantillas no se borran, se desactivan (debe 1): 1';
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false) \g /dev/null
update public.plantillas_correo set asunto = 'Evaluaciones · [empresa]' where empresa_id is null;
select 'administrador cambia la plantilla general (debe 1): ' || count(*) from public.plantillas_correo where asunto = 'Evaluaciones · [empresa]';

-- ── Reintentos
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false) \g /dev/null
insert into public.envios (id,org_id,empresa_id,fecha_lote,canal,destinatario,contacto_id,consultas,documentos,asunto,mensaje,estado) values
 ('6a000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a',public.hoy_caracas(),'correo','rrhh2@a.com','5a000000-0000-0000-0000-0000000000a1','{4a000000-0000-0000-0000-00000000000a}','{constancia}','x','x','enviando'),
 ('6a000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a',public.hoy_caracas(),'correo','rrhh2@a.com','5a000000-0000-0000-0000-0000000000a1','{4a000000-0000-0000-0000-00000000000a}','{constancia}','x','x','enviando');
update public.envios set estado = 'fallido', error = 'SMTP caído' where id = '6a000000-0000-0000-0000-000000000001';
update public.envios set estado = 'enviado' where id = '6a000000-0000-0000-0000-000000000002';
do $$ begin
  insert into public.envios (org_id,empresa_id,fecha_lote,canal,destinatario,contacto_id,consultas,documentos,asunto,mensaje,estado,reintento_de)
  values ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a',public.hoy_caracas(),'correo','rrhh2@a.com','5a000000-0000-0000-0000-0000000000a1','{4a000000-0000-0000-0000-00000000000a}','{constancia}','x','x','enviando','6a000000-0000-0000-0000-000000000002');
  raise notice 'FALLA: se reintentó un correo ya enviado';
exception when others then
  if sqlerrm like '%Solo se reintenta un correo fallido%' then raise notice 'un correo enviado no se reintenta (debe 1): 1';
  else raise notice 'FALLA: %', sqlerrm; end if;
end $$;
do $$ begin
  insert into public.envios (org_id,empresa_id,fecha_lote,canal,destinatario,contacto_id,consultas,documentos,asunto,mensaje,estado,reintento_de)
  values ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a',public.hoy_caracas(),'correo','otro@gmail.com',null,'{4a000000-0000-0000-0000-00000000000a}','{constancia}','x','x','enviando','6a000000-0000-0000-0000-000000000001');
  raise notice 'FALLA: el reintento cambió el destinatario';
exception when others then
  if sqlerrm like '%idéntico al envío original%' then raise notice 'el reintento no cambia destinatario (debe 1): 1';
  else raise notice 'FALLA: %', sqlerrm; end if;
end $$;
insert into public.envios (id,org_id,empresa_id,fecha_lote,canal,destinatario,contacto_id,consultas,documentos,asunto,mensaje,estado,reintento_de)
values ('6a000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a',public.hoy_caracas(),'correo','rrhh2@a.com','5a000000-0000-0000-0000-0000000000a1','{4a000000-0000-0000-0000-00000000000a}','{constancia}','x2','x2','enviando','6a000000-0000-0000-0000-000000000001');
select 'el fallido se reintenta (debe 1): ' || count(*) from public.envios where reintento_de = '6a000000-0000-0000-0000-000000000001';
do $$ begin
  insert into public.envios (org_id,empresa_id,fecha_lote,canal,destinatario,contacto_id,consultas,documentos,asunto,mensaje,estado,reintento_de)
  values ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a',public.hoy_caracas(),'correo','rrhh2@a.com','5a000000-0000-0000-0000-0000000000a1','{4a000000-0000-0000-0000-00000000000a}','{constancia}','x','x','enviando','6a000000-0000-0000-0000-000000000001');
  raise notice 'FALLA: el mismo fallido se reintentó dos veces';
exception when unique_violation then raise notice 'cada envío se reintenta una sola vez (debe 1): 1';
end $$;
do $$ begin
  insert into public.envios (org_id,empresa_id,fecha_lote,canal,destinatario,contacto_id,consultas,documentos,asunto,mensaje,estado,reintento_de)
  values ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a',public.hoy_caracas(),'correo','rrhh2@a.com','5a000000-0000-0000-0000-0000000000a1','{4a000000-0000-0000-0000-00000000000a}','{constancia}','x','x','enviando','6a000000-0000-0000-0000-000000000003');
  raise notice 'FALLA: se reintentó un correo recién registrado';
exception when others then
  if sqlerrm like '%Solo se reintenta un correo fallido%' then raise notice 'un correo en curso no se reintenta antes de 10 min (debe 1): 1';
  else raise notice 'FALLA: %', sqlerrm; end if;
end $$;
do $$ begin
  update public.envios set reintento_de = null where id = '6a000000-0000-0000-0000-000000000003';
  raise notice 'FALLA: se cambió el enlace del reintento';
exception when insufficient_privilege then raise notice 'el reintento no se reescribe (debe 1): 1';
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a3',false) \g /dev/null
select 'RR. HH. no ve la bitácora (debe 0): ' || count(*) from public.envios;
reset role;
-- Limpieza: las pruebas siguientes (91 envíos) cuentan contactos y envíos de la empresa A
select set_config('request.jwt.claim.sub','',false) \g /dev/null
delete from public.envios where id::text like '6a000000-%';
delete from public.empresa_contactos where id = '5a000000-0000-0000-0000-0000000000a1';
delete from clinico.consultas where id = '4a000000-0000-0000-0000-00000000000a';
delete from public.plantillas_correo where org_id = '10000000-0000-0000-0000-000000000001';
