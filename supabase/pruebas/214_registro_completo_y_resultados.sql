-- Enlace del paciente: datos completos para la consulta (antecedentes y hábitos del catálogo, motivo obligatorio) y
-- subida de sus resultados (solo aceptado, 30 días, ruta reservada, tipo y tamaño de Storage, aviso a los médicos).
\pset tuples_only on
reset role;
select set_config('request.jwt.claim.sub','',false) \g /dev/null
alter table storage.objects add column if not exists owner_id text, add column if not exists metadata jsonb;
insert into public.lista_items (id,lista,org_id,nombre,grupo,codigo) values
 ('5f000000-0000-0000-0000-0000000214a1','antecedente_medico','10000000-0000-0000-0000-000000000001','HTA prueba 214','personal',null),
 ('5f000000-0000-0000-0000-0000000214a2','antecedente_medico','10000000-0000-0000-0000-000000000001','Diabetes prueba 214','familiar',null),
 ('5f000000-0000-0000-0000-0000000214a3','habito','10000000-0000-0000-0000-000000000001','Tabaco prueba 214',null,'tabaco214')
on conflict do nothing;
insert into public.lista_items (id,lista,org_id,nombre,grupo,activo) values
 ('5f000000-0000-0000-0000-0000000214a4','antecedente_medico','10000000-0000-0000-0000-000000000001','Inactivo 214','personal',false)
on conflict do nothing;

set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false) \g /dev/null
insert into public.solicitudes_paciente (id,org_id,token_hash,nombre) values
 ('5f000000-0000-0000-0000-000000000214','10000000-0000-0000-0000-000000000001',sha256('res-0123456789-0123456789-0123456789-uno'),'Gilberto');

set role anon;
select set_config('request.jwt.claim.sub','',false) \g /dev/null
select 'el catálogo trae antecedentes activos y hábitos, sin inactivos (debe 1): ' || count(*) from (select public.catalogo_registro_paciente('res-0123456789-0123456789-0123456789-uno') j) x
 where j->'antecedentes' @> '[{"nombre":"HTA prueba 214","grupo":"personal"}]' and j->'habitos' @> '[{"clave":"tabaco214"}]'
   and not j::text like '%Inactivo 214%' and j->>'remitente' = 'Org';
select 'sin motivo no se envía (debe 1): ' || (public.enviar_solicitud_paciente('res-0123456789-0123456789-0123456789-uno',
  '{"cedula":"V-24680135","nombres":"Gilberto","apellidos":"Gómez","fecha_nacimiento":"1991-02-03","telefono":"04141234567"}') like 'Cuéntenos%')::int;
select 'envía todo (debe 1): ' || (public.enviar_solicitud_paciente('res-0123456789-0123456789-0123456789-uno', jsonb_build_object(
  'cedula','V-24680135','nombres','Gilberto','apellidos','Gómez','fecha_nacimiento','1991-02-03','telefono','04141234567',
  'motivo','Me duele la espalda desde hace un mes','estado_civil','casado','lateralidad','zurdo','nivel_educativo','inventado',
  'tipo','empresa','empresa','Givaldo','fecha_ingreso','2020-05-01',
  'antecedentes', jsonb_build_array(jsonb_build_object('id','5f000000-0000-0000-0000-0000000214a1','detalle','desde 2019'),
                                    jsonb_build_object('id','5f000000-0000-0000-0000-0000000214a4','detalle','no va'),
                                    jsonb_build_object('id','99999999-0000-0000-0000-000000000000','detalle','inventado'), 'texto suelto'),
  'habitos', jsonb_build_array(jsonb_build_object('clave','tabaco214','valor','Sí: 5 al día'), jsonb_build_object('clave','nada','valor','x')))) = 'ok')::int;
reset role;
select 'guarda solo lo del catálogo, con el formato de la consulta (debe 1): ' || count(*) from public.solicitudes_paciente
 where id = '5f000000-0000-0000-0000-000000000214' and datos->>'estado_civil' = 'casado' and datos->>'lateralidad' = 'zurdo'
   and not datos ? 'nivel_educativo' and datos->>'fecha_ingreso' = '2020-05-01' and datos->>'motivo' like 'Me duele%'
   and jsonb_array_length(datos->'antecedentes') = 1 and datos->'antecedentes'->0->>'observacion' = 'desde 2019' and datos->'antecedentes'->0->>'grupo' = 'personal'
   and datos->'habitos' = '[{"clave":"tabaco214","nombre":"Tabaco prueba 214","valor":"Sí: 5 al día"}]';

-- Subida: sin aceptar todavía no se puede
set role anon;
select 'sin aceptar: puede = false, por confirmar (debe 1): ' || count(*) from (select public.resultados_registro_paciente('res-0123456789-0123456789-0123456789-uno') j) x
 where not (j->>'puede')::boolean and j->>'motivo' = 'por_confirmar';
select 'sin aceptar no reserva (debe 1): ' || (public.reservar_resultado_paciente('res-0123456789-0123456789-0123456789-uno','application/pdf') ? 'error')::int;

