-- Enlace del paciente: sube sus resultados desde que envía sus datos (por revisar), los archivos esperan en la carpeta
-- de la solicitud y pasan solos a la ficha al aceptar (con o sin cita). Descartado: nunca entran a una historia.
\pset tuples_only on
reset role;
select set_config('request.jwt.claim.sub','',false) \g /dev/null
alter table storage.objects add column if not exists owner_id text, add column if not exists metadata jsonb;

set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false) \g /dev/null
insert into public.solicitudes_paciente (id,org_id,token_hash,nombre,solo_registro) values
 ('5f000000-0000-0000-0000-000000000263','10000000-0000-0000-0000-000000000001',sha256('sub-0123456789-0123456789-0123456789-uno'),'Rosa',true),
 ('5f000000-0000-0000-0000-000000000264','10000000-0000-0000-0000-000000000001',sha256('sub-0123456789-0123456789-0123456789-dos'),'Luis',true);

set role anon;
select set_config('request.jwt.claim.sub','',false) \g /dev/null
select 'sin llenar sus datos no reserva (debe 1): ' || (public.reservar_resultado_paciente('sub-0123456789-0123456789-0123456789-uno','application/pdf') ? 'error')::int;
select 'envía sus datos (debe 1): ' || (public.enviar_solicitud_paciente('sub-0123456789-0123456789-0123456789-uno', jsonb_build_object(
  'cedula','V-13572468','nombres','Rosa','apellidos','Pérez','fecha_nacimiento','1990-01-02','telefono','04141234567',
  'tipo','empresa','empresa','Givaldo','cargo','Analista')) = 'ok')::int;
select 'el otro también (debe 1): ' || (public.enviar_solicitud_paciente('sub-0123456789-0123456789-0123456789-dos', jsonb_build_object(
  'cedula','V-13572469','nombres','Luis','apellidos','Gil','fecha_nacimiento','1990-01-02','telefono','04141234567',
  'tipo','empresa','empresa','Givaldo','cargo','Analista')) = 'ok')::int;
select 'por revisar ya puede subir (debe 1): ' || count(*) from (select public.resultados_registro_paciente('sub-0123456789-0123456789-0123456789-uno') j) x
 where (j->>'puede')::boolean and j->>'motivo' is null;
select set_config('prueba.r1', public.reservar_resultado_paciente('sub-0123456789-0123456789-0123456789-uno','application/pdf')->>'ruta', false) \g /dev/null
select set_config('prueba.r2', public.reservar_resultado_paciente('sub-0123456789-0123456789-0123456789-dos','image/jpeg')->>'ruta', false) \g /dev/null
select 'sin ficha la ruta va en la carpeta de la solicitud (debe 1): ' || (current_setting('prueba.r1') like '10000000-0000-0000-0000-000000000001/5f000000-0000-0000-0000-000000000263/paciente-%.pdf')::int;
select 'Storage acepta la ruta reservada (debe 1): ' || public.subida_paciente_permitida(current_setting('prueba.r1'))::int;
reset role;
insert into storage.objects (bucket_id,name,metadata) values
 ('adjuntos', current_setting('prueba.r1'), '{"mimetype":"application/pdf","size":"52000"}'),
 ('adjuntos', current_setting('prueba.r2'), '{"mimetype":"image/jpeg","size":"40000"}');
delete from public.notificaciones where titulo = 'Resultados enviados por el paciente';
set role anon;
select 'confirma sin ficha (debe 1): ' || (public.confirmar_resultado_paciente('sub-0123456789-0123456789-0123456789-uno', current_setting('prueba.r1'), 'Hematología') = 'ok')::int;
select 'confirma el otro (debe 1): ' || (public.confirmar_resultado_paciente('sub-0123456789-0123456789-0123456789-dos', current_setting('prueba.r2'), 'Orina') = 'ok')::int;
select 'el paciente ve lo que envió (debe 1): ' || count(*) from (select public.resultados_registro_paciente('sub-0123456789-0123456789-0123456789-uno') j) x
 where j->'archivos'->0->>'nombre' = 'Hematología';
reset role;
select 'por revisar NO entra a ninguna historia (debe 0): ' || count(*) from clinico.adjuntos where ruta in (current_setting('prueba.r1'), current_setting('prueba.r2'));
select 'avisa con su nombre y lleva a Por revisar (debe 1): ' || (count(*) > 0 and bool_and(texto like 'Rosa Pérez (por revisar)%' and enlace = '/atencion'))::int
  from public.notificaciones where titulo = 'Resultados enviados por el paciente' and texto like 'Rosa%';
