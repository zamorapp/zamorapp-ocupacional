-- Riesgos del puesto elegidos con botones en la consulta (Cesar, 03-nov): se guardan en la consulta, la app los lee
-- por la vista, sin la clave se conservan, {} = ninguno, null = los del cargo, solo los seis grupos, y el catálogo creció.
\pset tuples_only on
reset role;
select 'catálogo base con los agentes nuevos (debe 16): ' || count(*) from public.lista_items
 where lista = 'agente_riesgo' and org_id is null and orden > 100;
select 'cada organización recibe la copia (debe 16): ' || count(*) from public.lista_items
 where lista = 'agente_riesgo' and org_id = '10000000-0000-0000-0000-000000000001' and orden > 100;
-- Lo que una organización borró no vuelve al repetir la siembra (ni un agente nuevo ni uno viejo)
delete from public.lista_items where org_id = '10000000-0000-0000-0000-000000000001' and lista = 'agente_riesgo' and nombre in ('Humedad', 'Ruido');
select public.sembrar_agentes_riesgo_2026() \g /dev/null
select 'repetir la siembra no duplica (debe 16): ' || count(*) from public.lista_items
 where lista = 'agente_riesgo' and org_id is null and orden > 100;
select 'lo borrado por la organización no vuelve (debe 0): ' || count(*) from public.lista_items
 where org_id = '10000000-0000-0000-0000-000000000001' and lista = 'agente_riesgo' and nombre in ('Humedad', 'Ruido');

set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false) \g /dev/null
insert into clinico.consultas (id,org_id,empresa_id,trabajador_id,estado,fecha) values
 ('18700000-0000-0000-0000-0000000000c1','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a','30000000-0000-0000-0000-00000000000a','borrador',public.hoy_caracas());
select 'consulta nueva sin riesgos propios: toma los del cargo (debe 1): ' || count(*) from public.consultas
 where id = '18700000-0000-0000-0000-0000000000c1' and riesgos is null;

-- El médico marca riesgos; grupos inventados, textos vacíos y repetidos se descartan
select public.guardar_consulta('18700000-0000-0000-0000-0000000000c1',
 format('{"tipo":"primera","fecha":"%s","riesgos":{"fisico":["Ruido"," Ruido ","","Calor"],"psicosocial":["Trabajo aislado"],"inventado":["X"],"quimico":"no es lista"}}', public.hoy_caracas())::jsonb,
 '[]', null, null, false) \g /dev/null
select 'se leen por la vista de la app (debe 2): ' || jsonb_array_length(riesgos -> 'fisico') from public.consultas where id = '18700000-0000-0000-0000-0000000000c1';
select 'solo los seis grupos (debe 0): ' || count(*) from public.consultas, jsonb_object_keys(riesgos) k
 where id = '18700000-0000-0000-0000-0000000000c1' and k not in ('fisico','quimico','biologico','mecanico','disergonomico','psicosocial');
select 'psicosocial guardado (debe 1): ' || count(*) from public.consultas where id = '18700000-0000-0000-0000-0000000000c1' and riesgos -> 'psicosocial' ? 'Trabajo aislado';

-- Un guardado sin la clave (bandeja vieja) no borra lo elegido
select public.guardar_consulta('18700000-0000-0000-0000-0000000000c1', format('{"tipo":"primera","fecha":"%s"}', public.hoy_caracas())::jsonb, '[]', null, null, false) \g /dev/null
select 'sin la clave se conservan (debe 1): ' || count(*) from public.consultas where id = '18700000-0000-0000-0000-0000000000c1' and riesgos -> 'fisico' ? 'Calor';

-- Quitar todos: {} (no vuelve a los del cargo)
select public.guardar_consulta('18700000-0000-0000-0000-0000000000c1', format('{"tipo":"primera","fecha":"%s","riesgos":{}}', public.hoy_caracas())::jsonb, '[]', null, null, false) \g /dev/null
select 'ninguno queda como {} (debe 1): ' || count(*) from public.consultas where id = '18700000-0000-0000-0000-0000000000c1' and riesgos = '{}'::jsonb;

-- «Volver a los del cargo»: null
select public.guardar_consulta('18700000-0000-0000-0000-0000000000c1', format('{"tipo":"primera","fecha":"%s","riesgos":null}', public.hoy_caracas())::jsonb, '[]', null, null, false) \g /dev/null
select 'volver a los del cargo deja null (debe 1): ' || count(*) from public.consultas where id = '18700000-0000-0000-0000-0000000000c1' and riesgos is null;

reset role;
do $$ begin
  update clinico.consultas set riesgos = '["no es objeto"]' where id = '18700000-0000-0000-0000-0000000000c1';
  raise notice 'un arreglo no entra (no debe llegar aquí)';
exception when check_violation then raise notice 'riesgos que no son objeto se rechazan: ok';
end $$;
delete from clinico.consultas where id = '18700000-0000-0000-0000-0000000000c1';
select set_config('request.jwt.claim.sub', '', false) \g /dev/null
