-- Vigilancia como el SAME: población efectiva (configurable), permisos aparte, reubicaciones por resultado
-- y especialidad de la consulta externa. Datos propios en julio de 2025 (empresa B), borrados al final.
\pset tuples_only on
reset role;
select set_config('request.jwt.claim.sub','',false) \g /dev/null
insert into public.trabajadores (id,org_id,empresa_id,cedula,nombres,apellidos,sexo,tipo_paciente_id,estado) values
 ('30000000-0000-0000-0000-000000001281','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000b','V-128001','Aspirante','Prueba','F',
  (select id from public.lista_items where lista='tipo_paciente' and codigo='ASP' and org_id='10000000-0000-0000-0000-000000000001'),'activo'),
 ('30000000-0000-0000-0000-000000001282','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000b','V-128002','Obrero','Prueba','M',
  (select id from public.lista_items where lista='tipo_paciente' and codigo='OBR' and org_id='10000000-0000-0000-0000-000000000001'),'activo');
insert into clinico.consultas (id,org_id,empresa_id,trabajador_id,estado,fecha,tipo,reubicacion,especialidad) values
 ('40000000-0000-0000-0000-000000001281','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000b','30000000-0000-0000-0000-000000001281','cerrada','2025-07-10','primera',null,null),
 ('40000000-0000-0000-0000-000000001282','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000b','30000000-0000-0000-0000-000000001282','cerrada','2025-07-11','primera',
  '{"tipo":"temporal","resultado":"efectiva"}','Cardiología'),
 ('40000000-0000-0000-0000-000000001283','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000b','30000000-0000-0000-0000-000000001282','borrador','2025-07-12','primera',null,null);
insert into clinico.reposos (org_id,trabajador_id,causa,desde,hasta) values
 ('10000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000001282','paternidad','2025-07-01','2025-07-14'),
 ('10000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000001282','enfermedad_comun','2025-07-20','2025-07-22');

set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false) \g /dev/null
select 'tipos efectivos marcados como el SAME (debe 5): ' || jsonb_array_length(r -> 'criterio' -> 'tipos') from public.reporte_vigilancia('20000000-0000-0000-0000-00000000000b','2025-07-01','2025-07-31') r;
select 'por defecto cuenta solo efectivos (debe 1): ' || (r -> 'criterio' ->> 'solo_efectivos')::boolean::int from public.reporte_vigilancia('20000000-0000-0000-0000-00000000000b','2025-07-01','2025-07-31') r;
select 'consultas de efectivos, sin el aspirante (debe 2): ' || (r -> 'consultas' ->> 'total') from public.reporte_vigilancia('20000000-0000-0000-0000-00000000000b','2025-07-01','2025-07-31') r;
select 'por motivo cuenta también al aspirante (debe 3): ' || (select sum((x ->> 'n')::int) from jsonb_array_elements(r -> 'consultas' -> 'por_motivo') x) from public.reporte_vigilancia('20000000-0000-0000-0000-00000000000b','2025-07-01','2025-07-31') r;
select 'series del mes igual al total (debe 2): ' || (s -> 'por_mes' -> 0 ->> 'consultas') from public.vigilancia_series('20000000-0000-0000-0000-00000000000b','2025-07-01','2025-07-31') s;
select 'permiso de paternidad fuera del ausentismo (debe 3): ' || (r -> 'ausentismo' ->> 'dias_computables') from public.reporte_vigilancia('20000000-0000-0000-0000-00000000000b','2025-07-01','2025-07-31') r;
select 'permiso en su cuadro, 14 días (debe 14): ' || (r -> 'ausentismo' -> 'permisos' -> 0 ->> 'dias') from public.reporte_vigilancia('20000000-0000-0000-0000-00000000000b','2025-07-01','2025-07-31') r;
select 'reposos sin el permiso (debe 1): ' || (r -> 'ausentismo' ->> 'reposos') from public.reporte_vigilancia('20000000-0000-0000-0000-00000000000b','2025-07-01','2025-07-31') r;
select 'días de reposo del mes sin el permiso (debe 3): ' || (s -> 'por_mes' -> 0 ->> 'dias_reposo') from public.vigilancia_series('20000000-0000-0000-0000-00000000000b','2025-07-01','2025-07-31') s;
select 'reubicación efectiva (debe 1): ' || count(*) from public.reporte_vigilancia('20000000-0000-0000-0000-00000000000b','2025-07-01','2025-07-31') r, jsonb_array_elements(r -> 'reubicaciones' -> 'por_resultado') x where x ->> 'nombre' = 'efectiva' and (x ->> 'n')::int = 1;
select 'especialidad de consulta externa (debe 1): ' || count(*) from public.reporte_vigilancia('20000000-0000-0000-0000-00000000000b','2025-07-01','2025-07-31') r, jsonb_array_elements(r -> 'especialidades_externas') x where x ->> 'nombre' = 'Cardiología';
select public.guardar_consulta('40000000-0000-0000-0000-000000001283', '{"tipo":"primera","especialidad":" Dermatología "}', '[]', null, null, false) \g /dev/null
select 'guardar_consulta guarda la especialidad (debe 1): ' || count(*) from public.consultas where id='40000000-0000-0000-0000-000000001283' and especialidad='Dermatología';

-- Configuración › Organización › Vigilancia: contar a todos los pacientes
reset role;
update public.organizaciones set ajustes = ajustes || '{"vigilancia_poblacion":"todos"}' where id='10000000-0000-0000-0000-000000000001';
set role authenticated;
select 'con «todos» cuenta al aspirante (debe 3): ' || (r -> 'consultas' ->> 'total') from public.reporte_vigilancia('20000000-0000-0000-0000-00000000000b','2025-07-01','2025-07-31') r;
select 'con «todos» la serie también (debe 3): ' || (s -> 'por_mes' -> 0 ->> 'consultas') from public.vigilancia_series('20000000-0000-0000-0000-00000000000b','2025-07-01','2025-07-31') s;
reset role;
select 'anon no ejecuta reporte_vigilancia (debe 0): ' || has_function_privilege('anon','public.reporte_vigilancia(uuid,date,date)','execute')::int;
select 'la función no lee t.* de trabajadores (debe 0): ' || (position('t.*' in pg_get_functiondef('public.reporte_vigilancia(uuid, date, date)'::regprocedure)) > 0)::int;

-- Limpieza: no altera las demás pruebas
update public.organizaciones set ajustes = ajustes - 'vigilancia_poblacion' where id='10000000-0000-0000-0000-000000000001';
delete from clinico.reposos where trabajador_id in ('30000000-0000-0000-0000-000000001281','30000000-0000-0000-0000-000000001282');
delete from clinico.consultas where trabajador_id in ('30000000-0000-0000-0000-000000001281','30000000-0000-0000-0000-000000001282');
delete from public.trabajadores where id in ('30000000-0000-0000-0000-000000001281','30000000-0000-0000-0000-000000001282');
