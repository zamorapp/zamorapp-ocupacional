-- Constancias de aptitud automáticas: la solicitud APT se responde sola con la constancia firmada (al pedirla o al
-- prepararse), RR. HH. la baja solo de su empresa, nadie más escribe el PDF, y el correo diario por empresa con la clave
-- del servidor. Deja los datos como los encontró.
\pset tuples_only on
reset role;
select set_config('request.jwt.claim.sub','',false) \g /dev/null
insert into public.trabajadores (id,org_id,empresa_id,cedula,nombres,apellidos,creado_en) values
 ('31820000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a','182001','Luis','Ciento','2020-01-01');
insert into clinico.consultas (id,org_id,empresa_id,trabajador_id,estado,fecha,hora_inicio) values
 ('41820000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a','31820000-0000-0000-0000-000000000001','borrador',public.hoy_caracas() - 2, now() - interval '2 days');
insert into clinico.aptitudes (org_id,consulta_id,trabajador_id,clasificacion) values
 ('10000000-0000-0000-0000-000000000001','41820000-0000-0000-0000-000000000001','31820000-0000-0000-0000-000000000001','elegible');
update clinico.consultas set estado='firmada', firmada_en=now() - interval '2 days' where id='41820000-0000-0000-0000-000000000001';
insert into public.empresa_contactos (id,org_id,empresa_id,nombre,correo) values
 ('c1820000-0000-0000-0000-0000000000a1','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a','RRHH 182','rrhh182@a.com');
delete from public.avisos_push_clave where org_id='10000000-0000-0000-0000-000000000001';
insert into public.avisos_push_clave (org_id, clave_hash) values
 ('10000000-0000-0000-0000-000000000001', sha256(convert_to('clave-de-prueba-182-0123456789abcdef','UTF8')));
create temp table pdf182 as select encode(convert_to('%PDF-1.4 ' || repeat('x', 800), 'UTF8'), 'base64') as b;
grant select on pdf182 to authenticated;

set role authenticated;
-- Médico: nadie la espera todavía
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false) \g /dev/null
select 'sin solicitud no hay que preparar (debe 0): ' || count(*) from public.constancias_por_preparar(array['41820000-0000-0000-0000-000000000001'::uuid]);

-- RR. HH. la pide sin PDF listo: queda pendiente
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a3',false) \g /dev/null
insert into public.solicitudes (id,org_id,empresa_id,tipo_id,tipo,trabajador_id,detalle,estado,respondida_auto,constancia_consulta_id)
 select 'c1820000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a',i.id,'',
        '31820000-0000-0000-0000-000000000001','Copia por favor','respondida',true,'41820000-0000-0000-0000-000000000001'
   from public.lista_items i where i.lista='tipo_solicitud' and i.codigo='APT' and i.org_id is null;
select 'sin PDF queda pendiente y sin marca (debe 1): ' || count(*) from public.solicitudes
 where id='c1820000-0000-0000-0000-000000000001' and estado='pendiente' and not respondida_auto and constancia_consulta_id is null;
do $$ begin
  perform public.guardar_constancia_lista('41820000-0000-0000-0000-000000000001', (select b from pdf182));
  raise notice 'FALLA: RR. HH. guardó una constancia';
exception when others then raise notice 'RR. HH. no guarda constancias (debe 1): 1';
end $$;
do $$ begin
  perform 1 from public.constancias_listas;
  raise notice 'FALLA: RR. HH. leyó constancias_listas';
exception when others then raise notice 'nadie lee la tabla directo (debe 1): 1';
end $$;

-- Médico: ahora sí hay que prepararla; al guardarla responde la solicitud
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false) \g /dev/null
select 'con solicitud abierta hay que prepararla (debe 1): ' || count(*) from public.constancias_por_preparar(array['41820000-0000-0000-0000-000000000001'::uuid]);
do $$ begin
  perform public.guardar_constancia_lista('41820000-0000-0000-0000-000000000001', encode(convert_to('no es pdf ' || repeat('y', 800), 'UTF8'), 'base64'));
  raise notice 'FALLA: guardó algo que no es PDF';
exception when others then raise notice 'solo PDF (debe 1): 1';
end $$;
select 'solicitudes respondidas al guardar (debe 1): ' || public.guardar_constancia_lista('41820000-0000-0000-0000-000000000001', (select b from pdf182));
select 'respondida sola con hora (debe 1): ' || count(*) from public.solicitudes
 where id='c1820000-0000-0000-0000-000000000001' and estado='respondida' and respondida_auto and respondida_en is not null
   and constancia_consulta_id='41820000-0000-0000-0000-000000000001' and not solo_salud;
