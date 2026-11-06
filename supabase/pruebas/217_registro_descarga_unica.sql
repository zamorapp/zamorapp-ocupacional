-- Enlace del paciente: tras la primera descarga hay 30 minutos para bajar las hojas; luego el enlace queda solo para
-- subir resultados y la limpieza de la bandeja vacía lo elegido (20261030915000).
\pset tuples_only on
reset role;
select set_config('request.jwt.claim.sub','',false) \g /dev/null

set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false) \g /dev/null
insert into public.solicitudes_paciente (id,org_id,token_hash,documentos) values
 ('5f000000-0000-0000-0000-000000000217','10000000-0000-0000-0000-000000000001',sha256('des-0123456789-0123456789-0123456789-uno'),
  '{"ta":{"dias":7},"bienestar":{"tema":["lumbalgia"]}}');

set role anon;
select set_config('request.jwt.claim.sub','',false) \g /dev/null
select 'sin llenar no marca descarga (debe 1): ' || (public.marcar_descarga_registro('des-0123456789-0123456789-0123456789-uno') is null)::int;
select public.enviar_solicitud_paciente('des-0123456789-0123456789-0123456789-uno',
  '{"cedula":"V-11223355","nombres":"Ana","apellidos":"Rey","fecha_nacimiento":"1985-01-01","telefono":"04141234567","motivo":"Control"}') \g /dev/null
select 'antes de descargar ve sus hojas sin plazo (debe 1): ' || count(*) from (select public.documentos_registro_paciente('des-0123456789-0123456789-0123456789-uno') j) x
 where j is not null and j -> 'descarga_hasta' = 'null'::jsonb;
select 'la primera descarga abre 30 minutos (debe 1): ' || (abs(extract(epoch from public.marcar_descarga_registro('des-0123456789-0123456789-0123456789-uno') - public.ahora()) - 1800) < 5)::int;
select 'otra descarga no alarga el plazo (debe 1): ' || (public.marcar_descarga_registro('des-0123456789-0123456789-0123456789-uno')
  = (select public.documentos_registro_paciente('des-0123456789-0123456789-0123456789-uno') ->> 'descarga_hasta')::timestamptz)::int;
select 'dentro de los 30 minutos aún descarga (debe 1): ' || (public.documentos_registro_paciente('des-0123456789-0123456789-0123456789-uno') is not null)::int;
select 'aún no sale el aviso de descargados (debe 0): ' || public.descarga_cerrada_registro('des-0123456789-0123456789-0123456789-uno')::int;
do $$ begin
  update public.solicitudes_paciente set descarga_hasta = null;
  raise notice 'FALLA: el anónimo cambió la ventana';
exception when insufficient_privilege then raise notice 'el anónimo no cambia la ventana a mano (debe 1): 1';
end $$;

-- Pasan los 30 minutos
reset role;
update public.solicitudes_paciente set descarga_hasta = public.ahora() - interval '1 minute' where id = '5f000000-0000-0000-0000-000000000217';
set role anon;
select set_config('request.jwt.claim.sub','',false) \g /dev/null
select 'pasado el plazo ya no descarga (debe 1): ' || (public.documentos_registro_paciente('des-0123456789-0123456789-0123456789-uno') is null)::int;
select 'ni ve sus hojas de bienestar (debe 1): ' || (public.hojas_registro_paciente('des-0123456789-0123456789-0123456789-uno') is null)::int;
select 'sale el aviso de descargados (debe 1): ' || public.descarga_cerrada_registro('des-0123456789-0123456789-0123456789-uno')::int;
select 'volver a tocar descargar no reabre (debe 1): ' || (public.marcar_descarga_registro('des-0123456789-0123456789-0123456789-uno') is null)::int;
select 'la sección de resultados sigue (debe 1): ' || (public.resultados_registro_paciente('des-0123456789-0123456789-0123456789-uno') is not null)::int;
select 'token inventado: sin aviso (debe 0): ' || public.descarga_cerrada_registro('des-0123456789-0123456789-0123456789-xxx')::int;

-- La limpieza de la bandeja vacía lo elegido
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false) \g /dev/null
select public.purgar_solicitudes_paciente() \g /dev/null
reset role;
select 'la limpieza borró lo elegido (debe 1): ' || (documentos = '{}'::jsonb)::int from public.solicitudes_paciente where id = '5f000000-0000-0000-0000-000000000217';
select 'pero no los datos del paciente (debe 1): ' || (datos ->> 'cedula' = 'V-11223355')::int from public.solicitudes_paciente where id = '5f000000-0000-0000-0000-000000000217';

delete from public.solicitudes_paciente where id = '5f000000-0000-0000-0000-000000000217';
delete from public.notificaciones where titulo = 'Paciente envió sus datos';