-- Aceptada (ya tiene ficha): reserva, sube y confirma
reset role;
update public.solicitudes_paciente set resultado = 'aceptada', revisado_en = now(), trabajador_id = '30000000-0000-0000-0000-00000000000a' where id = '5f000000-0000-0000-0000-000000000214';
set role anon;
select 'tipo raro no se reserva (debe 1): ' || (public.reservar_resultado_paciente('res-0123456789-0123456789-0123456789-uno','text/html') ? 'error')::int;
select set_config('prueba.ruta', public.reservar_resultado_paciente('res-0123456789-0123456789-0123456789-uno','application/pdf')->>'ruta', false) \g /dev/null
select 'la ruta va en la carpeta del trabajador (debe 1): ' || (current_setting('prueba.ruta') like '10000000-0000-0000-0000-000000000001/30000000-0000-0000-0000-00000000000a/paciente-%.pdf')::int;
select 'Storage acepta la ruta reservada (debe 1): ' || public.subida_paciente_permitida(current_setting('prueba.ruta'))::int;
select 'Storage rechaza otra ruta (debe 0): ' || public.subida_paciente_permitida('10000000-0000-0000-0000-000000000001/30000000-0000-0000-0000-00000000000a/otro.pdf')::int;
select 'antes de subir no confirma (debe 1): ' || (public.confirmar_resultado_paciente('res-0123456789-0123456789-0123456789-uno', current_setting('prueba.ruta'), 'Hematología') like 'El archivo no llegó%')::int;
reset role;
-- Lo que guardaría Storage: un HTML disfrazado de PDF no entra
insert into storage.objects (bucket_id,name,metadata) values ('adjuntos', current_setting('prueba.ruta'), '{"mimetype":"text/html","size":"900"}');
set role anon;
select 'HTML disfrazado no entra (debe 1): ' || (public.confirmar_resultado_paciente('res-0123456789-0123456789-0123456789-uno', current_setting('prueba.ruta'), 'x') like 'Solo PDF%')::int;
reset role;
update storage.objects set metadata = '{"mimetype":"application/pdf","size":"52000"}' where name = current_setting('prueba.ruta');
delete from public.notificaciones where titulo = 'Resultados enviados por el paciente';
set role anon;
select 'confirma el PDF real (debe 1): ' || (public.confirmar_resultado_paciente('res-0123456789-0123456789-0123456789-uno', current_setting('prueba.ruta'), 'Hematología') = 'ok')::int;
select 'ya subida, Storage no acepta otra vez esa ruta (debe 0): ' || public.subida_paciente_permitida(current_setting('prueba.ruta'))::int;
select 'el paciente ve el nombre de lo que envió (debe 1): ' || count(*) from (select public.resultados_registro_paciente('res-0123456789-0123456789-0123456789-uno') j) x
 where (j->>'puede')::boolean and j->'archivos'->0->>'nombre' = 'Hematología';
reset role;
select 'entra a la historia del trabajador (debe 1): ' || count(*) from clinico.adjuntos where ruta = current_setting('prueba.ruta')
 and trabajador_id = '30000000-0000-0000-0000-00000000000a' and descripcion like 'Enviado por el paciente%';
select 'avisa a los médicos que ven la empresa, no a RR. HH. (debe 4): ' || count(*) from public.notificaciones where titulo = 'Resultados enviados por el paciente';
select 'RR. HH. no recibe el aviso (debe 0): ' || count(*) from public.notificaciones where titulo = 'Resultados enviados por el paciente' and usuario_id = '00000000-0000-0000-0000-0000000000a3';

-- Seguridad
select 'un anónimo no lee las reservas (debe 0): ' || has_table_privilege('anon','public.subidas_paciente','select')::int;
select 'un anónimo no lee los adjuntos (debe 0): ' || has_table_privilege('anon','public.adjuntos','select')::int;
select 'el anónimo no tiene política para leer ni borrar en Storage (debe 0): ' || count(*) from pg_policies
 where schemaname = 'storage' and tablename = 'objects' and 'anon' = any (roles) and cmd <> 'INSERT';
set role anon;
select 'token inventado no ve nada (debe 1): ' || (public.resultados_registro_paciente('res-0123456789-0123456789-0123456789-xxx') is null)::int;
select 'token inventado no reserva (debe 1): ' || (public.reservar_resultado_paciente('res-0123456789-0123456789-0123456789-xxx','application/pdf') ? 'error')::int;
reset role;
update public.solicitudes_paciente set recibido_en = now() - interval '31 days' where id = '5f000000-0000-0000-0000-000000000214';
set role anon;
select 'pasados 30 días no reserva (debe 1): ' || (public.reservar_resultado_paciente('res-0123456789-0123456789-0123456789-uno','image/jpeg') ? 'error')::int;
select 'pasados 30 días dice vencido (debe 1): ' || (public.resultados_registro_paciente('res-0123456789-0123456789-0123456789-uno')->>'motivo' = 'vencido')::int;

-- Limpieza
reset role;
delete from clinico.adjuntos where ruta = current_setting('prueba.ruta');
delete from storage.objects where name = current_setting('prueba.ruta');
delete from public.notificaciones where titulo in ('Resultados enviados por el paciente', 'Paciente envió sus datos');
delete from public.solicitudes_paciente where id = '5f000000-0000-0000-0000-000000000214';
delete from public.lista_items where id in ('5f000000-0000-0000-0000-0000000214a1','5f000000-0000-0000-0000-0000000214a2','5f000000-0000-0000-0000-0000000214a3','5f000000-0000-0000-0000-0000000214a4');
