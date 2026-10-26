-- Vigilancia epidemiológica: indicadores nuevos y textos del informe por empresa y período.
\pset tuples_only on
reset role;
select set_config('request.jwt.claim.sub','',false) \g /dev/null
insert into public.dependencias (id,org_id,empresa_id,nombre) values
 ('50000000-0000-0000-0000-0000000000d1','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000b','Patio');
update public.trabajadores set dependencia_id='50000000-0000-0000-0000-0000000000d1', sexo='M', fecha_nacimiento='1980-05-01'
 where id='30000000-0000-0000-0000-00000000000b';
insert into clinico.consultas (id,org_id,empresa_id,trabajador_id,estado,fecha,tipo,interconsultas) values
 ('40000000-0000-0000-0000-0000000000e1','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000b','30000000-0000-0000-0000-00000000000b','cerrada','2026-03-10','sucesiva','[{"especialidad":"Traumatología","motivo":"x"}]');
insert into clinico.diagnosticos (org_id,consulta_id,cie10,descripcion,sistema,origen) values
 ('10000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-0000000000e1','M54.5','Lumbago','Osteomioarticular','ocupacional');
insert into clinico.reposos (org_id,trabajador_id,causa,desde,hasta,cie10) values
 ('10000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-00000000000b','enfermedad_ocupacional','2026-03-25','2026-04-05','M54.5');
insert into public.eventos (org_id,empresa_id,trabajador_id,tipo,fecha_hora,lugar) values
 ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000b','30000000-0000-0000-0000-00000000000b','accidente','2026-02-15 10:00','Patio');

set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false) \g /dev/null
-- Trimestre de gestión feb-abr 2026 de la empresa B
select 'causas por sistema (debe 1): ' || jsonb_array_length(r -> 'morbilidad' -> 'cortes' -> 'sistema' -> 'Osteomioarticular')
  from public.reporte_vigilancia('20000000-0000-0000-0000-00000000000b','2026-02-01','2026-04-30') r;
select 'causas por edad 40-59 (debe 1): ' || jsonb_array_length(r -> 'morbilidad' -> 'cortes' -> 'edad' -> '40-59')
  from public.reporte_vigilancia('20000000-0000-0000-0000-00000000000b','2026-02-01','2026-04-30') r;
select 'referencias (debe 1): ' || (r -> 'referencias' ->> 'total') from public.reporte_vigilancia('20000000-0000-0000-0000-00000000000b','2026-02-01','2026-04-30') r;
select 'días de reposo dentro de feb-abr (debe 12): ' || (r -> 'ausentismo' ->> 'dias_perdidos') from public.reporte_vigilancia('20000000-0000-0000-0000-00000000000b','2026-02-01','2026-04-30') r;
select 'días de reposo dentro de ene-mar (debe 7): ' || (r -> 'ausentismo' ->> 'dias_perdidos') from public.reporte_vigilancia('20000000-0000-0000-0000-00000000000b','2026-01-01','2026-03-31') r;
select 'días por enf. ocupacional (debe 12): ' || (r -> 'enfermedad_ocupacional' ->> 'dias') from public.reporte_vigilancia('20000000-0000-0000-0000-00000000000b','2026-02-01','2026-04-30') r;
select 'accidentes listados (debe 1): ' || jsonb_array_length(r -> 'accidentes') from public.reporte_vigilancia('20000000-0000-0000-0000-00000000000b','2026-02-01','2026-04-30') r;
select 'bajo vigilancia ocupacional (debe 1): ' || (r -> 'poblacion' ->> 'vigilancia_ocupacional') from public.reporte_vigilancia('20000000-0000-0000-0000-00000000000b','2026-02-01','2026-04-30') r;
select 'uso por dependencia con personal (debe 1): ' || (r -> 'consultas' -> 'por_dependencia' -> 0 ->> 'personal') from public.reporte_vigilancia('20000000-0000-0000-0000-00000000000b','2026-02-01','2026-04-30') r;

-- Textos del informe
insert into public.informes_vigilancia (org_id,empresa_id,desde,hasta,conclusiones) values
 ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a','2026-02-01','2026-04-30','Admin A');
insert into public.informes_vigilancia (org_id,empresa_id,desde,hasta,conclusiones) values
 ('10000000-0000-0000-0000-000000000001',null,'2026-02-01','2026-04-30','Consolidado');
do $$ begin insert into public.informes_vigilancia (org_id,empresa_id,desde,hasta) values ('10000000-0000-0000-0000-000000000001',null,'2026-02-01','2026-04-30'); raise notice 'consolidado duplicado: FALLA'; exception when unique_violation then raise notice 'consolidado duplicado rechazado (ok)'; end $$;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a3',false) \g /dev/null
select 'RRHH-A lee el informe de A (debe 1): ' || count(*) from public.informes_vigilancia where empresa_id='20000000-0000-0000-0000-00000000000a';
select 'RRHH-A lee el consolidado (debe 0): ' || count(*) from public.informes_vigilancia where empresa_id is null;
update public.informes_vigilancia set conclusiones='cambiado' where empresa_id='20000000-0000-0000-0000-00000000000a';
select 'RRHH-A no edita (debe 0): ' || count(*) from public.informes_vigilancia where conclusiones='cambiado';
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false) \g /dev/null
do $$ begin insert into public.informes_vigilancia (org_id,empresa_id,desde,hasta) values ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000b','2026-02-01','2026-04-30'); raise notice 'Medico-A escribió informe de B: FALLA'; exception when others then raise notice 'Medico-A informe de B bloqueado (ok)'; end $$;
update public.informes_vigilancia set conclusiones='Medico A' where empresa_id='20000000-0000-0000-0000-00000000000a';
select 'Medico-A edita el de A (debe 1): ' || count(*) from public.informes_vigilancia where conclusiones='Medico A';
reset role;
