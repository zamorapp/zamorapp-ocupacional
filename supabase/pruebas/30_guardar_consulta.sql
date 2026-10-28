-- Guardar la consulta en una sola operación: completo o nada, y con las mismas reglas de acceso.
\pset tuples_only on
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false) \g /dev/null
select public.guardar_consulta('40000000-0000-0000-0000-00000000000a',
  '{"tipo":"primera","conclusiones":"uno","sano":false,"signos_vitales":{"ta":"120/80"}}',
  '[{"cie10":"J00","descripcion":"Rinofaringitis","origen":"comun","principal":true},{"cie10":"M54","descripcion":"Lumbago","origen":"ocupacional","principal":false}]',
  '{"clasificacion":"elegible_con_restricciones","observacion":"","limitaciones":["No cargar >10 kg"],"vigente_hasta":null}',
  json_build_object('causa','enfermedad_comun','ente','servicio_medico','desde',public.hoy_caracas(),'hasta',public.hoy_caracas()+2,'cie10',null)::jsonb, true);
select 'estado cerrada (debe 1): ' || count(*) from public.consultas where id='40000000-0000-0000-0000-00000000000a' and estado='cerrada' and hora_cierre is not null and signos_vitales->>'ta'='120/80';
select 'diagnosticos (debe 2): ' || count(*) from public.diagnosticos where consulta_id='40000000-0000-0000-0000-00000000000a';
select 'aptitud a 12 meses con restricción (debe 1): ' || count(*) from public.aptitudes where consulta_id='40000000-0000-0000-0000-00000000000a' and vigente_hasta=(public.hoy_caracas() + interval '12 months')::date and restricciones = array['No cargar >10 kg'];
select 'reposo con reintegro y cie10 del 1er diagnóstico (debe 1): ' || count(*) from public.reposos where consulta_id='40000000-0000-0000-0000-00000000000a' and reintegro=public.hoy_caracas()+3 and cie10='J00' and dias=3;
select 'trabajador en reposo (debe 1): ' || count(*) from public.trabajadores where id='30000000-0000-0000-0000-00000000000a' and estado='reposo';
-- reabrir y guardar con un diagnóstico inválido: no debe quedar nada a medias
update public.consultas set estado='borrador' where id='40000000-0000-0000-0000-00000000000a';
do $$ begin perform public.guardar_consulta('40000000-0000-0000-0000-00000000000a','{"tipo":"primera","conclusiones":"dos"}','[{"cie10":"X","descripcion":"x","origen":"INVALIDO"}]',null,null,false);
  raise notice 'guardado inválido aceptado: FALLA'; exception when others then raise notice 'guardado inválido rechazado (ok): %', sqlerrm; end $$;
select 'tras fallo, conclusiones intactas (debe 1): ' || count(*) from public.consultas where id='40000000-0000-0000-0000-00000000000a' and conclusiones='uno';
select 'tras fallo, diagnósticos intactos (debe 2): ' || count(*) from public.diagnosticos where consulta_id='40000000-0000-0000-0000-00000000000a';
select 'tras fallo, aptitud intacta (debe 1): ' || count(*) from public.aptitudes where consulta_id='40000000-0000-0000-0000-00000000000a';
-- guardar sin aptitud ni reposo los quita
select public.guardar_consulta('40000000-0000-0000-0000-00000000000a','{"tipo":"primera","sano":true}','[]',null,null,false);
select 'sin aptitud ni reposo ni diagnósticos (debe 0): ' || ((select count(*) from public.aptitudes where consulta_id='40000000-0000-0000-0000-00000000000a') + (select count(*) from public.reposos where consulta_id='40000000-0000-0000-0000-00000000000a') + (select count(*) from public.diagnosticos where consulta_id='40000000-0000-0000-0000-00000000000a'));
do $$ begin perform public.guardar_consulta('40000000-0000-0000-0000-00000000000b','{"tipo":"primera"}','[]',null,null,false);
  raise notice 'Medico-A guardó consulta de B: FALLA'; exception when others then raise notice 'Medico-A en consulta de B rechazado (ok): %', sqlerrm; end $$;
reset role;
update clinico.consultas set estado='firmada' where id='40000000-0000-0000-0000-00000000000a';
set role authenticated;
do $$ begin perform public.guardar_consulta('40000000-0000-0000-0000-00000000000a','{"tipo":"primera"}','[]',null,null,false);
  raise notice 'firmada modificada: FALLA'; exception when others then raise notice 'firmada rechazada (ok): %', sqlerrm; end $$;
set role anon;
do $$ begin perform public.guardar_consulta('40000000-0000-0000-0000-00000000000a','{}','[]',null,null,false); raise notice 'anon: FALLA'; exception when others then raise notice 'anon rechazado (ok)'; end $$;
