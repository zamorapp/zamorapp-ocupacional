-- Anexo 1 de la NT-02: lista copiada a la organización y declaración desde la consulta.
\pset tuples_only on
reset role;
select set_config('request.jwt.claim.sub','',false) \g /dev/null
select 'Anexo 1 NT-02 copiado a la organización (debe 62): ' || count(*) from public.lista_items where lista = 'declaracion_ocupacional' and org_id = '10000000-0000-0000-0000-000000000001';
select 'lumbago M54.5 en el Anexo 1 (debe 1): ' || count(*) from public.lista_items where lista = 'declaracion_ocupacional' and org_id is null and codigo = 'M54.5';

set role authenticated;
-- Médico de A: lee las listas y abre la declaración desde una consulta de A, no de B
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false) \g /dev/null
select 'Medico-A lee el Anexo 1 de su organización (debe 62): ' || count(*) from public.lista_items where lista = 'declaracion_ocupacional' and org_id is not null;
insert into public.eventos (org_id,empresa_id,trabajador_id,tipo,fecha_hora,fecha_diagnostico,cie10,diagnostico,en_anexo1,consulta_id) values
 ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a','30000000-0000-0000-0000-00000000000a','enfermedad',now(),now(),'M54.5','Lumbago',true,'40000000-0000-0000-0000-00000000000a');
select 'Medico-A ve su declaración por consulta (debe 1): ' || count(*) from public.eventos where consulta_id = '40000000-0000-0000-0000-00000000000a' and tipo = 'enfermedad';
do $$ begin
  insert into public.eventos (org_id,empresa_id,trabajador_id,tipo,fecha_hora,cie10,consulta_id) values
   ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000b','30000000-0000-0000-0000-00000000000b','enfermedad',now(),'J45','40000000-0000-0000-0000-00000000000b');
  raise notice 'Medico-A declara en B: FALLA';
exception when insufficient_privilege then raise notice 'Medico-A no puede declarar en B (ok)'; end $$;

-- RR. HH. de A no inicia declaraciones ni edita las listas
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a3',false) \g /dev/null
do $$ begin
  insert into public.eventos (org_id,empresa_id,trabajador_id,tipo,fecha_hora,cie10) values
   ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a','30000000-0000-0000-0000-00000000000a','enfermedad',now(),'J45');
  raise notice 'RRHH-A declara: FALLA';
exception when insufficient_privilege then raise notice 'RRHH-A no declara (ok)'; end $$;
update public.lista_items set codigo = 'X99' where lista = 'declaracion_ocupacional';
select 'RRHH-A no cambia el Anexo 1 (debe 0): ' || count(*) from public.lista_items where lista = 'declaracion_ocupacional' and codigo = 'X99';
reset role;
