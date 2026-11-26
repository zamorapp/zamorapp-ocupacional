-- Empresas A y B ficticias. El historial y los avisos se revierten al terminar.
begin;
set local "request.jwt.claim.sub" = '';
insert into auth.users (id,email) values
 ('27400000-0000-0000-0000-000000000001','rrhh-b@prueba.invalid'),
 ('27400000-0000-0000-0000-000000000002','rrhh-a-restringido@prueba.invalid'),
 ('27400000-0000-0000-0000-000000000003','gerencia-b@prueba.invalid');
insert into public.miembros (org_id,usuario_id,rol,empresas_permitidas,permisos_portal) values
 ('10000000-0000-0000-0000-000000000001','27400000-0000-0000-0000-000000000001','gerente_empresa','{20000000-0000-0000-0000-00000000000b}',null),
 ('10000000-0000-0000-0000-000000000001','27400000-0000-0000-0000-000000000002','gerente_empresa','{20000000-0000-0000-0000-00000000000a}','{}'),
 ('10000000-0000-0000-0000-000000000001','27400000-0000-0000-0000-000000000003','gerente_medico','{20000000-0000-0000-0000-00000000000b}',null);
update public.miembros set permisos_portal=null
 where usuario_id='00000000-0000-0000-0000-0000000000a3' and org_id='10000000-0000-0000-0000-000000000001';
insert into public.trabajadores (id,org_id,empresa_id,cedula,nombres,apellidos) values
 ('27400000-0000-0000-0000-00000000000a','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a','274001','Trabajadora','Ficticia');
insert into clinico.consultas (id,org_id,empresa_id,trabajador_id,estado,fecha) values
 ('27400000-0000-0000-0000-00000000000c','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a','27400000-0000-0000-0000-00000000000a','borrador',public.hoy_caracas());
insert into clinico.aptitudes (org_id,consulta_id,trabajador_id,clasificacion) values
 ('10000000-0000-0000-0000-000000000001','27400000-0000-0000-0000-00000000000c','27400000-0000-0000-0000-00000000000a','elegible');

set local role authenticated;
set local "request.jwt.claim.sub" = '00000000-0000-0000-0000-0000000000a3';
set local "request.jwt.claims" = '{"session_id":"27400000-0000-0000-0000-000000000004"}';
select 'primer ingreso de RR. HH. A (debe 1): ' || public.registrar_actividad_rrhh('ingreso','20000000-0000-0000-0000-00000000000a')::int;
select 'recarga de la misma sesión (debe 0): ' || public.registrar_actividad_rrhh('ingreso','20000000-0000-0000-0000-00000000000a')::int;
select 'ingreso falso en B (debe 0): ' || public.registrar_actividad_rrhh('ingreso','20000000-0000-0000-0000-00000000000b')::int;
select 'RR. HH. no lee el historial interno (debe 0): ' || count(id) from public.actividad_rrhh;
select 'un borrador no sale en las evaluaciones (debe 0): ' || count(*) from public.evaluaciones_firmadas_rrhh('10000000-0000-0000-0000-000000000001') where consulta_id='27400000-0000-0000-0000-00000000000c';
insert into public.solicitudes (id,org_id,empresa_id,tipo_id,tipo,trabajador_id,detalle)
 select '27400000-0000-0000-0000-00000000001a','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a',
  id,'','27400000-0000-0000-0000-00000000000a','Solicitud ficticia'
 from public.lista_items where lista='tipo_solicitud' and codigo='APT' and org_id is null;
select 'la solicitud pendiente no registra descarga (debe 0): ' || public.registrar_actividad_rrhh('documento_entregado','27400000-0000-0000-0000-00000000001a')::int;
select 'Excel autorizado produce un registro (debe 1): ' || public.registrar_actividad_rrhh('relacion_entregada','20000000-0000-0000-0000-00000000000a','2026-11')::int;

reset role;
set local "request.jwt.claim.sub" = '';
update clinico.consultas set estado='firmada' where id='27400000-0000-0000-0000-00000000000c';
select 'se avisa de la firma en A (debe 1): ' || count(*) from public.notificaciones
 where usuario_id='27400000-0000-0000-0000-000000000002' and titulo='Evaluación atendida y firmada';
