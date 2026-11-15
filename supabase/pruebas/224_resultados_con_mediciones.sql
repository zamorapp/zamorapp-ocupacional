-- Goniometría y espirometría con valores: «Guardar resultados» (consulta cerrada) guarda y conserva la medición.
\pset tuples_only on
reset role;
select set_config('request.jwt.claim.sub','',false) \g /dev/null
insert into clinico.consultas (id,org_id,empresa_id,trabajador_id,estado,fecha,paraclinicos) values
 ('22400000-0000-0000-0000-00000000000a','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a','30000000-0000-0000-0000-00000000000a','cerrada',public.hoy_caracas(),
  '[{"id":"libre-goniometria","nombre":"Goniometría","grupo":"Estudios funcionales","resultado":""},{"id":"libre-espirometria","nombre":"Espirometría","grupo":"Estudios funcionales","resultado":"","medicion":{"tipo":"espirometria","valores":{"fvc":4}}}]');

set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false) \g /dev/null
select public.guardar_resultados('22400000-0000-0000-0000-00000000000a',
  '[{"id":"libre-goniometria","resultado":"Limitación marcada: hombro der. abducción 120° de 180°.","estado":"alterado","manual":true,"medicion":{"tipo":"goniometria","filas":[{"clave":"hombro.abd","lado":"D","grados":120,"normal":180}]}},{"id":"libre-espirometria","resultado":"","estado":""}]') \g /dev/null
select 'guarda los grados de la goniometría (debe 120): ' || (paraclinicos -> 0 -> 'medicion' -> 'filas' -> 0 ->> 'grados') from public.consultas where id = '22400000-0000-0000-0000-00000000000a';
select 'sin «medicion» en lo enviado conserva la que había (debe 4): ' || (paraclinicos -> 1 -> 'medicion' -> 'valores' ->> 'fvc') from public.consultas where id = '22400000-0000-0000-0000-00000000000a';
select public.guardar_resultados('22400000-0000-0000-0000-00000000000a', '[{"id":"libre-espirometria","resultado":"","estado":"","medicion":null}]') \g /dev/null
select 'con null la borra: queda opcional y en blanco (debe 0): ' || count(*) from public.consultas where id = '22400000-0000-0000-0000-00000000000a' and paraclinicos -> 1 ? 'medicion';
do $$ begin
  perform public.guardar_resultados('22400000-0000-0000-0000-00000000000a', '[{"id":"libre-goniometria","medicion":{"tipo":"otra"}}]');
  raise notice 'FALLA: aceptó una medición de tipo inventado';
exception when others then
  if sqlerrm like '%inválidos%' then raise notice 'tipo de medición inventado rechazado (debe 1): 1'; else raise notice 'FALLA: %', sqlerrm; end if;
end $$;
do $$ begin
  perform public.guardar_resultados('22400000-0000-0000-0000-00000000000a', jsonb_build_array(jsonb_build_object('id','libre-goniometria','medicion', jsonb_build_object('tipo','goniometria','nota', repeat('x', 20000)))));
  raise notice 'FALLA: aceptó una medición gigante';
exception when others then
  if sqlerrm like '%inválidos%' then raise notice 'medición de más de 16 KB rechazada (debe 1): 1'; else raise notice 'FALLA: %', sqlerrm; end if;
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a3',false) \g /dev/null
do $$ begin
  perform public.guardar_resultados('22400000-0000-0000-0000-00000000000a', '[{"id":"libre-goniometria","resultado":"x"}]');
  raise notice 'FALLA: RR. HH. escribió una medición';
exception when others then
  raise notice 'RR. HH. no escribe mediciones (debe 1): 1';
end $$;
reset role;
delete from clinico.consultas where id = '22400000-0000-0000-0000-00000000000a';
