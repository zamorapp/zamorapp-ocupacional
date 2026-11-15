-- Identificación de riesgos por puesto y mapa de riesgos (Cesar, 06-nov): roles, empresa asignada, puestos de la misma
-- empresa, la empresa solo ve las cerradas por su vista (sin observaciones), cerrada inmutable, plano en su carpeta,
-- réplica de escritorio y catálogos sembrados (motivos, agentes nuevos y preguntas con su fuente).
\pset tuples_only on
reset role;
select set_config('request.jwt.claim.sub','',false) \g /dev/null
select 'tabla en la réplica de escritorio, no clínica (debe 1): ' || count(*) from sync.tablas where nombre='public.evaluaciones_riesgos' and not clinica and subible;
select 'preguntas generales con agente y fuente (debe 56): ' || count(*) from public.lista_items
 where lista='pregunta_riesgo' and org_id is null and texto like 'Agente: %' and texto like '%Fuente: %';
select 'preguntas de oficina con agente y fuente (debe 27): ' || count(*) from public.lista_items
 where lista='pregunta_riesgo_oficina' and org_id is null and texto like 'Agente: %' and texto like '%Fuente: %';
select 'cada pregunta en uno de los seis grupos (debe 0): ' || count(*) from public.lista_items
 where lista in ('pregunta_riesgo','pregunta_riesgo_oficina') and grupo not in ('fisico','quimico','biologico','mecanico','disergonomico','psicosocial');
select 'la organización recibe su copia editable (debe 93): ' || count(*) from public.lista_items
 where org_id='10000000-0000-0000-0000-000000000001' and base_id is not null
   and lista in ('pregunta_riesgo','pregunta_riesgo_oficina','motivo_identificacion_riesgo');
select 'agentes de seguridad nuevos (debe 5): ' || count(*) from public.lista_items
 where lista='agente_riesgo' and org_id is null and orden between 201 and 205;
select public.sembrar_identificacion_riesgos_2026() \g /dev/null
select 'repetir la siembra no duplica (debe 93): ' || count(*) from public.lista_items
 where org_id='10000000-0000-0000-0000-000000000001' and lista in ('pregunta_riesgo','pregunta_riesgo_oficina','motivo_identificacion_riesgo');

insert into public.puestos (id, org_id, empresa_id, nombre) values
 ('22100000-0000-0000-0000-0000000000a1','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a','Soldador 221'),
 ('22100000-0000-0000-0000-0000000000b1','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000b','Chofer 221');

set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false) \g /dev/null
insert into public.evaluaciones_riesgos (id, org_id, empresa_id, titulo, motivo, participantes, puestos, filas, mapa, evaluado_por) values
 ('22100000-0000-0000-0000-0000000000e1','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a','Taller 221','Inicio del programa','Comité',
  '[{"clave":"22100000-0000-0000-0000-0000000000a1","puestoId":"22100000-0000-0000-0000-0000000000a1","puesto":"Soldador 221","area":"Taller","expuestos":3}]',
  '[{"id":"r1","puestoId":"22100000-0000-0000-0000-0000000000a1","puesto":"Soldador 221","grupo":"fisico","agente":"Radiación no ionizante","p":4,"s":4}]',
  '{"plano":null,"marcas":[{"id":"m1","x":10,"y":20,"filaId":"r1"}],"areas":[]}','00000000-0000-0000-0000-0000000000a1');
select 'médico A crea en A y queda como evaluador aunque mande otro (debe 1): ' || count(*) from public.evaluaciones_riesgos
 where id='22100000-0000-0000-0000-0000000000e1' and evaluado_por='00000000-0000-0000-0000-0000000000a2' and tipo='general';
do $$ begin
  insert into public.evaluaciones_riesgos (org_id, empresa_id, titulo) values
   ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000b','B');
  raise notice 'médico A evalúa en B: FALLA';
exception when insufficient_privilege then null; end $$;
do $$ begin
  update public.evaluaciones_riesgos set filas='[{"id":"r2","puestoId":"22100000-0000-0000-0000-0000000000b1","puesto":"Chofer","grupo":"fisico","agente":"Ruido"}]'
   where id='22100000-0000-0000-0000-0000000000e1';
  raise notice 'riesgo en un puesto de otra empresa: FALLA';
exception when check_violation then null; end $$;
do $$ begin
  update public.evaluaciones_riesgos set puestos='[{"clave":"x","puestoId":"22100000-0000-0000-0000-0000000000b1","puesto":"Chofer"}]'
   where id='22100000-0000-0000-0000-0000000000e1';
  raise notice 'puesto de otra empresa en la lista de puestos: FALLA';
exception when check_violation then null; end $$;
do $$ begin
  update public.evaluaciones_riesgos set mapa='{"plano":"10000000-0000-0000-0000-000000000001/otra/plano.jpg","marcas":[],"areas":[]}'
   where id='22100000-0000-0000-0000-0000000000e1';
  raise notice 'plano fuera de la carpeta de la evaluación: FALLA';
exception when check_violation then null; end $$;
do $$ begin
  insert into public.evaluaciones_riesgos (org_id, empresa_id, titulo, tipo) values
   ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a','X','bodega');
  raise notice 'tipo desconocido: FALLA';
exception when check_violation then null; end $$;

