-- Enlaces del paciente: anular también uno aceptado (corta descargas y subidas) y eliminar sin tocar la ficha
-- (20261030917000).
\pset tuples_only on
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false) \g /dev/null
insert into public.solicitudes_paciente (id,org_id,token_hash,documentos) values
 ('5f000000-0000-0000-0000-000000000219','10000000-0000-0000-0000-000000000001',sha256('anu-0123456789-0123456789-0123456789-uno'),'{"bienestar":{"tema":["lumbalgia"]}}'),
 ('5f000000-0000-0000-0000-000000000220','10000000-0000-0000-0000-000000000001',sha256('anu-0123456789-0123456789-0123456789-dos'),'{}');
set role anon;
select set_config('request.jwt.claim.sub','',false) \g /dev/null
select public.enviar_solicitud_paciente('anu-0123456789-0123456789-0123456789-uno',
  '{"cedula":"V-11223366","nombres":"Eva","apellidos":"Paz","fecha_nacimiento":"1985-01-01","telefono":"04141234567","motivo":"Control"}') \g /dev/null
reset role;
-- La aceptó el servicio (ficha y cita listas) y el paciente ya subió un archivo
update public.solicitudes_paciente set resultado = 'aceptada', trabajador_id = '30000000-0000-0000-0000-00000000000a', cita_id = gen_random_uuid()
 where id = '5f000000-0000-0000-0000-000000000219';
insert into public.subidas_paciente (ruta, solicitud_id) values ('10000000-0000-0000-0000-000000000001/x/paciente-219.pdf', '5f000000-0000-0000-0000-000000000219');

set role anon;
select 'aceptado: aún descarga (debe 1): ' || (public.documentos_registro_paciente('anu-0123456789-0123456789-0123456789-uno') is not null)::int;

set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false) \g /dev/null
with x as (update public.solicitudes_paciente set anulado_en = now() where id = '5f000000-0000-0000-0000-000000000219' returning 1)
select 'anula un enlace ya aceptado (debe 1): ' || count(*) from x;
do $$ begin
  update public.solicitudes_paciente set anulado_en = now() where id = '5f000000-0000-0000-0000-000000000219';
  raise notice 'FALLA: anuló dos veces';
exception when others then raise notice 'no se anula dos veces (debe 1): 1';
end $$;

set role anon;
select set_config('request.jwt.claim.sub','',false) \g /dev/null
select 'anulado: ya no descarga (debe 1): ' || (public.documentos_registro_paciente('anu-0123456789-0123456789-0123456789-uno') is null)::int;
select 'anulado: ya no sube resultados (debe 1): ' || (public.reservar_resultado_paciente('anu-0123456789-0123456789-0123456789-uno','application/pdf') ? 'error')::int;
select 'anulado: la página dice anulado (debe 1): ' || count(*) from public.ver_solicitud_paciente('anu-0123456789-0123456789-0123456789-uno') where estado = 'anulado';

set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false) \g /dev/null
select public.purgar_solicitudes_paciente() \g /dev/null
reset role;
select 'la limpieza vacía las hojas de un anulado (debe 1): ' || (documentos = '{}'::jsonb)::int from public.solicitudes_paciente where id = '5f000000-0000-0000-0000-000000000219';

-- Eliminar
set role anon;
do $$ begin
  perform public.eliminar_solicitud_paciente('5f000000-0000-0000-0000-000000000220');
  raise notice 'FALLA: el anónimo eliminó';
exception when insufficient_privilege then raise notice 'el anónimo no elimina (debe 1): 1';
end $$;
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a3',false) \g /dev/null
select 'RR. HH. no elimina (debe 1): ' || (public.eliminar_solicitud_paciente('5f000000-0000-0000-0000-000000000220') <> 'ok')::int;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false) \g /dev/null
-- Uno «por revisar» no se elimina: se descarta
reset role;
insert into public.solicitudes_paciente (id,org_id,token_hash,creado_por) values
 ('5f000000-0000-0000-0000-000000000221','10000000-0000-0000-0000-000000000001',sha256('anu-0123456789-0123456789-0123456789-tre'),'00000000-0000-0000-0000-0000000000a1');
set role anon;
select set_config('request.jwt.claim.sub','',false) \g /dev/null
select public.enviar_solicitud_paciente('anu-0123456789-0123456789-0123456789-tre',
  '{"cedula":"V-11223377","nombres":"Leo","apellidos":"Sol","fecha_nacimiento":"1985-01-01","telefono":"04141234567","motivo":"Control"}') \g /dev/null
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false) \g /dev/null
select 'por revisar no se elimina (debe 1): ' || (public.eliminar_solicitud_paciente('5f000000-0000-0000-0000-000000000221') like 'Ese paciente está por revisar%')::int;
select 'y sigue ahí (debe 1): ' || count(*) from public.solicitudes_paciente where id = '5f000000-0000-0000-0000-000000000221';
select 'el servicio elimina uno sin llenar (debe ok): ' || public.eliminar_solicitud_paciente('5f000000-0000-0000-0000-000000000220');
select 'el servicio elimina uno aceptado (debe ok): ' || public.eliminar_solicitud_paciente('5f000000-0000-0000-0000-000000000219');
select 'eliminar dos veces avisa (debe 1): ' || (public.eliminar_solicitud_paciente('5f000000-0000-0000-0000-000000000219') <> 'ok')::int;
reset role;
select 'ya no existen (debe 0): ' || count(*) from public.solicitudes_paciente where id in ('5f000000-0000-0000-0000-000000000219','5f000000-0000-0000-0000-000000000220');
select 'se van sus reservas de subida (debe 0): ' || count(*) from public.subidas_paciente where solicitud_id = '5f000000-0000-0000-0000-000000000219';
select 'la bitácora anota quién eliminó (debe 2): ' || count(*) from public.bitacora
 where tabla = 'public.solicitudes_paciente' and accion = 'DELETE' and usuario_id = '00000000-0000-0000-0000-0000000000a1'
   and registro_id in ('5f000000-0000-0000-0000-000000000219','5f000000-0000-0000-0000-000000000220');
select 'sin datos del paciente ni token (debe 0): ' || count(*) from public.bitacora
 where tabla = 'public.solicitudes_paciente' and accion = 'DELETE' and (antes ? 'datos' or antes ? 'token_hash' or antes ? 'telefono');
select 'la bitácora de enlaces no guarda documentos (debe 0): ' || count(*) from public.bitacora
 where tabla = 'public.solicitudes_paciente' and (antes ? 'documentos' or despues ? 'documentos');
select 'pero sí anota los enlaces (debe 1): ' || (count(*) > 0)::int from public.bitacora where tabla = 'public.solicitudes_paciente';
delete from public.solicitudes_paciente where id = '5f000000-0000-0000-0000-000000000221';
select 'la ficha sigue (debe 1): ' || count(*) from public.trabajadores where id = '30000000-0000-0000-0000-00000000000a';
delete from public.notificaciones where titulo = 'Paciente envió sus datos';
