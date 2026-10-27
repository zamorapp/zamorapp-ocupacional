-- Informe de investigación NT-02: solo personal de salud, mismo evento y trabajador, réplica de escritorio.
\pset tuples_only on
reset role;
select set_config('request.jwt.claim.sub','',false) \g /dev/null
insert into public.eventos (id,org_id,empresa_id,trabajador_id,tipo,fecha_hora,cie10,diagnostico) values
 ('60000000-0000-0000-0000-0000000000e1','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a','30000000-0000-0000-0000-00000000000a','enfermedad','2026-06-01 08:00','M54.5','Lumbago'),
 ('60000000-0000-0000-0000-0000000000e2','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000b','30000000-0000-0000-0000-00000000000b','enfermedad','2026-06-01 08:00','G56.0','Túnel del carpo');
select 'tabla en la réplica de escritorio (debe 1): ' || count(*) from sync.tablas where nombre='clinico.investigaciones' and clinica;

set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false) \g /dev/null
insert into public.investigaciones (org_id,evento_id,trabajador_id,secciones) values
 ('10000000-0000-0000-0000-000000000001','60000000-0000-0000-0000-0000000000e1','30000000-0000-0000-0000-00000000000a','{"clinico":"Dolor lumbar"}');
select 'médico A ve su informe (debe 1): ' || count(*) from public.investigaciones;
do $$ begin
  insert into public.investigaciones (org_id,evento_id,trabajador_id) values
   ('10000000-0000-0000-0000-000000000001','60000000-0000-0000-0000-0000000000e2','30000000-0000-0000-0000-00000000000b');
  raise notice 'médico A escribe en empresa B: FALLA';
exception when insufficient_privilege then raise notice 'médico A no escribe en empresa B (ok)'; end $$;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false) \g /dev/null
do $$ begin
  insert into public.investigaciones (org_id,evento_id,trabajador_id) values
   ('10000000-0000-0000-0000-000000000001','60000000-0000-0000-0000-0000000000e2','30000000-0000-0000-0000-00000000000a');
  raise notice 'informe con trabajador ajeno al evento: FALLA';
exception when check_violation or insufficient_privilege then raise notice 'informe con trabajador ajeno rechazado (ok)'; end $$;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a3',false) \g /dev/null
select 'RRHH no ve el informe clínico (debe 0): ' || count(*) from public.investigaciones;
select 'RRHH sí ve el evento (debe 1): ' || count(*) from public.eventos where id='60000000-0000-0000-0000-0000000000e1';
reset role;
with x as (update clinico.investigaciones set estado='terminado' where evento_id='60000000-0000-0000-0000-0000000000e1' returning version)
select 'versión de sincronía al editar (debe 2): ' || version from x;
-- Potencial discapacidad heredada de la consulta (columna de la consulta opcional)
reset role;
select 'sin marca en la consulta no hereda (debe 0): ' || potencial_discapacidad::int from public.eventos where id='60000000-0000-0000-0000-0000000000e1';
alter table clinico.consultas add column if not exists potencial_discapacidad boolean not null default false;
insert into clinico.consultas (id,org_id,empresa_id,trabajador_id,estado,fecha,potencial_discapacidad) values
 ('40000000-0000-0000-0000-0000000000e9','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a','30000000-0000-0000-0000-00000000000a','cerrada','2026-06-02',true);
insert into public.eventos (id,org_id,empresa_id,trabajador_id,tipo,fecha_hora,consulta_id) values
 ('60000000-0000-0000-0000-0000000000e3','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a','30000000-0000-0000-0000-00000000000a','accidente','2026-06-02 08:00','40000000-0000-0000-0000-0000000000e9');
select 'hereda la marca de la consulta (debe 1): ' || potencial_discapacidad::int from public.eventos where id='60000000-0000-0000-0000-0000000000e3';
