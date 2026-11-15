-- Enlace del paciente: la firma y el sello solo salen para el PDF aplanado que arma el servidor con su clave
-- (20261030916000). Un anónimo con el token nunca ve las imágenes; sin «Firmados a mi nombre» tampoco el servidor.
\pset tuples_only on
reset role;
select set_config('request.jwt.claim.sub','',false) \g /dev/null
insert into public.perfiles (id, nombre_completo) values ('00000000-0000-0000-0000-0000000000a1', 'Dr. Prueba 218')
on conflict (id) do update set nombre_completo = excluded.nombre_completo;
update public.perfiles set firma_url = 'data:image/png;base64,FIRMA218', sello_url = 'data:image/png;base64,SELLO218', mostrar_firma = true, mostrar_sello = false
 where id = '00000000-0000-0000-0000-0000000000a1';
insert into public.avisos_push_clave (org_id, clave_hash) values
 ('10000000-0000-0000-0000-000000000001', sha256(convert_to('clave-servidor-218-0123456789-0123456789', 'UTF8')))
on conflict (org_id) do update set clave_hash = excluded.clave_hash;

set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false) \g /dev/null
insert into public.solicitudes_paciente (id,org_id,token_hash,documentos) values
 ('5f000000-0000-0000-0000-000000000218','10000000-0000-0000-0000-000000000001',sha256('fir-0123456789-0123456789-0123456789-uno'),
  '{"control_ta":{"dias":7},"firma":true}'),
 ('5f000000-0000-0000-0000-000000000219','10000000-0000-0000-0000-000000000001',sha256('fir-0123456789-0123456789-0123456789-dos'),
  '{"control_ta":{"dias":7}}');

set role anon;
select set_config('request.jwt.claim.sub','',false) \g /dev/null
select 'sin llenar: nada, ni con la clave (debe 1): ' || (public.firma_registro_pdf('clave-servidor-218-0123456789-0123456789', 'fir-0123456789-0123456789-0123456789-uno') is null)::int;
select public.enviar_solicitud_paciente(t,
  '{"cedula":"V-11223366","nombres":"Ana","apellidos":"Rey","fecha_nacimiento":"1985-01-01","telefono":"04141234567","motivo":"Control"}')
  from unnest(array['fir-0123456789-0123456789-0123456789-uno','fir-0123456789-0123456789-0123456789-dos']) t \g /dev/null
select 'la vista del paciente nunca trae imágenes (debe 0): ' || (public.documentos_registro_paciente('fir-0123456789-0123456789-0123456789-uno')::text ~ 'FIRMA218|SELLO218')::int;
select 'el anónimo sin la clave no las ve (debe 1): ' || (public.firma_registro_pdf(null, 'fir-0123456789-0123456789-0123456789-uno') is null)::int;
select 'con una clave inventada tampoco (debe 1): ' || (public.firma_registro_pdf('otra-clave-0123456789-0123456789-01234567', 'fir-0123456789-0123456789-0123456789-uno') is null)::int;
select 'el servidor con su clave recibe la firma (debe 1): ' || (public.firma_registro_pdf('clave-servidor-218-0123456789-0123456789', 'fir-0123456789-0123456789-0123456789-uno') ->> 'firma' = 'data:image/png;base64,FIRMA218')::int;
select 'respeta «no mostrar sello» del médico (debe 1): ' || (public.firma_registro_pdf('clave-servidor-218-0123456789-0123456789', 'fir-0123456789-0123456789-0123456789-uno') -> 'sello' = 'null'::jsonb)::int;
select 'enlace sin «Firmados a mi nombre»: sin imágenes (debe 1): ' || (public.firma_registro_pdf('clave-servidor-218-0123456789-0123456789', 'fir-0123456789-0123456789-0123456789-dos') is null)::int;
select 'token inventado: nada (debe 1): ' || (public.firma_registro_pdf('clave-servidor-218-0123456789-0123456789', 'fir-0123456789-0123456789-0123456789-xxx') is null)::int;

-- Límite de PDF por enlace: 20 turnos, sin la clave ninguno
select 'sin la clave no reserva turno (debe 0): ' || public.reservar_pdf_registro('otra-clave-0123456789-0123456789-01234567', 'fir-0123456789-0123456789-0123456789-uno')::int;
select 'el servidor reserva 20 turnos (debe 20): ' || count(*) from generate_series(1, 25) g
 where public.reservar_pdf_registro('clave-servidor-218-0123456789-0123456789', 'fir-0123456789-0123456789-0123456789-uno');
select 'el turno 21 se niega (debe 0): ' || public.reservar_pdf_registro('clave-servidor-218-0123456789-0123456789', 'fir-0123456789-0123456789-0123456789-uno')::int;
select 'reservar turnos no abre la ventana de descarga (debe 1): ' || (public.documentos_registro_paciente('fir-0123456789-0123456789-0123456789-uno') -> 'descarga_hasta' = 'null'::jsonb)::int;
do $$ begin
  update public.solicitudes_paciente set pdf_generados = 0;
  raise notice 'FALLA: el anónimo reinició el contador';
exception when insufficient_privilege then raise notice 'el anónimo no reinicia el contador (debe 1): 1';
end $$;

-- Cerrada la ventana de descarga, tampoco
reset role;
update public.solicitudes_paciente set descarga_hasta = public.ahora() - interval '1 minute' where id = '5f000000-0000-0000-0000-000000000218';
set role anon;
select 'pasada la descarga ya no hay firma (debe 1): ' || (public.firma_registro_pdf('clave-servidor-218-0123456789-0123456789', 'fir-0123456789-0123456789-0123456789-uno') is null)::int;
select 'ni con clave errada (debe 1): ' || (public.firma_registro_pdf('otra-clave-0123456789-0123456789-01234567', 'fir-0123456789-0123456789-0123456789-uno') is null)::int;
select 'ni turno de PDF (debe 0): ' || public.reservar_pdf_registro('clave-servidor-218-0123456789-0123456789', 'fir-0123456789-0123456789-0123456789-uno')::int;

reset role;
delete from public.solicitudes_paciente where id in ('5f000000-0000-0000-0000-000000000218','5f000000-0000-0000-0000-000000000219');
delete from public.notificaciones where titulo = 'Paciente envió sus datos';
delete from public.avisos_push_clave where org_id = '10000000-0000-0000-0000-000000000001';
update public.perfiles set firma_url = null, sello_url = null, mostrar_sello = true where id = '00000000-0000-0000-0000-0000000000a1';
