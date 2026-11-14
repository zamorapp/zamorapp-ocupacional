-- Enfermería llena la investigación de accidente (NT-02) de su empresa: corrige solo la suya, lee la del médico, no borra.
\pset tuples_only on
reset role;
select set_config('request.jwt.claim.sub','',false) \g /dev/null
insert into public.eventos (id,org_id,empresa_id,trabajador_id,tipo,fecha_hora,cie10,diagnostico) values
 ('24000000-0000-0000-0000-0000000000e1','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a','30000000-0000-0000-0000-00000000000a','enfermedad','2026-06-01 08:00','M54.5','Lumbago'),
 ('24000000-0000-0000-0000-0000000000e2','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000b','30000000-0000-0000-0000-00000000000b','enfermedad','2026-06-01 08:00','G56.0','Túnel del carpo'),
 ('24000000-0000-0000-0000-0000000000e3','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a','30000000-0000-0000-0000-00000000000a','accidente','2026-06-02 08:00',null,null);

set role authenticated;
-- El médico de A elabora una
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a4',false) \g /dev/null
insert into public.investigaciones (org_id,evento_id,trabajador_id,secciones) values
 ('10000000-0000-0000-0000-000000000001','24000000-0000-0000-0000-0000000000e3','30000000-0000-0000-0000-00000000000a','{"clinico":"Del médico"}');

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a5',false) \g /dev/null
-- La enfermera crea la suya en su empresa (A) y la corrige
insert into public.investigaciones (org_id,evento_id,trabajador_id,secciones) values
 ('10000000-0000-0000-0000-000000000001','24000000-0000-0000-0000-0000000000e1','30000000-0000-0000-0000-00000000000a','{"clinico":"De enfermería"}');
update public.investigaciones set secciones = '{"clinico":"Corregido por enfermería"}' where evento_id = '24000000-0000-0000-0000-0000000000e1';
select 'la enfermera corrige la suya (debe 1): ' || count(*) from public.investigaciones
 where evento_id = '24000000-0000-0000-0000-0000000000e1' and secciones ->> 'clinico' = 'Corregido por enfermería';
-- La del médico: la lee, no la cambia ni la borra; la suya tampoco la borra
select 'la enfermera lee la del médico (debe 1): ' || count(*) from public.investigaciones where evento_id = '24000000-0000-0000-0000-0000000000e3';
update public.investigaciones set secciones = '{"clinico":"Cambiado"}' where evento_id = '24000000-0000-0000-0000-0000000000e3';
delete from public.investigaciones where evento_id in ('24000000-0000-0000-0000-0000000000e3','24000000-0000-0000-0000-0000000000e1');
-- Fuera de su empresa (B): no la crea
do $$ begin
  insert into public.investigaciones (org_id,evento_id,trabajador_id) values
   ('10000000-0000-0000-0000-000000000001','24000000-0000-0000-0000-0000000000e2','30000000-0000-0000-0000-00000000000b');
  raise notice 'FALLA: enfermería escribió una investigación de otra empresa';
exception when insufficient_privilege then null; end $$;
-- El resto de la historia sigue cerrado para ella
do $$ begin
  insert into clinico.historia_laboral (org_id,trabajador_id,empresa) values ('10000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-00000000000a','x');
  raise notice 'FALLA: enfermería agregó historia laboral';
exception when insufficient_privilege then null; end $$;

-- El médico sigue corrigiendo la suya (la regla nueva solo toca a enfermería)
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a4',false) \g /dev/null
update public.investigaciones set estado = 'terminado' where evento_id = '24000000-0000-0000-0000-0000000000e3';
reset role;
select 'la del médico sigue igual tras la enfermera (debe 1): ' || count(*) from clinico.investigaciones
 where evento_id = '24000000-0000-0000-0000-0000000000e3' and secciones ->> 'clinico' = 'Del médico';
select 'la enfermera no borró ninguna (debe 2): ' || count(*) from clinico.investigaciones where evento_id::text like '24000000-%';
select 'el médico corrige la suya (debe 1): ' || count(*) from clinico.investigaciones where evento_id = '24000000-0000-0000-0000-0000000000e3' and estado = 'terminado';
select 'nada escrito en la empresa B (debe 0): ' || count(*) from clinico.investigaciones where evento_id = '24000000-0000-0000-0000-0000000000e2';
delete from clinico.investigaciones where evento_id::text like '24000000-%';
delete from public.eventos where id::text like '24000000-%';