select 'aviso al servicio (debe 1): ' || count(*) from public.notificaciones where titulo='Respondida automáticamente' and texto like '%Luis Ciento%';
-- El servicio no le cambia la marca ni la constancia
update public.solicitudes set respondida_auto=false, constancia_consulta_id=null where id='c1820000-0000-0000-0000-000000000001';
select 'la marca no se toca a mano (debe 1): ' || count(*) from public.solicitudes where id='c1820000-0000-0000-0000-000000000001' and respondida_auto and constancia_consulta_id is not null;

-- RR. HH. la vuelve a pedir: sale en el mismo paso y la baja
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a3',false) \g /dev/null
insert into public.solicitudes (id,org_id,empresa_id,tipo_id,tipo,trabajador_id,detalle)
 select 'c1820000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a',i.id,'',
        '31820000-0000-0000-0000-000000000001','Otra copia'
   from public.lista_items i where i.lista='tipo_solicitud' and i.codigo='APT' and i.org_id is null;
select 'respondida al pedirla (debe 1): ' || count(*) from public.solicitudes where id='c1820000-0000-0000-0000-000000000002' and estado='respondida' and respondida_auto;
select 'RR. HH. ve el nombre del documento (debe 1): ' || count(*) from public.solicitudes_respuesta where id='c1820000-0000-0000-0000-000000000002' and documento_nombre='Constancia de aptitud.pdf';
select 'RR. HH. baja la constancia (debe 1): ' || count(*) from public.constancia_de_solicitud('c1820000-0000-0000-0000-000000000002') where contenido_base64 <> '';
-- Otro tipo de solicitud no se responde solo
insert into public.solicitudes (id,org_id,empresa_id,tipo_id,tipo,trabajador_id,detalle)
 select 'c1820000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a',i.id,'',
        '31820000-0000-0000-0000-000000000001','Informe'
   from public.lista_items i where i.lista='tipo_solicitud' and i.codigo='INF' and i.org_id is null;
select 'un informe no sale solo (debe 1): ' || count(*) from public.solicitudes where id='c1820000-0000-0000-0000-000000000003' and estado='pendiente' and not respondida_auto;
select 'sin constancia en otra solicitud (debe 0): ' || count(*) from public.constancia_de_solicitud('c1820000-0000-0000-0000-000000000003');
do $$ begin
  insert into public.empresa_envio_auto (empresa_id, org_id, activo) values ('20000000-0000-0000-0000-00000000000a','10000000-0000-0000-0000-000000000001',true);
  raise notice 'FALLA: RR. HH. activó el envío automático';
exception when others then raise notice 'RR. HH. no activa el envío (debe 1): 1';
end $$;

-- Trabajador que cambió de empresa (Analizar, #215): la constancia de la A nunca responde la solicitud de la B
reset role;
select set_config('request.jwt.claim.sub','',false) \g /dev/null
insert into public.trabajadores (id,org_id,empresa_id,cedula,nombres,apellidos,creado_en) values
 ('31820000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a','182002','Rosa','Mudanza','2020-01-01');
insert into clinico.consultas (id,org_id,empresa_id,trabajador_id,estado,fecha) values
 ('41820000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a','31820000-0000-0000-0000-000000000002','borrador',public.hoy_caracas() - 5);
insert into clinico.aptitudes (org_id,consulta_id,trabajador_id,clasificacion) values
 ('10000000-0000-0000-0000-000000000001','41820000-0000-0000-0000-000000000003','31820000-0000-0000-0000-000000000002','elegible');
update clinico.consultas set estado='firmada', firmada_en=now() - interval '5 days' where id='41820000-0000-0000-0000-000000000003';
insert into public.constancias_listas (consulta_id,org_id,empresa_id,trabajador_id,nombre,contenido) values
 ('41820000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a','31820000-0000-0000-0000-000000000002','Constancia 182002.pdf', decode((select b from pdf182),'base64'));
update public.trabajadores set empresa_id='20000000-0000-0000-0000-00000000000b' where id='31820000-0000-0000-0000-000000000002';
insert into auth.users (id,email) values ('00000000-0000-0000-0000-0000000001b2','rrhhB182@x') on conflict do nothing;
insert into public.miembros (org_id,usuario_id,rol,empresas_permitidas) values
 ('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000001b2','gerente_empresa','{20000000-0000-0000-0000-00000000000b}');
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000001b2',false) \g /dev/null
insert into public.solicitudes (id,org_id,empresa_id,tipo_id,tipo,trabajador_id,detalle)
 select 'c1820000-0000-0000-0000-000000000004','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000b',i.id,'',
        '31820000-0000-0000-0000-000000000002','Copia en la nueva empresa'
   from public.lista_items i where i.lista='tipo_solicitud' and i.codigo='APT' and i.org_id is null;
select 'otra empresa: queda pendiente para el servicio (debe 1): ' || count(*) from public.solicitudes
 where id='c1820000-0000-0000-0000-000000000004' and estado='pendiente' and not respondida_auto;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false) \g /dev/null