select 'RR. HH. no recibe el aviso (debe 0): ' || count(*) from public.notificaciones where titulo = 'Resultados enviados por el paciente' and usuario_id = '00000000-0000-0000-0000-0000000000a3';

-- RR. HH. de la empresa no ve la carpeta de la solicitud (no hay trabajador con ese id)
select 'la carpeta de la solicitud no es de ningún trabajador (debe 0): ' || count(*) from public.trabajadores where id = '5f000000-0000-0000-0000-000000000263';

-- Validar adjunto: nadie mete ese archivo en otra ficha
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false) \g /dev/null
do $$ begin
  insert into clinico.adjuntos (org_id, trabajador_id, nombre, ruta, tipo_mime, tamano)
  values ('10000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-00000000000a','x', current_setting('prueba.r1'),'application/pdf',52000);
  raise notice 'meter el archivo de una solicitud sin aceptar en una ficha se rechaza (debe 1): 0';
exception when others then raise notice 'meter el archivo de una solicitud sin aceptar en una ficha se rechaza (debe 1): 1';
end $$;

-- Aceptar SIN cita (antes fallaba en la base): pasa los archivos a la ficha
update public.solicitudes_paciente set resultado = 'aceptada', trabajador_id = '30000000-0000-0000-0000-00000000000a' where id = '5f000000-0000-0000-0000-000000000263';
reset role;
select 'aceptada sin cita (debe 1): ' || count(*) from public.solicitudes_paciente where id = '5f000000-0000-0000-0000-000000000263' and resultado = 'aceptada' and cita_id is null;
select 'al aceptar pasa a su ficha con su nombre (debe 1): ' || count(*) from clinico.adjuntos where ruta = current_setting('prueba.r1')
 and trabajador_id = '30000000-0000-0000-0000-00000000000a' and nombre = 'Hematología' and tipo_mime = 'application/pdf' and tamano = 52000;
select 'sin ficha no se acepta (debe 1): ' || count(*) from (select 1) x where exists (select 1 from pg_proc where proname = 'validar_solicitud_paciente'
 and prosrc like '%Al aceptar se indica la ficha%' and prosrc not like '%cita_id is null%');
select 'no se repite al volver a correr (debe 0): ' || public.pasar_subidas_a_ficha('5f000000-0000-0000-0000-000000000263');
select 'el paciente sigue viendo su archivo (debe 1): ' || count(*) from (select public.resultados_registro_paciente('sub-0123456789-0123456789-0123456789-uno') j) x
 where j->'archivos'->0->>'nombre' = 'Hematología' and jsonb_array_length(j->'archivos') = 1;

-- Ya aceptada: lo siguiente va a la carpeta del trabajador y entra directo
set role anon;
select set_config('prueba.r3', public.reservar_resultado_paciente('sub-0123456789-0123456789-0123456789-uno','image/png')->>'ruta', false) \g /dev/null
select 'con ficha va en la carpeta del trabajador (debe 1): ' || (current_setting('prueba.r3') like '10000000-0000-0000-0000-000000000001/30000000-0000-0000-0000-00000000000a/paciente-%.png')::int;
reset role;
insert into storage.objects (bucket_id,name,metadata) values ('adjuntos', current_setting('prueba.r3'), '{"mimetype":"image/png","size":"3000"}');
set role anon;
select 'confirma con ficha (debe 1): ' || (public.confirmar_resultado_paciente('sub-0123456789-0123456789-0123456789-uno', current_setting('prueba.r3'), 'Glicemia') = 'ok')::int;
reset role;
select 'con ficha entra directo (debe 1): ' || count(*) from clinico.adjuntos where ruta = current_setting('prueba.r3') and nombre = 'Glicemia';

-- Descartado: no sube más y lo que envió nunca entra a una historia
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false) \g /dev/null
update public.solicitudes_paciente set resultado = 'descartada' where id = '5f000000-0000-0000-0000-000000000264';
set role anon;
select 'descartado no reserva (debe 1): ' || (public.reservar_resultado_paciente('sub-0123456789-0123456789-0123456789-dos','application/pdf') ? 'error')::int;
reset role;
select 'descartado no entra a ninguna historia (debe 0): ' || count(*) from clinico.adjuntos where ruta = current_setting('prueba.r2');

