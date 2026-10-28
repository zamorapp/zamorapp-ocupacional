-- Paraclínicos digitales: archivos ligados a exámenes, tipos permitidos y resultados con la consulta cerrada.
\pset tuples_only on
reset role;
select set_config('request.jwt.claim.sub','',false) \g /dev/null
insert into clinico.consultas (id,org_id,empresa_id,trabajador_id,estado,fecha,paraclinicos) values
 ('4e000000-0000-0000-0000-00000000000a','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a','30000000-0000-0000-0000-00000000000a','cerrada',public.hoy_caracas(),
  '[{"id":"hb","nombre":"Hemoglobina","grupo":null,"resultado":""},{"id":"rx","nombre":"Rx de tórax","grupo":null,"resultado":""}]'),
 ('4e000000-0000-0000-0000-00000000000f','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a','30000000-0000-0000-0000-00000000000a','firmada',public.hoy_caracas(),
  '[{"id":"hb","nombre":"Hemoglobina","grupo":null,"resultado":""}]');

set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false) \g /dev/null
with x as (insert into public.adjuntos (org_id,trabajador_id,consulta_id,nombre,ruta,tipo_mime,tamano,examenes) values
  ('10000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-00000000000a','4e000000-0000-0000-0000-00000000000a','lab.pdf','10000000-0000-0000-0000-000000000001/30000000-0000-0000-0000-00000000000a/p-lab.pdf','application/pdf',1000,'{hb,hb}') returning examenes)
select 'médico liga el PDF a la hemoglobina (debe 1): ' || cardinality(examenes) from x;
with x as (update public.adjuntos set examenes = '{hb,rx}' where ruta like '%/p-lab.pdf' returning 1)
select 'el mismo PDF sirve a dos exámenes (debe 1): ' || count(*) from x;
do $$ begin
  update public.adjuntos set examenes = '{colesterol}' where ruta like '%/p-lab.pdf';
  raise notice 'FALLA: ligó un examen que no está solicitado';
exception when others then
  if sqlerrm like '%no está solicitado%' then raise notice 'no liga exámenes que no están en la consulta (debe 1): 1'; else raise notice 'FALLA: %', sqlerrm; end if;
end $$;
do $$ begin
  update public.adjuntos set trabajador_id = '30000000-0000-0000-0000-00000000000b' where ruta like '%/p-lab.pdf';
  raise notice 'FALLA: el archivo cambió de trabajador';
exception when others then
  if sqlerrm like '%no cambia de trabajador%' then raise notice 'el archivo no cambia de trabajador (debe 1): 1'; else raise notice 'FALLA: %', sqlerrm; end if;
end $$;
do $$ begin
  insert into public.adjuntos (org_id,trabajador_id,consulta_id,nombre,ruta,tipo_mime,tamano) values
   ('10000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-00000000000b','4e000000-0000-0000-0000-00000000000a','x.pdf','10000000-0000-0000-0000-000000000001/30000000-0000-0000-0000-00000000000b/y.pdf','application/pdf',10);
  raise notice 'FALLA: archivo de otro trabajador en esta consulta';
exception when others then
  if sqlerrm like '%mismo trabajador%' then raise notice 'no mezcla trabajador y consulta (debe 1): 1'; else raise notice 'FALLA: %', sqlerrm; end if;
end $$;
do $$ begin
  insert into public.adjuntos (org_id,trabajador_id,nombre,ruta,tipo_mime,tamano) values
   ('10000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-00000000000a','foto.heic','10000000-0000-0000-0000-000000000001/30000000-0000-0000-0000-00000000000a/f.heic','image/heic',10);
  raise notice 'FALLA: aceptó HEIC';
exception when others then
  if sqlerrm like '%Solo se aceptan%' then raise notice 'solo PDF, JPG o PNG (debe 1): 1'; else raise notice 'FALLA: %', sqlerrm; end if;
end $$;
do $$ begin
  insert into public.adjuntos (org_id,trabajador_id,nombre,ruta,tipo_mime,tamano,examenes) values
   ('10000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-00000000000a','suelto.pdf','10000000-0000-0000-0000-000000000001/30000000-0000-0000-0000-00000000000a/s.pdf','application/pdf',10,'{hb}');
  raise notice 'FALLA: ligó un examen sin consulta';
exception when others then
  if sqlerrm like '%debe estar en la consulta%' then raise notice 'sin consulta no se liga a un examen (debe 1): 1'; else raise notice 'FALLA: %', sqlerrm; end if;
end $$;

-- Resultados con la consulta cerrada
select public.guardar_resultados('4e000000-0000-0000-0000-00000000000a', '[{"id":"hb","resultado":"10.1","estado":"fuera","unidad":"g/dL","referencia":"12–16","nombre":"Cambiado"},{"id":"zz","resultado":"x"}]') \g /dev/null
select 'resultado guardado con la consulta cerrada (debe 1): ' || count(*) from public.consultas
 where id = '4e000000-0000-0000-0000-00000000000a' and paraclinicos -> 0 ->> 'resultado' = '10.1' and paraclinicos -> 0 ->> 'estado' = 'fuera';
select 'no cambia el nombre ni agrega exámenes (debe 2): ' || jsonb_array_length(paraclinicos) from public.consultas
 where id = '4e000000-0000-0000-0000-00000000000a' and paraclinicos -> 0 ->> 'nombre' = 'Hemoglobina';
