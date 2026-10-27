-- Reportes, segunda parte: producción por médico, declaración obligatoria, limitaciones vigentes,
-- exámenes pendientes y padrón completo. RR. HH. no ve diagnósticos.
\pset tuples_only on
reset role;
select set_config('request.jwt.claim.sub','',false) \g /dev/null
insert into clinico.consultas (id,org_id,empresa_id,trabajador_id,estado,fecha,tipo,paraclinicos) values
 ('49000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a','30000000-0000-0000-0000-00000000000a','cerrada','2026-05-10','sucesiva',
  '[{"id":"1","nombre":"Heces","grupo":"Laboratorio","resultado":""},{"id":"2","nombre":"Orina","grupo":"Laboratorio","resultado":"Normal"}]');
insert into clinico.diagnosticos (org_id,consulta_id,cie10,descripcion,origen) values
 ('10000000-0000-0000-0000-000000000001','49000000-0000-0000-0000-000000000001','A09.0','Gastroenteritis infecciosa','comun'),
 ('10000000-0000-0000-0000-000000000001','49000000-0000-0000-0000-000000000001','H83.3','Hipoacusia por ruido','ocupacional'),
 ('10000000-0000-0000-0000-000000000001','49000000-0000-0000-0000-000000000001','J06.9','Rinofaringitis','comun');

update clinico.consultas set potencial_discapacidad = true, discapacidad_nota = 'Hipoacusia bilateral progresiva' where id = '49000000-0000-0000-0000-000000000001';

set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false) \g /dev/null
select 'discapacidad: marcado por el médico con su nota (debe 1): ' || count(*) from jsonb_array_elements(public.reporte_listado('discapacidad',null,'2026-05-01','2026-05-31')) x where x ->> 'criterios' like '%Marcado por el médico%' and x ->> 'nota_medico' = 'Hipoacusia bilateral progresiva';
select 'declaración: EDO y ocupacional, no la rinofaringitis (debe 2): ' || jsonb_array_length(public.reporte_listado('declaracion',null,'2026-05-01','2026-05-31'));
select 'declaración: A09 es EDO semanal (debe 1): ' || count(*) from jsonb_array_elements(public.reporte_listado('declaracion',null,'2026-05-01','2026-05-31')) x where x ->> 'cie10' = 'A09.0' and x ->> 'notificacion' = 'EDO semanal (MPPS)';
select 'declaración: hipoacusia va al INPSASEL (debe 1): ' || count(*) from jsonb_array_elements(public.reporte_listado('declaracion',null,'2026-05-01','2026-05-31')) x where x ->> 'notificacion' like '%INPSASEL%';
select 'por médico: una fila sin médico con la consulta de mayo (debe 1): ' || (public.reporte_listado('medicos',null,'2026-05-01','2026-05-31') -> 0 ->> 'consultas');
select 'por médico: sucesivas (debe 1): ' || (public.reporte_listado('medicos',null,'2026-05-01','2026-05-31') -> 0 ->> 'sucesiva');
select 'exámenes pendientes de resultado (debe 1): ' || count(*) from jsonb_array_elements(public.reporte_listado('examenes',null,'2026-05-01','2026-05-31')) x where x ->> 'estado_resultado' = 'Pendiente';
select 'limitaciones vigentes sin importar el período (debe 1): ' || jsonb_array_length(public.reporte_listado('limitaciones',null,'2030-01-01','2030-01-31','{"vigentes":true}'));
select 'padrón trae la ficha completa (debe 1): ' || (count(*) > 0)::int from jsonb_array_elements(public.reporte_listado('pacientes',null,'2026-05-01','2026-05-31')) x where x ? 'fecha_nacimiento' and x ? 'telefono';

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a3',false) \g /dev/null
select 'RR. HH. de A no ve la declaración obligatoria (debe 0): ' || jsonb_array_length(public.reporte_listado('declaracion',null,'2026-05-01','2026-05-31'));
select 'RR. HH. de A no ve la nota del médico (debe 0): ' || count(*) from jsonb_array_elements(public.reporte_listado('discapacidad',null,'2026-05-01','2026-05-31')) x where x ->> 'nota_medico' is not null;
select 'RR. HH. de A no ve limitaciones (debe 0): ' || jsonb_array_length(public.reporte_listado('limitaciones',null,'2030-01-01','2030-01-31','{"vigentes":true}'));
reset role;
