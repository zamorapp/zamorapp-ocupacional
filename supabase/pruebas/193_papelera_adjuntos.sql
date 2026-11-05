-- Papelera de 30 días de los archivos clínicos (Cesar, 04-nov), sobre la papelera general: borrar no pierde nada,
-- el médico restaura desde la ficha, RR. HH. no, la consulta firmada no se toca y la purga solo quita lo vencido.
\pset tuples_only on
reset role;
select set_config('request.jwt.claim.sub','',false) \g /dev/null
insert into clinico.consultas (id,org_id,empresa_id,trabajador_id,estado,fecha,paraclinicos) values
 ('4f930000-0000-0000-0000-00000000000a','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a','30000000-0000-0000-0000-00000000000a','cerrada',public.hoy_caracas(),
  '[{"id":"hb","nombre":"Hemoglobina","grupo":null,"resultado":""}]');

set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false) \g /dev/null
insert into public.adjuntos (id,org_id,trabajador_id,consulta_id,nombre,ruta,tipo_mime,tamano,examenes) values
  ('4f930000-0000-0000-0000-0000000000f1','10000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-00000000000a','4f930000-0000-0000-0000-00000000000a',
   'hb-193.pdf','10000000-0000-0000-0000-000000000001/30000000-0000-0000-0000-00000000000a/p193.pdf','application/pdf',1000,'{hb}');
select public.eliminar_adjunto('4f930000-0000-0000-0000-0000000000f1') \g /dev/null
select 'el médico borra: sale de la consulta (debe 0): ' || count(*) from public.adjuntos where id = '4f930000-0000-0000-0000-0000000000f1';
select 'y queda en la papelera del trabajador (debe 1): ' || count(*) from public.adjuntos_en_papelera('30000000-0000-0000-0000-00000000000a') where nombre = 'hb-193.pdf';

-- RR. HH. no ve la papelera ni restaura
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a3',false) \g /dev/null
select 'RR. HH. no ve la papelera (debe 0): ' || count(*) from public.adjuntos_en_papelera('30000000-0000-0000-0000-00000000000a');
do $$ begin
  perform public.restaurar_papelera((select id from public.papelera where objeto_id = '4f930000-0000-0000-0000-0000000000f1'));
  raise notice 'FALLA: RR. HH. restauró un archivo clínico';
exception when others then
  if sqlerrm like '%no existe%' or sqlerrm like '%Solo el administrador%' then raise notice 'RR. HH. no restaura (debe 1): 1'; else raise notice 'FALLA: %', sqlerrm; end if;
end $$;

-- El médico restaura desde la ficha: misma fila y mismo examen ligado
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false) \g /dev/null
select public.restaurar_papelera((select id from public.adjuntos_en_papelera('30000000-0000-0000-0000-00000000000a') where nombre = 'hb-193.pdf')) \g /dev/null
select 'restaurado con su examen (debe 1): ' || count(*) from public.adjuntos where id = '4f930000-0000-0000-0000-0000000000f1' and examenes = '{hb}' and consulta_id = '4f930000-0000-0000-0000-00000000000a';
select 'ya no está en la papelera (debe 0): ' || count(*) from public.adjuntos_en_papelera('30000000-0000-0000-0000-00000000000a');

-- Consulta firmada: ni se borra ni se le devuelve un archivo
select public.eliminar_adjunto('4f930000-0000-0000-0000-0000000000f1', 'Prueba de firmada') \g /dev/null
reset role;
update clinico.consultas set estado = 'firmada' where id = '4f930000-0000-0000-0000-00000000000a';
set role authenticated;
do $$ begin
  perform public.restaurar_papelera((select id from public.adjuntos_en_papelera('30000000-0000-0000-0000-00000000000a') limit 1));
  raise notice 'FALLA: devolvió un archivo a una consulta firmada';
exception when others then
  if sqlerrm like '%ya está firmada%' then raise notice 'no vuelve a una consulta firmada (debe 1): 1'; else raise notice 'FALLA: %', sqlerrm; end if;
end $$;

-- Purga: lo de hace 31 días sale; lo de hoy no
reset role;
update public.papelera set eliminado_en = now() - interval '31 days' where objeto_id = '4f930000-0000-0000-0000-0000000000f1';
set role authenticated;
select 'vencidos para quitar del almacenamiento (debe 1): ' || count(*) from public.adjuntos_vencidos(200) where ruta like '%/p193.pdf';
select 'tras 30 días ya no se ofrece restaurar (debe 0): ' || count(*) from public.adjuntos_en_papelera('30000000-0000-0000-0000-00000000000a');
select 'purga lo vencido (debe 1): ' || public.purgar_adjuntos(array(select id from public.adjuntos_vencidos(200) where ruta like '%/p193.pdf'));
select 'nada queda por purgar (debe 0): ' || count(*) from public.adjuntos_vencidos(200) where ruta like '%/p193.pdf';

-- Limpieza
reset role;
delete from public.papelera where objeto_id::text like '4f93%';
delete from clinico.consultas where id = '4f930000-0000-0000-0000-00000000000a';
