-- Reportes del SAME (reporte_listado): cada quien ve solo sus empresas; datos clínicos solo personal de salud.
\pset tuples_only on
reset role;
select set_config('request.jwt.claim.sub','',false) \g /dev/null
-- Consulta cerrada en A con diagnóstico, aptitud con restricciones y examen
insert into clinico.consultas (id,org_id,empresa_id,trabajador_id,estado,fecha,paraclinicos) values
 ('48000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a','30000000-0000-0000-0000-00000000000a','cerrada','2026-03-12','[{"id":"1","nombre":"Hematología","grupo":"Laboratorio","resultado":"Normal"}]');
insert into clinico.diagnosticos (org_id,consulta_id,cie10,descripcion,origen) values
 ('10000000-0000-0000-0000-000000000001','48000000-0000-0000-0000-000000000001','M54.5','Lumbago','comun');
insert into clinico.aptitudes (org_id,consulta_id,trabajador_id,clasificacion,restricciones) values
 ('10000000-0000-0000-0000-000000000001','48000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-00000000000a','elegible_con_restricciones','{"No levantar más de 10 kg"}');

set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false) \g /dev/null
select 'admin atendidos de B sin borradores (debe 2): ' || jsonb_array_length(public.reporte_listado('atendidos','20000000-0000-0000-0000-00000000000b','2024-01-01','2026-03-31'));
select 'admin atendidos todas (debe 3): ' || jsonb_array_length(public.reporte_listado('atendidos',null,'2024-01-01','2026-03-31'));
select 'admin ve el diagnóstico en atendidos de B (debe 1): ' || count(*) from jsonb_array_elements(public.reporte_listado('atendidos','20000000-0000-0000-0000-00000000000b','2026-03-01','2026-03-31')) x where x ->> 'diagnosticos' like 'M54.5%';
select 'morbilidad: M54.5 en dos empresas (debe 2): ' || (x ->> 'casos') from jsonb_array_elements(public.reporte_listado('morbilidad',null,'2026-03-01','2026-03-31')) x where x ->> 'cie10' = 'M54.5';
select 'morbilidad: de origen ocupacional (debe 1): ' || (x ->> 'ocupacional') from jsonb_array_elements(public.reporte_listado('morbilidad',null,'2026-03-01','2026-03-31')) x where x ->> 'cie10' = 'M54.5';
select 'morbilidad por empresa: M54.5 en dos filas (debe 2): ' || count(*) from jsonb_array_elements(public.reporte_listado('morbilidad',null,'2026-03-01','2026-03-31','{"agrupar":"empresa"}')) x where x ->> 'cie10' = 'M54.5';
select 'morbilidad: atendidos de la empresa B (debe 1): ' || (x ->> 'atendidos') from jsonb_array_elements(public.reporte_listado('morbilidad',null,'2026-03-01','2026-03-31','{"agrupar":"empresa"}')) x where x ->> 'grupo' = 'B';
select 'reposos que vienen de antes, incluidos (debe 1): ' || jsonb_array_length(public.reporte_listado('reposos',null,'2026-04-01','2026-04-30'));
select 'reposos solo iniciados en abril (debe 0): ' || jsonb_array_length(public.reporte_listado('reposos',null,'2026-04-01','2026-04-30','{"solo_iniciados":true}'));
select 'padrón: B bajo vigilancia ocupacional (debe 1): ' || count(*) from jsonb_array_elements(public.reporte_listado('pacientes','20000000-0000-0000-0000-00000000000b','2026-03-01','2026-03-31')) x where x ->> 'vigilancia' = 'Origen ocupacional';
select 'diagnósticos de marzo (debe 2): ' || jsonb_array_length(public.reporte_listado('diagnosticos',null,'2026-03-01','2026-03-31'));
select 'limitaciones de marzo (debe 1): ' || jsonb_array_length(public.reporte_listado('limitaciones',null,'2026-03-01','2026-03-31'));
select 'aptitud sin el borrador (debe 2): ' || jsonb_array_length(public.reporte_listado('aptitud',null,'2024-01-01','2026-03-31'));
select 'reposo con días dentro de feb-abr (debe 12): ' || (public.reporte_listado('reposos','20000000-0000-0000-0000-00000000000b','2026-02-01','2026-04-30') -> 0 ->> 'dias_periodo');
select 'interconsultas (debe 1): ' || jsonb_array_length(public.reporte_listado('interconsultas',null,'2026-03-01','2026-03-31'));
select 'exámenes aplicados (debe 1): ' || jsonb_array_length(public.reporte_listado('examenes',null,'2026-03-01','2026-03-31'));
select 'estadística: consultas de marzo (debe 2): ' || sum((x ->> 'consultas')::int) from jsonb_array_elements(public.reporte_listado('estadistica',null,'2026-03-01','2026-03-31')) x;
select 'potencial discapacidad (debe 2): ' || jsonb_array_length(public.reporte_listado('discapacidad',null,'2026-03-01','2026-03-31'));
select 'umbral de 10 días marca el reposo (debe 1): ' || count(*) from jsonb_array_elements(public.reporte_listado('discapacidad',null,'2026-03-01','2026-04-30','{"umbral_dias":10}')) x where x ->> 'criterios' like '%días de reposo%';
select 'padrón de pacientes (debe 3): ' || jsonb_array_length(public.reporte_listado('pacientes',null,'2026-03-01','2026-03-31'));
do $$ begin perform public.reporte_listado('inventado',null,'2026-03-01','2026-03-31'); raise notice 'reporte desconocido: FALLA'; exception when others then raise notice 'reporte desconocido rechazado (ok)'; end $$;

-- Médico limitado a la empresa A: nada de B
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false) \g /dev/null
select 'Medico-A atendidos todas = solo A (debe 1): ' || jsonb_array_length(public.reporte_listado('atendidos',null,'2024-01-01','2026-03-31'));
select 'Medico-A pide B directamente (debe 0): ' || jsonb_array_length(public.reporte_listado('atendidos','20000000-0000-0000-0000-00000000000b','2024-01-01','2026-03-31'));
select 'Medico-A reposos de B (debe 0): ' || jsonb_array_length(public.reporte_listado('reposos',null,'2026-03-01','2026-03-31'));
select 'Medico-A morbilidad solo A (debe 1): ' || (x ->> 'casos') from jsonb_array_elements(public.reporte_listado('morbilidad',null,'2026-03-01','2026-03-31')) x where x ->> 'cie10' = 'M54.5';

-- RR. HH. de A (no clínico): sin consultas ni diagnósticos; el padrón solo de A
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a3',false) \g /dev/null
select 'RRHH-A atendidos (debe 0): ' || jsonb_array_length(public.reporte_listado('atendidos',null,'2024-01-01','2026-03-31'));
select 'RRHH-A morbilidad (debe 0): ' || jsonb_array_length(public.reporte_listado('morbilidad',null,'2024-01-01','2026-03-31'));
select 'RRHH-A diagnósticos (debe 0): ' || jsonb_array_length(public.reporte_listado('diagnosticos',null,'2024-01-01','2026-03-31'));
select 'RRHH-A padrón solo A (debe 2): ' || jsonb_array_length(public.reporte_listado('pacientes',null,'2024-01-01','2026-03-31'));
reset role;
