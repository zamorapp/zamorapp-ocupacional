-- Observación del reposo del SAME: el personal clínico la lee, RR. HH. no ve el reposo y nadie con sesión la cambia.
\pset tuples_only on
reset role;
select set_config('request.jwt.claim.sub','',false) \g /dev/null
insert into clinico.reposos (id,org_id,trabajador_id,causa,desde,hasta,origen,codigo_origen,observacion) values
 ('14600000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-00000000000a',
  'enfermedad_comun','2022-03-01','2022-03-05','integral','rep:146','Reposo indicado por traumatólogo 146');
select 'la carga del SAME la guarda (debe 1): ' || count(*) from clinico.reposos where id='14600000-0000-0000-0000-000000000001' and observacion like '%146';
set role authenticated;

-- Médico de la empresa A: la lee, pero no la cambia ni la pone en un reposo nuevo
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false) \g /dev/null
select 'el médico la lee (debe 1): ' || count(*) from clinico.reposos where id='14600000-0000-0000-0000-000000000001' and observacion like '%146';
update clinico.reposos set observacion='cambiada', hasta='2022-03-06' where id='14600000-0000-0000-0000-000000000001';
insert into clinico.reposos (id,org_id,trabajador_id,causa,desde,hasta,observacion) values
 ('14600000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-00000000000a',
  'enfermedad_comun','2026-10-01','2026-10-02','inventada');

-- RR. HH. de la empresa A: no ve el reposo
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a3',false) \g /dev/null
select 'RRHH no ve la observación (debe 0): ' || count(*) from clinico.reposos where observacion is not null;

reset role;
select 'con sesión no se cambia, el resto sí (debe 1): ' || count(*) from clinico.reposos
 where id='14600000-0000-0000-0000-000000000001' and observacion like '%146' and hasta='2022-03-06';
select 'un reposo nuevo no la trae (debe 0): ' || count(*) from clinico.reposos where id='14600000-0000-0000-0000-000000000002' and observacion is not null;
delete from clinico.reposos where id::text like '14600000-%';
