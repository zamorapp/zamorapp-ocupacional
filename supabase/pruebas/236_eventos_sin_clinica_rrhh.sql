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

-- 3. Sin sesión, nada
reset role;
set role anon;
do $$ begin
  perform 1 from public.eventos_empresa;
  raise notice 'anon lee eventos_empresa: FALLA';
exception when insufficient_privilege then null; end $$;

reset role;
select set_config('request.jwt.claim.sub','',false) \g /dev/null
delete from public.eventos where lugar like '%236';