do $$ begin
  perform public.guardar_resultados('4e000000-0000-0000-0000-00000000000f', '[{"id":"hb","resultado":"13"}]');
  raise notice 'FALLA: cambió resultados de una consulta firmada';
exception when others then
  if sqlerrm like '%firmada%' then raise notice 'firmada: resultados bloqueados (debe 1): 1'; else raise notice 'FALLA: %', sqlerrm; end if;
end $$;
do $$ begin
  perform public.guardar_resultados('4e000000-0000-0000-0000-00000000000a', '[{"id":"hb","estado":"raro"}]');
  raise notice 'FALLA: aceptó un estado inventado';
exception when others then
  if sqlerrm like '%inválido%' then raise notice 'estado inventado rechazado (debe 1): 1'; else raise notice 'FALLA: %', sqlerrm; end if;
end $$;

-- Ruta fuera de la carpeta del trabajador
do $$ begin
  insert into public.adjuntos (org_id,trabajador_id,nombre,ruta,tipo_mime,tamano) values
   ('10000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-00000000000a','x.pdf','10000000-0000-0000-0000-000000000001/30000000-0000-0000-0000-00000000000b/x.pdf','application/pdf',10);
  raise notice 'FALLA: registró un archivo de la carpeta de otro trabajador';
exception when others then
  if sqlerrm like '%no corresponde al trabajador%' then raise notice 'ruta de otro trabajador rechazada (debe 1): 1'; else raise notice 'FALLA: %', sqlerrm; end if;
end $$;

-- Consulta firmada: sus archivos no se religan, borran ni agregan (la importación sin sesión sí los carga)
reset role;
select set_config('request.jwt.claim.sub','',false) \g /dev/null
insert into clinico.adjuntos (org_id,trabajador_id,consulta_id,nombre,ruta,tipo_mime,tamano) values
 ('10000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-00000000000a','4e000000-0000-0000-0000-00000000000f','f.pdf','10000000-0000-0000-0000-000000000001/30000000-0000-0000-0000-00000000000a/firmada.pdf','application/pdf',10);
select 'importación carga el escaneado de una firmada (debe 1): ' || count(*) from clinico.adjuntos where ruta like '%/firmada.pdf';
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false) \g /dev/null
do $$ begin
  update public.adjuntos set examenes = '{hb}' where ruta like '%/firmada.pdf';
  raise notice 'FALLA: religó un archivo de una consulta firmada';
exception when others then
  if sqlerrm like '%firmada%' then raise notice 'firmada: no se religa (debe 1): 1'; else raise notice 'FALLA: %', sqlerrm; end if;
end $$;
do $$ begin
  delete from public.adjuntos where ruta like '%/firmada.pdf';
  raise notice 'FALLA: borró un archivo de una consulta firmada';
exception when others then
  if sqlerrm like '%firmada%' then raise notice 'firmada: no se borra (debe 1): 1'; else raise notice 'FALLA: %', sqlerrm; end if;
end $$;
do $$ begin
  insert into public.adjuntos (org_id,trabajador_id,consulta_id,nombre,ruta,tipo_mime,tamano) values
   ('10000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-00000000000a','4e000000-0000-0000-0000-00000000000f','n.pdf','10000000-0000-0000-0000-000000000001/30000000-0000-0000-0000-00000000000a/n.pdf','application/pdf',10);
  raise notice 'FALLA: agregó un archivo a una consulta firmada';
exception when others then
  if sqlerrm like '%firmada%' then raise notice 'firmada: no se agregan archivos (debe 1): 1'; else raise notice 'FALLA: %', sqlerrm; end if;
end $$;
with x as (delete from public.adjuntos where ruta like '%/p-lab.pdf' returning 1)
select 'consulta cerrada: el archivo sí se borra (debe 1): ' || count(*) from x;

-- RR. HH. no ve ni escribe resultados ni archivos
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a3',false) \g /dev/null
select 'RR. HH. no ve los archivos ligados (debe 0): ' || count(*) from public.adjuntos where cardinality(examenes) > 0;
do $$ begin
  perform public.guardar_resultados('4e000000-0000-0000-0000-00000000000a', '[{"id":"hb","resultado":"1"}]');
  raise notice 'FALLA: RR. HH. escribió un resultado';
exception when others then
  raise notice 'RR. HH. no escribe resultados (debe 1): 1';
end $$;

-- Médico limitado a A no ve archivos de un trabajador de B
reset role;
select set_config('request.jwt.claim.sub','',false) \g /dev/null
insert into clinico.adjuntos (org_id,trabajador_id,nombre,ruta,tipo_mime,tamano) values
 ('10000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-00000000000b','b.pdf','10000000-0000-0000-0000-000000000001/30000000-0000-0000-0000-00000000000b/b.pdf','application/pdf',10);
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false) \g /dev/null
select 'médico de A no ve archivos de B (debe 0): ' || count(*) from public.adjuntos where trabajador_id = '30000000-0000-0000-0000-00000000000b';
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false) \g /dev/null
select 'admin ve archivos de B (debe 1): ' || count(*) from public.adjuntos where trabajador_id = '30000000-0000-0000-0000-00000000000b';
reset role;
