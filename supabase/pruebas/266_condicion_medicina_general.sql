-- Medicina general: la consulta cierra con la «Evaluación de condición» (no con elegibilidad). guardar_consulta la
-- guarda solo si llega la clave, limpia lo vacío y no toca la aptitud.
\pset tuples_only on
reset role;
insert into clinico.consultas (id,org_id,empresa_id,trabajador_id,estado) values
 ('26600000-0000-0000-0000-0000000000f1','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a','30000000-0000-0000-0000-00000000000a','borrador');
select 'la lista base tiene 5 opciones (debe 5): ' || count(*) from public.lista_items where org_id is null and lista = 'condicion_trabajador';
select 'cada organización recibe sus opciones (debe 5): ' || count(*) from public.lista_items where org_id = '10000000-0000-0000-0000-000000000001' and lista = 'condicion_trabajador';

set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false) \g /dev/null
select public.guardar_consulta('26600000-0000-0000-0000-0000000000f1',
  '{"tipo":"primera","condicion":{"trabajo":" Puede continuar en su trabajo ","funciones":"Puede cumplir sus funciones generales en el puesto de trabajo","nota":"","x":5}}',
  '[]', null, null, false) \g /dev/null
select 'guarda la condición limpia (debe 1): ' || count(*) from public.consultas where id = '26600000-0000-0000-0000-0000000000f1'
  and condicion = '{"trabajo":"Puede continuar en su trabajo","funciones":"Puede cumplir sus funciones generales en el puesto de trabajo"}'::jsonb;
select 'sin aptitud (debe 0): ' || count(*) from public.aptitudes where consulta_id = '26600000-0000-0000-0000-0000000000f1';

-- Un guardado sin la clave (celular, bandeja vieja) la conserva
select public.guardar_consulta('26600000-0000-0000-0000-0000000000f1', '{"tipo":"primera"}', '[]', null, null, false) \g /dev/null
select 'sin la clave se conserva (debe 1): ' || count(*) from public.consultas where id = '26600000-0000-0000-0000-0000000000f1' and condicion ? 'trabajo';

-- Vaciarla la deja en null
select public.guardar_consulta('26600000-0000-0000-0000-0000000000f1', '{"tipo":"primera","condicion":{}}', '[]', null, null, false) \g /dev/null
select 'vacía queda null (debe 1): ' || count(*) from public.consultas where id = '26600000-0000-0000-0000-0000000000f1' and condicion is null;

-- RR. HH. no lee la consulta (la condición vive en la consulta clínica)
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a3',false) \g /dev/null
select 'RR. HH. no ve la consulta (debe 0): ' || count(*) from public.consultas where id = '26600000-0000-0000-0000-0000000000f1';
reset role;
