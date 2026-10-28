-- Consulta ágil: potencial discapacidad al guardar y duplicar una consulta (mismas reglas de acceso).
\pset tuples_only on
reset role;
insert into clinico.consultas (id,org_id,empresa_id,trabajador_id,estado,fecha,medico_id) values
 ('40000000-0000-0000-0000-0000000000d1','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a','30000000-0000-0000-0000-00000000000a','borrador',public.hoy_caracas() - 30,'00000000-0000-0000-0000-0000000000a2');
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false) \g /dev/null
select public.guardar_consulta('40000000-0000-0000-0000-0000000000d1',
  '{"tipo":"primera","conclusiones":"control","signos_vitales":{"ta":"150/95"},"paraclinicos":[{"id":"x","nombre":"Glicemia","grupo":null,"resultado":"110"}],"potencial_discapacidad":true,"discapacidad_nota":"lumbalgia crónica"}',
  '[{"cie10":"M54","descripcion":"Lumbago","origen":"ocupacional","principal":true}]',
  '{"clasificacion":"elegible_con_restricciones","observacion":"","limitaciones":[],"vigente_hasta":null}',
  json_build_object('causa','enfermedad_comun','ente','servicio_medico','desde',public.hoy_caracas()-30,'hasta',public.hoy_caracas()-20)::jsonb, true);
select 'potencial discapacidad guardada (debe 1): ' || count(*) from public.consultas where id='40000000-0000-0000-0000-0000000000d1' and potencial_discapacidad and discapacidad_nota='lumbalgia crónica';
select public.duplicar_consulta('40000000-0000-0000-0000-0000000000d1') is not null \g /dev/null
select 'duplicada en borrador de hoy (debe 1): ' || count(*) from public.consultas where duplicada_de='40000000-0000-0000-0000-0000000000d1' and estado='borrador' and fecha=(now() at time zone 'America/Caracas')::date and tipo='sucesiva';
select 'copia conclusiones y discapacidad, no signos (debe 1): ' || count(*) from public.consultas where duplicada_de='40000000-0000-0000-0000-0000000000d1' and conclusiones='control' and potencial_discapacidad and signos_vitales='{}'::jsonb;
select 'paraclínicos sin resultado (debe 1): ' || count(*) from public.consultas where duplicada_de='40000000-0000-0000-0000-0000000000d1' and paraclinicos->0->>'resultado'='' and paraclinicos->0->>'nombre'='Glicemia';
select 'copia diagnósticos (debe 1): ' || count(*) from public.diagnosticos d join public.consultas c on c.id=d.consulta_id where c.duplicada_de='40000000-0000-0000-0000-0000000000d1' and d.cie10='M54';
select 'sin aptitud ni reposo (debe 0): ' || ((select count(*) from public.aptitudes a join public.consultas c on c.id=a.consulta_id where c.duplicada_de='40000000-0000-0000-0000-0000000000d1') + (select count(*) from public.reposos r join public.consultas c on c.id=r.consulta_id where c.duplicada_de='40000000-0000-0000-0000-0000000000d1'));
select 'autor de la copia es quien duplica (debe 1): ' || count(*) from public.consultas where duplicada_de='40000000-0000-0000-0000-0000000000d1' and medico_id='00000000-0000-0000-0000-0000000000a2';
-- Datos importados con paraclinicos como objeto: duplicar no falla
reset role;
update clinico.consultas set paraclinicos='{}' where id='40000000-0000-0000-0000-0000000000d1';
set role authenticated;
select 'duplica con paraclínicos no arreglo (debe 1): ' || count(*) from (select public.duplicar_consulta('40000000-0000-0000-0000-0000000000d1') as id) x where x.id is not null;
-- RR. HH. de la empresa y médico de otra organización no pueden duplicar
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a3',false) \g /dev/null
do $$ begin perform public.duplicar_consulta('40000000-0000-0000-0000-0000000000d1'); raise notice 'RRHH duplicó: FALLA'; exception when others then raise notice 'RRHH rechazado (ok): %', sqlerrm; end $$;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false) \g /dev/null
do $$ begin perform public.duplicar_consulta('40000000-0000-0000-0000-00000000000b'); raise notice 'Medico-A duplicó consulta de B: FALLA'; exception when others then raise notice 'Medico-A en consulta de B rechazado (ok): %', sqlerrm; end $$;
set role anon;
do $$ begin perform public.duplicar_consulta('40000000-0000-0000-0000-0000000000d1'); raise notice 'anon: FALLA'; exception when others then raise notice 'anon rechazado (ok)'; end $$;
reset role;
select 'modelos de informe libre sembrados (debe 3): ' || count(*) from public.lista_items where lista='modelo_informe_libre' and org_id is null;
