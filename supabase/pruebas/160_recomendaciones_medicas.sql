-- Recomendaciones médico-ocupacionales: el médico de la empresa las guarda; RR. HH. de esa empresa las lee y no las cambia
\pset tuples_only on
reset role;
insert into public.informes_vigilancia (id,org_id,empresa_id,desde,hasta,recomendaciones,recomendaciones_medicas) values
 ('16000000-0000-0000-0000-000000000160','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a','2024-01-01','2024-03-31','Seguridad','Médicas');
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false) \g /dev/null
update public.informes_vigilancia set recomendaciones_medicas='Vigilancia médica' where id='16000000-0000-0000-0000-000000000160';
select 'Medico-A guarda las recomendaciones médicas (debe 1): ' || count(*) from public.informes_vigilancia where id='16000000-0000-0000-0000-000000000160' and recomendaciones_medicas='Vigilancia médica' and recomendaciones='Seguridad';
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a3',false) \g /dev/null
select 'RRHH-A las lee (debe 1): ' || count(*) from public.informes_vigilancia where id='16000000-0000-0000-0000-000000000160' and recomendaciones_medicas is not null;
update public.informes_vigilancia set recomendaciones_medicas='cambiado' where id='16000000-0000-0000-0000-000000000160';
select 'RRHH-A no las cambia (debe 0): ' || count(*) from public.informes_vigilancia where recomendaciones_medicas='cambiado';
reset role;
delete from public.informes_vigilancia where id='16000000-0000-0000-0000-000000000160';
