-- Indicación de enfermería o récipe SIN consulta (Cesar, 10-nov): la emite el médico, la cumple enfermería, no cuenta
-- como consulta, lo escrito no cambia, no se borra, gana la primera marca y RR. HH. no la ve.
\pset tuples_only on
reset role;
create temp table c225 as select count(*) as n from clinico.consultas;
set role authenticated;

-- El médico emite la orden a enfermería (autor, hora, empresa y estado los pone la base)
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false) \g /dev/null
insert into public.indicaciones (id, org_id, trabajador_id, tipo, tratamiento, indicaciones, indicado_por, medico_id, creada_en, estado, cumplida_por)
values ('22500000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-00000000000a', 'enfermeria',
        '[{"medicina":"Complejo B","concentracion":"100/100/1 mg/3 ml","presentacion":"Ampolla","via":"Intramuscular","dosis":"1 ampolla","frecuencia":"Dosis única","duracion":"1 día"}]',
        '  Colocar hoy  ', '  Dr. Pérez (traumatólogo)  ', '00000000-0000-0000-0000-0000000000a1', '2020-01-01', 'cumplida', '00000000-0000-0000-0000-0000000000a1');
select 'el médico emite; autor, hora, empresa y estado los pone la base (debe 1): ' || count(*) from public.indicaciones
 where id = '22500000-0000-0000-0000-000000000001' and estado = 'pendiente' and cumplida_por is null
   and medico_id = '00000000-0000-0000-0000-0000000000a2' and creada_en > now() - interval '1 minute'
   and empresa_id = '20000000-0000-0000-0000-00000000000a' and indicaciones = 'Colocar hoy' and indicado_por = 'Dr. Pérez (traumatólogo)';
-- Récipe suelto: nace «emitida»
insert into public.indicaciones (id, org_id, trabajador_id, tipo, tratamiento)
values ('22500000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-00000000000a', 'recipe',
        '[{"medicina":"Losartán","concentracion":"50 mg","presentacion":"Tabletas","via":"Oral","dosis":"1 tableta","frecuencia":"Cada 24 horas","duracion":"30 días"}]');
select 'el récipe nace emitido (debe 1): ' || count(*) from public.indicaciones where id = '22500000-0000-0000-0000-000000000002' and estado = 'emitida';
do $$ begin insert into public.indicaciones (org_id, trabajador_id, tipo, indicaciones) values ('10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-00000000000a', 'recipe', 'algo');
 raise notice 'récipe sin medicinas aceptado: FALLA'; exception when check_violation then raise notice 'récipe sin medicinas no se crea (ok)'; end $$;
do $$ begin insert into public.indicaciones (org_id, trabajador_id, tipo, indicaciones) values ('10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-00000000000a', 'enfermeria', '   ');
 raise notice 'orden vacía aceptada: FALLA'; exception when check_violation then raise notice 'orden sin medicinas ni texto no se crea (ok)'; end $$;
reset role;
select 'no crea consultas (debe 0): ' || ((select count(*) from clinico.consultas) - (select n from c225));
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false) \g /dev/null

-- Lo escrito no cambia
update public.indicaciones set tratamiento = '[]', indicaciones = 'otra', fecha = '2020-01-01', medico_id = '00000000-0000-0000-0000-0000000000a1'
 where id = '22500000-0000-0000-0000-000000000001';
select 'lo escrito al emitirla no cambia (debe 1): ' || count(*) from public.indicaciones
 where id = '22500000-0000-0000-0000-000000000001' and indicaciones = 'Colocar hoy' and jsonb_array_length(tratamiento) = 1
   and fecha = public.hoy_caracas() and medico_id = '00000000-0000-0000-0000-0000000000a2';

-- Enfermería no emite, pero cumple
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a5',false) \g /dev/null
do $$ begin insert into public.indicaciones (org_id, trabajador_id, tipo, indicaciones) values ('10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-00000000000a', 'enfermeria', 'x');
 raise notice 'enfermería emite: FALLA'; exception when insufficient_privilege then raise notice 'enfermería no emite (ok)'; end $$;
