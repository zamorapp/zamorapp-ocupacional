-- Tasas de la morbilidad de enfermería: apagadas no se calculan; encendidas dan población, tasa, prevalencia e incidencia.
\pset tuples_only on
reset role;
select set_config('request.jwt.claim.sub','',false) \g /dev/null
-- Población esperada de la empresa A (misma regla que vigilancia: efectivos, activos/reposo o egresados en el período)
create temp table esperado_229 as
select count(*)::int as n
from public.trabajadores t
left join public.organizaciones o on o.id = t.org_id
left join public.lista_items tp on tp.id = t.tipo_paciente_id
where t.empresa_id = '20000000-0000-0000-0000-00000000000a'
  and (coalesce(o.ajustes ->> 'vigilancia_poblacion', 'efectivos') = 'todos'
       or coalesce(tp.grupo = 'efectivo', t.tipo_paciente_id is null and t.estado <> 'aspirante'))
  and (t.estado in ('activo', 'reposo') or (t.estado = 'egresado' and coalesce(t.fecha_egreso, '2026-03-31') >= '2026-03-01'));
grant select on esperado_229 to authenticated;
select 'hay población en A para la prueba (debe 1): ' || (n > 0)::int from esperado_229;

set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a5',false) \g /dev/null
-- Cefalea: una antes del período (no es caso nuevo en marzo); tensión: solo en marzo (caso nuevo)
insert into public.atenciones_enfermeria (id,org_id,empresa_id,trabajador_id,fecha,tipo,motivo,cie10) values
 ('22900000-0000-0000-0000-0000000000a1','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a','30000000-0000-0000-0000-00000000000a','2026-02-10','tratamiento','Cefalea','R51'),
 ('22900000-0000-0000-0000-0000000000a2','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a','30000000-0000-0000-0000-00000000000a','2026-03-02','tratamiento','Cefalea','R51'),
 ('22900000-0000-0000-0000-0000000000a3','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a','30000000-0000-0000-0000-00000000000a','2026-03-03','signos','Control de tensión arterial','I10'),
 ('22900000-0000-0000-0000-0000000000a4','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a','30000000-0000-0000-0000-00000000000a','2026-03-04','signos','Control de tensión arterial','I10');

-- Apagadas (sin la opción): no hay población ni tasas
select 'apagadas: sin población (debe 0): ' || count(*) from jsonb_array_elements(public.reporte_enfermeria('morbilidad', '20000000-0000-0000-0000-00000000000a', '2026-03-01', '2026-03-31')) x
 where x ->> 'poblacion' is not null or x ->> 'tasa_morbilidad' is not null or x ->> 'incidencia' is not null;
select 'apagadas: los conteos siguen (debe 2): ' || (x ->> 'casos') from jsonb_array_elements(public.reporte_enfermeria('morbilidad', '20000000-0000-0000-0000-00000000000a', '2026-03-01', '2026-03-31')) x where x ->> 'cie10' = 'I10';

-- Encendidas
select 'encendidas: población igual a la del informe de vigilancia (debe 1): ' || ((x ->> 'poblacion')::int = (select n from esperado_229))::int
  from jsonb_array_elements(public.reporte_enfermeria('morbilidad', '20000000-0000-0000-0000-00000000000a', '2026-03-01', '2026-03-31', '{"tasas": true}')) x where x ->> 'cie10' = 'I10';
select 'tasa de morbilidad = casos × 100 / población (debe 1): ' || ((x ->> 'tasa_morbilidad')::numeric = round(2 * 100.0 / (select n from esperado_229), 1))::int
  from jsonb_array_elements(public.reporte_enfermeria('morbilidad', '20000000-0000-0000-0000-00000000000a', '2026-03-01', '2026-03-31', '{"tasas": true}')) x where x ->> 'cie10' = 'I10';
select 'prevalencia = pacientes × 100 / población (debe 1): ' || ((x ->> 'prevalencia')::numeric = round(100.0 / (select n from esperado_229), 1))::int
  from jsonb_array_elements(public.reporte_enfermeria('morbilidad', '20000000-0000-0000-0000-00000000000a', '2026-03-01', '2026-03-31', '{"tasas": true}')) x where x ->> 'cie10' = 'I10';
select 'tensión: caso nuevo en marzo (debe 1): ' || (x ->> 'nuevos')
  from jsonb_array_elements(public.reporte_enfermeria('morbilidad', '20000000-0000-0000-0000-00000000000a', '2026-03-01', '2026-03-31', '{"tasas": true}')) x where x ->> 'cie10' = 'I10';
select 'cefalea: ya venía de febrero, no es nuevo (debe 0): ' || (x ->> 'nuevos')
  from jsonb_array_elements(public.reporte_enfermeria('morbilidad', '20000000-0000-0000-0000-00000000000a', '2026-03-01', '2026-03-31', '{"tasas": true}')) x where x ->> 'cie10' = 'R51';
select 'cefalea: incidencia 0 (debe 0): ' || (x ->> 'incidencia')::numeric::int
  from jsonb_array_elements(public.reporte_enfermeria('morbilidad', '20000000-0000-0000-0000-00000000000a', '2026-03-01', '2026-03-31', '{"tasas": true}')) x where x ->> 'cie10' = 'R51';

-- La decisión: la enfermera no la cambia; el administrador sí, y solo esa clave
do $$ begin
  perform public.guardar_decision_enfermeria('10000000-0000-0000-0000-000000000001', 'enfermeria_tasas', true);
  raise notice 'FALLA: la enfermera activó las tasas';
exception when others then raise notice 'la enfermera no activa las tasas (debe 1): 1';
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false) \g /dev/null
select public.guardar_decision_enfermeria('10000000-0000-0000-0000-000000000001', 'enfermeria_tasas', true) \g /dev/null
reset role;
select 'el administrador activa las tasas (debe 1): ' || ((ajustes ->> 'enfermeria_tasas')::boolean)::int from public.organizaciones where id = '10000000-0000-0000-0000-000000000001';
update public.organizaciones set ajustes = ajustes - 'enfermeria_tasas' where id = '10000000-0000-0000-0000-000000000001';
delete from clinico.atenciones_enfermeria where id::text like '22900000-%';
drop table esperado_229;
