-- La firma y el sello son solo del médico: los demás la reciben únicamente para imprimir un documento que él ya cerró.
\pset tuples_only on
reset role;
update public.perfiles set firma_url='data:image/png;base64,FIRMA', sello_url='data:image/png;base64,SELLO' where id='00000000-0000-0000-0000-0000000000a2';
insert into clinico.consultas (id,org_id,empresa_id,trabajador_id,estado,fecha,medico_id) values
 ('24400000-0000-0000-0000-00000000000c','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a','30000000-0000-0000-0000-00000000000a','cerrada',public.hoy_caracas(),'00000000-0000-0000-0000-0000000000a2'),
 ('24400000-0000-0000-0000-00000000000b','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a','30000000-0000-0000-0000-00000000000a','borrador',public.hoy_caracas(),'00000000-0000-0000-0000-0000000000a2');
set role authenticated;
-- Enfermería de la organización
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a5',false) \g /dev/null
select 'enfermería no toma la firma suelta (debe 0): ' || count(*) from public.firma_sello('00000000-0000-0000-0000-0000000000a2');
select 'enfermería imprime con firma lo cerrado (debe 1): ' || count(*) from public.firma_de_documento('consulta','24400000-0000-0000-0000-00000000000c') where firma_url like '%FIRMA' and sello_url like '%SELLO';
select 'enfermería no firma un borrador (debe 0): ' || count(*) from public.firma_de_documento('consulta','24400000-0000-0000-0000-00000000000b');
select 'tipo desconocido no da nada (debe 0): ' || count(*) from public.firma_de_documento('otro','24400000-0000-0000-0000-00000000000c');
-- RR. HH. nunca
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a3',false) \g /dev/null
select 'RR. HH. no obtiene la firma de lo cerrado (debe 0): ' || count(*) from public.firma_de_documento('consulta','24400000-0000-0000-0000-00000000000c');
-- El médico ve la suya en su borrador
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false) \g /dev/null
select 'el médico usa su firma en su borrador (debe 1): ' || count(*) from public.firma_de_documento('consulta','24400000-0000-0000-0000-00000000000b');
select 'el médico ve su firma (debe 1): ' || count(*) from public.firma_sello('00000000-0000-0000-0000-0000000000a2');
-- Otro médico de la organización: solo lo cerrado, nunca la firma suelta
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a4',false) \g /dev/null
select 'otro médico no toma la firma suelta (debe 0): ' || count(*) from public.firma_sello('00000000-0000-0000-0000-0000000000a2');
select 'otro médico no la usa en un borrador ajeno (debe 0): ' || count(*) from public.firma_de_documento('consulta','24400000-0000-0000-0000-00000000000b');
-- Sin sesión
select set_config('request.jwt.claim.sub','',false) \g /dev/null
select 'sin sesión no da nada (debe 0): ' || count(*) from public.firma_de_documento('consulta','24400000-0000-0000-0000-00000000000c');
reset role;
do $$ begin
  set local role anon;
  perform public.firma_de_documento('consulta','24400000-0000-0000-0000-00000000000c');
  raise notice 'FALLA: anon ejecutó firma_de_documento';
exception when insufficient_privilege then null; end $$;
reset role;
delete from clinico.consultas where id::text like '24400000-%';