do $$ begin update public.indicaciones set estado = 'anulada' where id = '22500000-0000-0000-0000-000000000001';
 raise notice 'enfermería anula: FALLA'; exception when insufficient_privilege then raise notice 'enfermería no anula (ok)'; end $$;
do $$ begin update public.indicaciones set estado = 'cumplida' where id = '22500000-0000-0000-0000-000000000002';
 raise notice 'récipe cumplido: FALLA'; exception when insufficient_privilege then raise notice 'el récipe no se marca cumplido (ok)'; end $$;
update public.indicaciones set estado = 'cumplida', nota_cumplimiento = ' Glúteo derecho, sin reacción ', cumplida_por = '00000000-0000-0000-0000-0000000000a1'
 where id = '22500000-0000-0000-0000-000000000001';
select 'enfermería la marca cumplida; quién y cuándo los pone la base (debe 1): ' || count(*) from public.indicaciones
 where id = '22500000-0000-0000-0000-000000000001' and estado = 'cumplida' and cumplida_por = '00000000-0000-0000-0000-0000000000a5'
   and cumplida_en > now() - interval '1 minute' and nota_cumplimiento = 'Glúteo derecho, sin reacción';

-- Cumplida ya no cambia (gana la primera marca), ni el médico la anula
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false) \g /dev/null
update public.indicaciones set estado = 'anulada', motivo_anulacion = 'x' where id = '22500000-0000-0000-0000-000000000001';
select 'cumplida no se anula después (debe 1): ' || count(*) from public.indicaciones where id = '22500000-0000-0000-0000-000000000001' and estado = 'cumplida' and anulada_por is null;
-- El médico anula el récipe con motivo
update public.indicaciones set estado = 'anulada', motivo_anulacion = ' Dosis equivocada ' where id = '22500000-0000-0000-0000-000000000002';
select 'el médico anula con motivo (debe 1): ' || count(*) from public.indicaciones where id = '22500000-0000-0000-0000-000000000002'
   and estado = 'anulada' and anulada_por = '00000000-0000-0000-0000-0000000000a2' and motivo_anulacion = 'Dosis equivocada';
-- Sin borrar
do $$ begin delete from public.indicaciones where id = '22500000-0000-0000-0000-000000000002';
 raise notice 'borró: FALLA'; exception when insufficient_privilege then raise notice 'no se borra (ok)'; end $$;

-- RR. HH. no la ve ni la crea; el médico de otra empresa tampoco la ve
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a3',false) \g /dev/null
select 'RR. HH. no ve indicaciones (debe 0): ' || count(*) from public.indicaciones;
do $$ begin insert into public.indicaciones (org_id, trabajador_id, tipo, indicaciones) values ('10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-00000000000a', 'enfermeria', 'x');
 raise notice 'RR. HH. crea: FALLA'; exception when insufficient_privilege then raise notice 'RR. HH. no crea (ok)'; end $$;
reset role;
insert into auth.users (id,email) values ('00000000-0000-0000-0000-000000002251','medB225@x') on conflict do nothing;
insert into public.miembros (org_id,usuario_id,rol,empresas_permitidas) values
 ('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000002251','medico','{20000000-0000-0000-0000-00000000000b}');
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000002251',false) \g /dev/null
select 'el médico de la empresa B no ve las de A (debe 0): ' || count(*) from public.indicaciones;

-- Sincronía con el escritorio: sube y baja
reset role;
select 'la tabla sube y baja con el escritorio (debe 1): ' || count(*) from sync.tablas where nombre = 'clinico.indicaciones' and clinica and subible;
select 'la sincronía anotó la orden (debe 1): ' || least(count(*), 1) from sync.registro where fila_id = '22500000-0000-0000-0000-000000000001';
delete from public.miembros where usuario_id = '00000000-0000-0000-0000-000000002251';
delete from clinico.indicaciones where id::text like '22500000-%';