-- Plano: sube a su evaluación en borrador; a una inventada, no
insert into storage.objects (bucket_id, name) values ('mapas-riesgo', '10000000-0000-0000-0000-000000000001/22100000-0000-0000-0000-0000000000e1/plano.jpg');
select 'plano subido a la evaluación en borrador (debe 1): ' || count(*) from storage.objects where bucket_id='mapas-riesgo';
do $$ begin
  insert into storage.objects (bucket_id, name) values ('mapas-riesgo', '10000000-0000-0000-0000-000000000001/22100000-0000-0000-0000-0000000000ff/plano.jpg');
  raise notice 'plano a evaluación inexistente: FALLA';
exception when insufficient_privilege then null; end $$;
update public.evaluaciones_riesgos set mapa='{"plano":"10000000-0000-0000-0000-000000000001/22100000-0000-0000-0000-0000000000e1/plano.jpg","marcas":[{"id":"m1","x":10,"y":20,"filaId":"r1"}],"areas":[]}'
 where id='22100000-0000-0000-0000-0000000000e1';

-- La empresa no ve el borrador ni puede escribir
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a3',false) \g /dev/null
select 'RR. HH. no ve el borrador (debe 0): ' || ((select count(*) from public.evaluaciones_riesgos) + (select count(*) from public.evaluaciones_riesgos_rrhh));
select 'RR. HH. no ve el plano del borrador (debe 0): ' || count(*) from storage.objects where bucket_id='mapas-riesgo';
do $$ begin
  insert into public.evaluaciones_riesgos (org_id, empresa_id, titulo) values
   ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a','X');
  raise notice 'RR. HH. crea evaluación: FALLA';
exception when insufficient_privilege then null; end $$;

-- Se cierra: la empresa la ve por su vista con el plano; ya no cambia salvo observaciones
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false) \g /dev/null
update public.evaluaciones_riesgos set estado='cerrada', conclusion='Riesgo alto por radiación', observaciones='interno' where id='22100000-0000-0000-0000-0000000000e1';
select 'cerrada con fecha de cierre (debe 1): ' || count(*) from public.evaluaciones_riesgos where estado='cerrada' and cerrada_en = public.hoy_caracas();
do $$ begin
  update public.evaluaciones_riesgos set filas='[]' where id='22100000-0000-0000-0000-0000000000e1';
  raise notice 'cambiar riesgos de una cerrada: FALLA';
exception when insufficient_privilege then null; end $$;
do $$ begin
  update public.evaluaciones_riesgos set estado='borrador' where id='22100000-0000-0000-0000-0000000000e1';
  raise notice 'el médico reabre: FALLA';
exception when insufficient_privilege then null; end $$;
do $$ begin
  delete from public.evaluaciones_riesgos where id='22100000-0000-0000-0000-0000000000e1';
  raise notice 'borrar una cerrada: FALLA';
exception when insufficient_privilege then null; end $$;
do $$ begin
  insert into storage.objects (bucket_id, name) values ('mapas-riesgo', '10000000-0000-0000-0000-000000000001/22100000-0000-0000-0000-0000000000e1/otro.jpg');
  raise notice 'plano nuevo a una cerrada: FALLA';
exception when insufficient_privilege then null; end $$;
update public.evaluaciones_riesgos set observaciones='Entregada al Comité' where id='22100000-0000-0000-0000-0000000000e1';
select 'observaciones en la cerrada (debe 1): ' || count(*) from public.evaluaciones_riesgos where observaciones='Entregada al Comité';

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a3',false) \g /dev/null
select 'RR. HH. no lee la tabla (debe 0): ' || count(*) from public.evaluaciones_riesgos;
select 'RR. HH. ve la cerrada en su vista con riesgos y mapa (debe 1): ' || count(*) from public.evaluaciones_riesgos_rrhh
 where id='22100000-0000-0000-0000-0000000000e1' and jsonb_array_length(filas)=1 and jsonb_array_length(mapa->'marcas')=1;
select 'RR. HH. ve el plano de la cerrada (debe 1): ' || count(*) from storage.objects where bucket_id='mapas-riesgo';
select 'la vista de la empresa no tiene observaciones (debe 0): ' || count(*) from information_schema.columns
 where table_schema='public' and table_name='evaluaciones_riesgos_rrhh' and column_name='observaciones';
do $$ begin
  update public.evaluaciones_riesgos set observaciones='x';
  if found then raise notice 'RR. HH. cambia la evaluación: FALLA'; end if;
end $$;

-- El administrador reabre; el evaluador no cambia
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false) \g /dev/null
update public.evaluaciones_riesgos set estado='borrador' where id='22100000-0000-0000-0000-0000000000e1';
update public.evaluaciones_riesgos set titulo='Taller 221 corregido' where id='22100000-0000-0000-0000-0000000000e1';
select 'reabierta y corregida, el evaluador no cambia (debe 1): ' || count(*) from public.evaluaciones_riesgos
 where estado='borrador' and cerrada_en is null and titulo='Taller 221 corregido' and evaluado_por='00000000-0000-0000-0000-0000000000a2';
reset role;
select 'queda en la bitácora (debe 1): ' || (count(*) > 0)::int from public.bitacora where tabla='public.evaluaciones_riesgos';
delete from storage.objects where bucket_id='mapas-riesgo';
delete from public.evaluaciones_riesgos where id='22100000-0000-0000-0000-0000000000e1';
delete from public.puestos where id in ('22100000-0000-0000-0000-0000000000a1','22100000-0000-0000-0000-0000000000b1');
