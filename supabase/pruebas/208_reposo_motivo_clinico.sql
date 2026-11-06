-- Motivo clínico del reposo (Cesar, 05-nov): se guarda con el reposo, un guardado sin la clave (bandeja vieja o
-- celular) no lo borra, vacío vuelve a null (la hoja imprime la propuesta) y nunca pasa de 600 caracteres.
\pset tuples_only on
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false) \g /dev/null
insert into clinico.consultas (id,org_id,empresa_id,trabajador_id,estado,fecha) values
 ('20800000-0000-0000-0000-0000000000c1','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a','30000000-0000-0000-0000-00000000000a','borrador',public.hoy_caracas());
select public.guardar_consulta('20800000-0000-0000-0000-0000000000c1', format('{"tipo":"primera","fecha":"%s"}', public.hoy_caracas())::jsonb,
 '[{"cie10":"M54.5","descripcion":"Lumbago","origen":"comun","principal":true}]', null,
 '{"causa":"enfermedad_comun","ente":"servicio_medico","desde":"2026-10-01","hasta":"2026-10-03","motivo_clinico":"  Dolor lumbar   con limitación funcional  "}', false) \g /dev/null
select 'el motivo se guarda sin espacios de sobra (debe 1): ' || count(*) from public.reposos
 where consulta_id = '20800000-0000-0000-0000-0000000000c1' and motivo_clinico = 'Dolor lumbar con limitación funcional';
-- Guardado viejo, sin la clave: cambia las fechas y conserva el motivo
select public.guardar_consulta('20800000-0000-0000-0000-0000000000c1', format('{"tipo":"primera","fecha":"%s"}', public.hoy_caracas())::jsonb,
 '[{"cie10":"M54.5","descripcion":"Lumbago","origen":"comun","principal":true}]', null,
 '{"causa":"enfermedad_comun","ente":"servicio_medico","desde":"2026-10-01","hasta":"2026-10-05"}', false) \g /dev/null
select 'un guardado sin la clave no borra el motivo (debe 1): ' || count(*) from public.reposos
 where consulta_id = '20800000-0000-0000-0000-0000000000c1' and hasta = '2026-10-05' and motivo_clinico = 'Dolor lumbar con limitación funcional';
-- Texto larguísimo: se guarda recortado (el editor ya no deja pasar de 160)
select public.guardar_consulta('20800000-0000-0000-0000-0000000000c1', format('{"tipo":"primera","fecha":"%s"}', public.hoy_caracas())::jsonb,
 '[{"cie10":"M54.5","descripcion":"Lumbago","origen":"comun","principal":true}]', null,
 jsonb_build_object('causa','enfermedad_comun','ente','servicio_medico','desde','2026-10-01','hasta','2026-10-05','motivo_clinico', repeat('dolor ', 300)), false) \g /dev/null
select 'un motivo larguísimo queda en 600 caracteres (debe 1): ' || count(*) from public.reposos
 where consulta_id = '20800000-0000-0000-0000-0000000000c1' and char_length(motivo_clinico) = 600;
-- Vacío: vuelve a null (la hoja imprime la propuesta armada con el motivo y el examen)
select public.guardar_consulta('20800000-0000-0000-0000-0000000000c1', format('{"tipo":"primera","fecha":"%s"}', public.hoy_caracas())::jsonb,
 '[{"cie10":"M54.5","descripcion":"Lumbago","origen":"comun","principal":true}]', null,
 '{"causa":"enfermedad_comun","ente":"servicio_medico","desde":"2026-10-01","hasta":"2026-10-05","motivo_clinico":"   "}', false) \g /dev/null
select 'vacío vuelve a null (debe 1): ' || count(*) from public.reposos
 where consulta_id = '20800000-0000-0000-0000-0000000000c1' and motivo_clinico is null;
reset role;
delete from clinico.reposos where consulta_id = '20800000-0000-0000-0000-0000000000c1';
delete from clinico.diagnosticos where consulta_id = '20800000-0000-0000-0000-0000000000c1';
delete from clinico.consultas where id = '20800000-0000-0000-0000-0000000000c1';
select set_config('request.jwt.claim.sub', '', false) \g /dev/null
