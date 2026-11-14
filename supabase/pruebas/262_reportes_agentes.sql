-- Reportes por la puerta para agentes (20261030964000): «ver_reporte» de puerta_vigilancia. Listas sin columnas
-- clínicas, cifras de gestión, reportes clínicos solo en totales con supresión, y los de salud de personas nunca.
\pset tuples_only on
reset role;
select set_config('request.jwt.claim.sub','',false) \g /dev/null
-- Empresa A: cuatro trabajadores atendidos en junio de 2024, con diagnóstico (que nunca debe salir)
insert into public.trabajadores (id,org_id,empresa_id,cedula,nombres,apellidos,sexo,creado_en)
select ('26200000-0000-0000-0000-00000000010' || i)::uuid,'10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a',
       'V-6620000' || i,'Reporte' || i,'Prueba',(case when i <= 2 then 'M' else 'F' end)::sexo,'2020-01-01'
from generate_series(1,4) i;
insert into clinico.consultas (id,org_id,empresa_id,trabajador_id,estado,fecha)
select ('26200000-0000-0000-0000-00000000020' || i)::uuid,'10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a',
       ('26200000-0000-0000-0000-00000000010' || i)::uuid,'cerrada','2024-06-10'
from generate_series(1,4) i;
insert into clinico.diagnosticos (org_id,consulta_id,cie10,descripcion)
select '10000000-0000-0000-0000-000000000001',('26200000-0000-0000-0000-00000000020' || i)::uuid,'K29.7','Gastritis rara' from generate_series(1,4) i;

-- Llave con la casilla
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false) \g /dev/null
select public.crear_llave_agente('10000000-0000-0000-0000-000000000001', 'Reportes', 'consultar', 30) as l \gset
select (:'l'::jsonb) ->> 'llave' as kr, (:'l'::jsonb) ->> 'id' as krid \gset
select 'sin la casilla no hay reportes (debe 1): ' || (public.puerta_vigilancia(:'kr', 'ver_reporte', '{"reporte":"atendidos","empresa_id":"20000000-0000-0000-0000-00000000000a","desde":"2024-06-01","hasta":"2024-06-30"}') ->> 'error' like '%casilla%')::int;
select public.agentes_llave_vigilancia('10000000-0000-0000-0000-000000000001', :'krid', true) \g /dev/null
reset role;

set role anon;
select set_config('request.jwt.claim.sub','',false) \g /dev/null
select public.puerta_vigilancia(:'kr', 'ver_reporte', '{"reporte":"atendidos","empresa_id":"20000000-0000-0000-0000-00000000000a","desde":"2024-06-01","hasta":"2024-06-30"}') as a \gset
select public.puerta_vigilancia(:'kr', 'ver_reporte', '{"reporte":"relacion","empresa_id":"20000000-0000-0000-0000-00000000000a","desde":"2024-06-01","hasta":"2024-06-30"}') as r \gset
select public.puerta_vigilancia(:'kr', 'ver_reporte', '{"reporte":"pacientes","empresa_id":"20000000-0000-0000-0000-00000000000a"}') as p \gset
select public.puerta_vigilancia(:'kr', 'ver_reporte', '{"reporte":"morbilidad","empresa_id":"20000000-0000-0000-0000-00000000000a","desde":"2024-06-01","hasta":"2024-06-30"}') as m \gset
select public.puerta_vigilancia(:'kr', 'ver_reporte', '{"reporte":"discapacidad","empresa_id":"20000000-0000-0000-0000-00000000000a","desde":"2024-06-01","hasta":"2024-06-30"}') as x \gset
select public.puerta_vigilancia(:'kr', 'ver_reporte', '{"reporte":"atendidos","empresa_id":"20000000-0000-0000-0000-0000000000ff","desde":"2024-06-01","hasta":"2024-06-30"}') as o \gset
reset role;