select 'la firma no se avisa a B (debe 0): ' || count(*) from public.notificaciones
 where usuario_id='27400000-0000-0000-0000-000000000001' and titulo='Evaluación atendida y firmada';
select 'sin PDF no se anuncia una constancia (debe 0): ' || count(*) from public.actividad_rrhh
 where tipo='constancia_lista' and clave='27400000-0000-0000-0000-00000000000c';
insert into public.constancias_listas (consulta_id,org_id,empresa_id,trabajador_id,nombre,contenido)
 values ('27400000-0000-0000-0000-00000000000c','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a',
 '27400000-0000-0000-0000-00000000000a','Constancia ficticia.pdf',convert_to('%PDF-' || repeat('x',502),'UTF8'));
update public.constancias_listas set contenido=contenido where consulta_id='27400000-0000-0000-0000-00000000000c';
select 'solo un aviso de disponibilidad (debe 1): ' || count(*) from public.notificaciones
 where usuario_id='00000000-0000-0000-0000-0000000000a3' and titulo='Constancia de aptitud disponible' and empresa_id='20000000-0000-0000-0000-00000000000a'
   and creado_en >= transaction_timestamp();
select 'sin permiso no llega aviso de descarga (debe 0): ' || count(*) from public.notificaciones
 where usuario_id='27400000-0000-0000-0000-000000000002' and titulo='Constancia de aptitud disponible';

set local role authenticated;
set local "request.jwt.claim.sub" = '27400000-0000-0000-0000-000000000002';
select 'A sin permiso ve firma pero no botón (debe 1): ' || count(*) from public.evaluaciones_firmadas_rrhh('10000000-0000-0000-0000-000000000001')
 where consulta_id='27400000-0000-0000-0000-00000000000c' and not constancia_lista;
select 'A sin permiso no descarga por URL directa (debe 0): ' || count(*) from public.entregar_constancia_rrhh('27400000-0000-0000-0000-00000000000c');
select 'A sin permiso de relación no registra Excel (debe 0): ' || public.registrar_actividad_rrhh('relacion_entregada','20000000-0000-0000-0000-00000000000a','2026-11')::int;
set local "request.jwt.claim.sub" = '27400000-0000-0000-0000-000000000001';
select 'B no ve evaluaciones de A (debe 0): ' || count(*) from public.evaluaciones_firmadas_rrhh('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a');
select 'una organización ajena no devuelve evaluaciones (debe 0): ' || count(*) from public.evaluaciones_firmadas_rrhh('27400000-0000-0000-0000-000000000099');
select 'B no obtiene PDF de A (debe 0): ' || count(*) from public.entregar_constancia_rrhh('27400000-0000-0000-0000-00000000000c');
set local "request.jwt.claim.sub" = '00000000-0000-0000-0000-0000000000a3';
select 'A baja solo la constancia permitida (debe 1): ' || count(*) from public.entregar_constancia_rrhh('27400000-0000-0000-0000-00000000000c') where nombre='Constancia ficticia.pdf';
select 'A puede repetir la descarga (debe 1): ' || count(*) from public.entregar_constancia_rrhh('27400000-0000-0000-0000-00000000000c');
set local "request.jwt.claim.sub" = '27400000-0000-0000-0000-000000000003';
select 'gerencia B no lee actividad de A (debe 0): ' || count(id) from public.actividad_rrhh where empresa_id='20000000-0000-0000-0000-00000000000a';
set local "request.jwt.claim.sub" = '00000000-0000-0000-0000-0000000000a1';
select 'admin ve una entrega deduplicada (debe 1): ' || count(id) from public.actividad_rrhh
 where tipo='constancia_entregada' and fecha >= transaction_timestamp() and empresa_id='20000000-0000-0000-0000-00000000000a';
select 'admin ve la solicitud registrada (debe 1): ' || count(id) from public.actividad_rrhh where tipo='solicitud' and fecha >= transaction_timestamp();
rollback;
