-- Versiones propias de las hojas para el paciente: solo administrador o gerente médico las cambian, una por hoja, y el
-- paciente del enlace ve solo las de sus documentos.
\pset tuples_only on
reset role;
select set_config('request.jwt.claim.sub','',false) \g /dev/null

set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false) \g /dev/null
insert into public.lista_items (lista,org_id,codigo,nombre,datos) values
 ('hoja_paciente','10000000-0000-0000-0000-000000000001','bienestar-lumbalgia','Lumbalgia','{"cambios":{"lumbalgia-0":["Caminar 20 minutos al día"]}}'),
 ('hoja_paciente','10000000-0000-0000-0000-000000000001','dieta-hta','Hipertensión','{"cambios":{"evitar":["Cubitos"]}}'),
 ('hoja_paciente','10000000-0000-0000-0000-000000000001','dieta-renal','Renal','{"cambios":{"evitar":["Carambola"]}}');
select 'el administrador guarda versiones (debe 3): ' || count(*) from public.lista_items where lista = 'hoja_paciente';
do $$ begin
  insert into public.lista_items (lista,org_id,codigo,nombre,datos) values ('hoja_paciente','10000000-0000-0000-0000-000000000001','dieta-hta','Otra','{"cambios":{}}');
  raise notice 'FALLA: dos versiones de la misma hoja';
exception when unique_violation then raise notice 'una sola versión por hoja (debe 1): 1';
end $$;
do $$ begin
  insert into public.lista_items (lista,org_id,codigo,nombre,datos) values ('hoja_paciente','10000000-0000-0000-0000-000000000001','historia-x','X','{"cambios":{}}');
  raise notice 'FALLA: código inventado';
exception when check_violation then raise notice 'solo dieta-… o bienestar-… (debe 1): 1';
end $$;

-- Un médico (no administrador) no las cambia
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false) \g /dev/null
with x as (update public.lista_items set datos = '{"cambios":{}}' where lista = 'hoja_paciente' returning 1)
select 'un médico no cambia la versión de la organización (debe 0): ' || count(*) from x;
select 'pero sí la lee (debe 3): ' || count(*) from public.lista_items where lista = 'hoja_paciente';

-- Paciente del enlace: solo las hojas de sus documentos
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false) \g /dev/null
insert into public.solicitudes_paciente (id,org_id,token_hash,documentos) values
 ('5f000000-0000-0000-0000-000000000215','10000000-0000-0000-0000-000000000001',sha256('hoj-0123456789-0123456789-0123456789-uno'),
  '{"dieta":{"dieta":"hta","plan":[]},"bienestar":{"tema":["lumbalgia"]}}');
set role anon;
select set_config('request.jwt.claim.sub','',false) \g /dev/null
select 'sin llenar no ve nada (debe 1): ' || (public.hojas_registro_paciente('hoj-0123456789-0123456789-0123456789-uno') is null)::int;
select public.enviar_solicitud_paciente('hoj-0123456789-0123456789-0123456789-uno',
  '{"cedula":"V-11223344","nombres":"Rosa","apellidos":"Paz","fecha_nacimiento":"1980-01-01","telefono":"04141234567","motivo":"Control"}') \g /dev/null
select 've la versión de su dieta y de su tema, no la de otra dieta (debe 1): ' || count(*) from (select public.hojas_registro_paciente('hoj-0123456789-0123456789-0123456789-uno') j) x
 where j ? 'dieta-hta' and j ? 'bienestar-lumbalgia' and not j ? 'dieta-renal' and j -> 'dieta-hta' -> 'evitar' ->> 0 = 'Cubitos';
select 'token inventado no ve nada (debe 1): ' || (public.hojas_registro_paciente('hoj-0123456789-0123456789-0123456789-xxx') is null)::int;
select 'el anónimo no lee lista_items (debe 0): ' || has_table_privilege('anon','public.lista_items','select')::int;

reset role;
delete from public.solicitudes_paciente where id = '5f000000-0000-0000-0000-000000000215';
delete from public.notificaciones where titulo = 'Paciente envió sus datos';
delete from public.lista_items where lista = 'hoja_paciente';