select 'atendidos: lista con los 4 pacientes (debe 4): ' || (select count(*) from jsonb_array_elements((:'a'::jsonb) #> '{resultado,filas}') f where f ->> 'cedula' like 'V-6620000%');
select 'atendidos: sin diagnósticos ni aptitud (debe 0): ' || ((:'a'::jsonb)::text ~* 'K29|gastritis|diagnostic|aptitud')::int;
select 'atendidos: columnas cerradas (debe 1): ' || ((:'a'::jsonb) #> '{resultado,columnas}' = '["fecha","historia","cedula","paciente","edad","sexo","empresa","dependencia","cargo","motivo","medico"]'::jsonb)::int;
select 'relación: 4 consultas y 4 pacientes (debe 1): ' || ((:'r'::jsonb) #>> '{resultado,consultas}' = '4' and (:'r'::jsonb) #>> '{resultado,pacientes}' = '4')::int;
select 'relación: sin reglas de supresión (debe 0): ' || ((:'r'::jsonb) #> '{resultado}' ? 'reglas')::int;
select 'relación: sin cédulas (debe 0): ' || ((:'r'::jsonb)::text ~ 'V-6620000')::int;
select 'padrón sin período (debe 1): ' || ((:'p'::jsonb) ->> 'ok')::boolean::int;
select 'padrón sin datos de salud (debe 0): ' || (select count(*) from jsonb_array_elements((:'p'::jsonb) #> '{resultado,filas}') f
  where f ?| array['grupo_sanguineo', 'discapacidad', 'aptitud', 'vigilancia', 'telefono', 'correo', 'direccion']);
select 'morbilidad: va a vigilancia_cifras (debe 1): ' || ((:'m'::jsonb) ->> 'error' like '%vigilancia_cifras%')::int;
select 'discapacidad: no sale (debe 1): ' || (((:'x'::jsonb) ->> 'ok') = 'false' and (:'x'::jsonb) ->> 'error' like '%no está para agentes%')::int;
select 'empresa ajena a la organización: no (debe 1): ' || (((:'o'::jsonb) ->> 'ok') = 'false')::int;

-- Todos los reportes permitidos responden
select 'cada reporte permitido responde (debe 15): ' || count(*) from unnest(array['atendidos', 'relacion', 'estadistica', 'medicos', 'citas',
  'pacientes', 'vencimientos', 'accidentalidad', 'dias-atencion', 'aptitud', 'limitaciones', 'reposos', 'interconsultas', 'examenes', 'enfermeria']) r
where (public.puerta_vigilancia(:'kr', 'ver_reporte', jsonb_build_object('reporte', r, 'empresa_id', '20000000-0000-0000-0000-00000000000a',
       'desde', '2024-01-01', 'hasta', '2024-12-31')) ->> 'ok')::boolean;
select 'los clínicos solo traen totales (debe 0): ' || count(*) from unnest(array['aptitud', 'limitaciones', 'reposos', 'interconsultas', 'examenes', 'enfermeria']) r
where (public.puerta_vigilancia(:'kr', 'ver_reporte', jsonb_build_object('reporte', r, 'empresa_id', '20000000-0000-0000-0000-00000000000a',
       'desde', '2024-01-01', 'hasta', '2024-12-31')) -> 'resultado') ?| array['cedula', 'paciente', 'filas'];

-- Los ayudantes no se llaman desde fuera
select 'ayudantes cerrados (debe 0): ' || count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname in ('agente_vig_reporte', 'agente_rep_columnas', 'agente_rep_contar', 'agente_rep_por')
   and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute'));
select 'queda en el registro (debe 1): ' || (count(*) > 0)::int from public.agentes_registro where llave_id = :'krid' and accion = 'ver_reporte' and ok;

delete from clinico.diagnosticos where consulta_id::text like '26200000-%';
delete from clinico.consultas where id::text like '26200000-%';
delete from public.trabajadores where id::text like '26200000-%';
