-- RR. HH. no lee lo clínico de los eventos por la API (20261030937000): la tabla le devuelve 0 filas; la vista
-- eventos_empresa le da los de su empresa sin diagnóstico, CIE-10, incapacidad ni discapacidad. El médico, igual que antes.
\pset tuples_only on
reset role;
select set_config('request.jwt.claim.sub','',false) \g /dev/null
insert into public.eventos (id,org_id,empresa_id,trabajador_id,tipo,fecha_hora,fecha_diagnostico,lugar,cie10,diagnostico,
                           incapacidad,discapacidad,discapacidad_pct,potencial_discapacidad,estado_certificacion,observaciones) values
 ('23600000-0000-0000-0000-0000000000e1','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a',
  '30000000-0000-0000-0000-00000000000a','enfermedad',now(),now(),'Almacén 236','M54.5','Lumbalgia mecánica',
  'parcial_permanente','parcial_permanente',12.5,true,'en trámite','nota clínica'),
 ('23600000-0000-0000-0000-0000000000e2','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000b',
  '30000000-0000-0000-0000-00000000000b','accidente',now(),null,'Patio 236',null,null,null,null,null,false,null,null);

-- 1. RR. HH. (a3, empresa A)
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a3',false) \g /dev/null
select 'RR. HH. ya no lee la tabla de eventos (debe 0): ' || count(*) from public.eventos where lugar like '%236';
select 'RR. HH. ve por la vista el evento de su empresa (debe 1): ' || count(*) from public.eventos_empresa where id='23600000-0000-0000-0000-0000000000e1';
select 'pero no el de otra empresa (debe 0): ' || count(*) from public.eventos_empresa where id='23600000-0000-0000-0000-0000000000e2';
select 'con los plazos legales (debe 1): ' || count(*) from public.eventos_empresa
 where id='23600000-0000-0000-0000-0000000000e1' and fecha_diagnostico is not null and en_anexo1;
select 'la vista no tiene ninguna columna clínica (debe 0): ' || count(*) from information_schema.columns
 where table_schema='public' and table_name='eventos_empresa'
   and column_name in ('cie10','diagnostico','incapacidad','cargos','dias_cargados','discapacidad','discapacidad_pct',
                       'potencial_discapacidad','estado_certificacion','certificacion_fecha','certificacion_numero',
                       'consulta_id','observaciones');
-- Aun pidiendo la columna por nombre, la base la niega
do $$ begin
  perform diagnostico from public.eventos_empresa;
  raise notice 'RR. HH. lee el diagnóstico por la vista: FALLA';
exception when undefined_column then null; end $$;

-- 2. Otros roles no cambian: el médico de A lee la fila completa; la vista no le da nada
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false) \g /dev/null
select 'el médico sigue leyendo el diagnóstico (debe 1): ' || count(*) from public.eventos
 where id='23600000-0000-0000-0000-0000000000e1' and cie10='M54.5' and discapacidad_pct=12.5;
select 'la vista es solo de RR. HH. (debe 0): ' || count(*) from public.eventos_empresa where lugar like '%236';
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false) \g /dev/null
select 'el administrador también (debe 2): ' || count(*) from public.eventos where lugar like '%236';

-- 3. Reportes que corren como quien llama: RR. HH. cuenta lo mismo que el médico de su empresa (Analizar, 13-nov)
reset role;
select set_config('request.jwt.claim.sub','',false) \g /dev/null
insert into public.eventos (id,org_id,empresa_id,trabajador_id,tipo,fecha_hora,lugar,incapacidad,cargos,dias_perdidos,con_tiempo_perdido) values
 ('23600000-0000-0000-0000-0000000000e3','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a',
  '30000000-0000-0000-0000-00000000000a','accidente','2031-03-10 10:00-04','Taller 236','parcial_permanente',
  '[{"concepto":"mano","dias":300,"porcentaje":50}]',20,true);
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false) \g /dev/null
select public.indices_accidentalidad('20000000-0000-0000-0000-00000000000a','2031-03-01','2031-03-31') as med_ind \gset
select public.reporte_indicadores('accidentalidad','20000000-0000-0000-0000-00000000000a','2031-03-01','2031-03-31') as med_rep \gset
select (public.inicio_conteos(null,false,false) -> 'tareas' ->> 'eventos_abiertos') as med_abiertos \gset
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a3',false) \g /dev/null
select 'índices: el médico ve 1 accidente con 130 días cargados netos (debe 1): ' ||
  ((:'med_ind'::jsonb ->> 'accidentes') = '1' and (:'med_ind'::jsonb ->> 'dias_cargados') = '130')::int;
select 'índices: RR. HH. ve los mismos accidentes, días y declaración (debe 1): ' || (
  with r as (select public.indices_accidentalidad('20000000-0000-0000-0000-00000000000a','2031-03-01','2031-03-31') v)
  select (v -> 'accidentes' = :'med_ind'::jsonb -> 'accidentes' and v -> 'con_tiempo_perdido' = :'med_ind'::jsonb -> 'con_tiempo_perdido'
      and v -> 'dias_perdidos' = :'med_ind'::jsonb -> 'dias_perdidos' and v -> 'dias_cargados' = :'med_ind'::jsonb -> 'dias_cargados'
      and v -> 'por_declarar' = :'med_ind'::jsonb -> 'por_declarar')::int from r);
select 'accidentabilidad mensual: RR. HH. ve las mismas cifras (debe 1): ' || (
  with r as (select public.reporte_indicadores('accidentalidad','20000000-0000-0000-0000-00000000000a','2031-03-01','2031-03-31') v)
  select (jsonb_path_query_array(v, '$[*].accidentes') = jsonb_path_query_array(:'med_rep'::jsonb, '$[*].accidentes')
      and jsonb_path_query_array(v, '$[*].dias_cargados') = jsonb_path_query_array(:'med_rep'::jsonb, '$[*].dias_cargados')
      and jsonb_array_length(v) = 1)::int from r);
select 'Inicio: RR. HH. cuenta los eventos abiertos de su empresa (debe 1): ' ||
  ((public.inicio_conteos(null,false,false) -> 'tareas' ->> 'eventos_abiertos') = :'med_abiertos')::int;
select 'eventos_visibles no le da a RR. HH. nada clínico (debe 0): ' || count(*) from public.eventos_visibles()
 where lugar like '%236' and (cie10 is not null or diagnostico is not null or incapacidad is not null or discapacidad is not null
   or potencial_discapacidad or estado_certificacion is not null or observaciones is not null or consulta_id is not null);
select 'pero sí los eventos de su empresa (debe 2): ' || count(*) from public.eventos_visibles() where lugar like '%236';

-- 4. Sin sesión, nada
reset role;
set role anon;
do $$ begin
  perform 1 from public.eventos_empresa;
  raise notice 'anon lee eventos_empresa: FALLA';
exception when insufficient_privilege then null; end $$;
do $$ begin
  perform 1 from public.eventos_visibles();
  raise notice 'anon llama eventos_visibles: FALLA';
exception when insufficient_privilege then null; end $$;

reset role;
select set_config('request.jwt.claim.sub','',false) \g /dev/null
delete from public.eventos where lugar like '%236';