-- Ficha nacida en la PC: la solicitud se acepta antes de que la ficha llegue a la nube; al llegar, pasan solos
reset role;
insert into public.solicitudes_paciente (id,org_id,token_hash,nombre,solo_registro,creado_por) values
 ('5f000000-0000-0000-0000-000000000265','10000000-0000-0000-0000-000000000001',sha256('sub-0123456789-0123456789-0123456789-tre'),'Ada',true,'00000000-0000-0000-0000-0000000000a1');
set role anon;
select 'el tercero envía sus datos (debe 1): ' || (public.enviar_solicitud_paciente('sub-0123456789-0123456789-0123456789-tre', jsonb_build_object(
  'cedula','V-13572470','nombres','Ada','apellidos','Ruiz','fecha_nacimiento','1990-01-02','telefono','04141234567',
  'tipo','empresa','empresa','Givaldo','cargo','Analista')) = 'ok')::int;
select set_config('prueba.r4', public.reservar_resultado_paciente('sub-0123456789-0123456789-0123456789-tre','application/pdf')->>'ruta', false) \g /dev/null
reset role;
insert into storage.objects (bucket_id,name,metadata) values ('adjuntos', current_setting('prueba.r4'), '{"mimetype":"application/pdf","size":"1000"}');
set role anon;
select 'confirma el tercero (debe 1): ' || (public.confirmar_resultado_paciente('sub-0123456789-0123456789-0123456789-tre', current_setting('prueba.r4'), 'Perfil 20') = 'ok')::int;
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false) \g /dev/null
update public.solicitudes_paciente set resultado = 'aceptada', trabajador_id = '30000000-0000-0000-0000-000000000265' where id = '5f000000-0000-0000-0000-000000000265';
reset role;
select 'sin la ficha en la nube todavía no entra (debe 0): ' || count(*) from clinico.adjuntos where ruta = current_setting('prueba.r4');
-- Llega por la bandeja de una PC: el archivo se anota como cambio de la nube (si no, la PC lo tomaría como eco suyo)
begin;
select set_config('sync.equipo_id','5f000000-0000-0000-0000-0000000e0265',true), set_config('sync.cambio_id','5f000000-0000-0000-0000-0000000c0265',true) \g /dev/null
insert into public.trabajadores (id,org_id,empresa_id,cedula,nombres,apellidos) values
 ('30000000-0000-0000-0000-000000000265','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a','13572470','Ada','Ruiz');
select 'el archivo no queda como eco de la PC (debe 1): ' || count(*) from sync.registro r join clinico.adjuntos a on a.id = r.fila_id
 where a.ruta = current_setting('prueba.r4') and r.equipo_id is null and r.cambio_id is null;
select 'la ficha sí sigue siendo de la PC (debe 1): ' || (current_setting('sync.equipo_id') = '5f000000-0000-0000-0000-0000000e0265')::int;
commit;
select 'al llegar la ficha entra solo (debe 1): ' || count(*) from clinico.adjuntos where ruta = current_setting('prueba.r4') and trabajador_id = '30000000-0000-0000-0000-000000000265';

-- Mensajes en «usted»
select 'mensajes al paciente sin «tú» (debe 0): ' || count(*) from pg_proc where proname in ('reservar_resultado_paciente','confirmar_resultado_paciente')
 and (prosrc like '%Vuelve a%' or prosrc like '%Revisa tu%' or prosrc like '%enviaste%' or prosrc like '%escríbele%');
select 'anónimo no corre el paso a la ficha (debe 0): ' || has_function_privilege('anon','public.pasar_subidas_a_ficha(uuid)','execute')::int;
select 'anónimo no corre el filtro de subida (debe 0): ' || has_function_privilege('anon','public.solicitud_para_subir(text)','execute')::int;

-- Limpieza
delete from clinico.adjuntos where ruta in (current_setting('prueba.r1'), current_setting('prueba.r2'), current_setting('prueba.r3'), current_setting('prueba.r4'));
delete from storage.objects where name in (current_setting('prueba.r1'), current_setting('prueba.r2'), current_setting('prueba.r3'), current_setting('prueba.r4'));
delete from public.notificaciones where titulo in ('Resultados enviados por el paciente', 'Paciente envió sus datos');
delete from public.solicitudes_paciente where id in ('5f000000-0000-0000-0000-000000000263','5f000000-0000-0000-0000-000000000264','5f000000-0000-0000-0000-000000000265');
delete from public.trabajadores where id = '30000000-0000-0000-0000-000000000265';