select 'volver a guardar la de A no responde la de B (debe 0): ' || public.guardar_constancia_lista('41820000-0000-0000-0000-000000000003', (select b from pdf182));

-- Recepción de otra empresa (limitada a la B) no la baja
reset role;
insert into auth.users (id,email) values ('00000000-0000-0000-0000-000000000182','recep182@x') on conflict do nothing;
insert into public.miembros (org_id,usuario_id,rol,empresas_permitidas) values
 ('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000182','recepcion','{20000000-0000-0000-0000-00000000000b}');
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000182',false) \g /dev/null
select 'otra empresa no la baja (debe 0): ' || count(*) from public.constancia_de_solicitud('c1820000-0000-0000-0000-000000000002');

-- Envío automático: lo activa el médico; solo cuenta lo firmado desde entonces
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false) \g /dev/null
insert into public.empresa_envio_auto (empresa_id, org_id, activo, hora) values ('20000000-0000-0000-0000-00000000000a','10000000-0000-0000-0000-000000000001',true,0);
select 'activado con fecha de inicio (debe 1): ' || count(*) from public.empresa_envio_auto where empresa_id='20000000-0000-0000-0000-00000000000a' and activo and desde is not null;
reset role;
select 'lo firmado antes no sale (debe 0): ' || count(*) from public.constancias_del_dia('clave-de-prueba-182-0123456789abcdef');
insert into clinico.consultas (id,org_id,empresa_id,trabajador_id,estado,fecha) values
 ('41820000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a','31820000-0000-0000-0000-000000000001','borrador',public.hoy_caracas());
insert into clinico.aptitudes (org_id,consulta_id,trabajador_id,clasificacion) values
 ('10000000-0000-0000-0000-000000000001','41820000-0000-0000-0000-000000000002','31820000-0000-0000-0000-000000000001','elegible');
update clinico.consultas set estado='firmada', firmada_en=now() + interval '1 minute' where id='41820000-0000-0000-0000-000000000002';
set role authenticated;
select 'firmada tras activar: hay que prepararla (debe 1): ' || count(*) from public.constancias_por_preparar(array['41820000-0000-0000-0000-000000000002'::uuid]);
select 'guardada sin solicitudes abiertas (debe 0): ' || public.guardar_constancia_lista('41820000-0000-0000-0000-000000000002', (select b from pdf182));
reset role;
select set_config('request.jwt.claim.sub','',false) \g /dev/null
select 'clave errada no da nada (debe 0): ' || count(*) from public.constancias_del_dia('clave-errada-0000000000000000000000000');
select 'el correo del día trae 1 constancia (debe 1): ' || count(*) from public.constancias_del_dia('clave-de-prueba-182-0123456789abcdef') where 'rrhh182@a.com' = any (destinatarios);
select 'reservada: otro latido no la repite (debe 0): ' || count(*) from public.constancias_del_dia('clave-de-prueba-182-0123456789abcdef');
select 'marcadas (debe 1): ' || public.marcar_constancias_enviadas('clave-de-prueba-182-0123456789abcdef','20000000-0000-0000-0000-00000000000a',array['41820000-0000-0000-0000-000000000002'::uuid],array['rrhh182@a.com']);
select 'no se repite el mismo día (debe 0): ' || count(*) from public.constancias_del_dia('clave-de-prueba-182-0123456789abcdef');
select 'día anotado (debe 1): ' || count(*) from public.empresa_envio_auto where empresa_id='20000000-0000-0000-0000-00000000000a' and ultimo_envio = public.hoy_caracas();

-- Corregir (reabrir) una firmada borra su PDF listo
update clinico.consultas set estado='borrador' where id='41820000-0000-0000-0000-000000000002';
select 'reabierta sin PDF (debe 0): ' || count(*) from public.constancias_listas where consulta_id='41820000-0000-0000-0000-000000000002';

reset role;
delete from public.notificaciones where texto like '%Luis Ciento%' or texto like '%rrhh182%' or titulo = 'Constancias sin enviar';
delete from public.solicitudes where id::text like 'c1820000-%';
delete from public.empresa_envio_auto where empresa_id='20000000-0000-0000-0000-00000000000a';
delete from public.constancias_listas where trabajador_id::text like '31820000-%';
delete from clinico.aptitudes where consulta_id::text like '41820000-%';
delete from clinico.consultas where id::text like '41820000-%';
delete from public.trabajadores where id::text like '31820000-%';
delete from public.empresa_contactos where id::text like 'c1820000-%';
delete from public.avisos_push_clave where org_id='10000000-0000-0000-0000-000000000001';
delete from public.miembros where usuario_id in ('00000000-0000-0000-0000-000000000182','00000000-0000-0000-0000-0000000001b2');
drop table pdf182;
