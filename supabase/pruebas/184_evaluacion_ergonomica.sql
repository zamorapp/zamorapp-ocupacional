-- Evaluación ergonómica de puestos (Cesar, 04-nov): roles, empresa asignada, puesto de la misma empresa,
-- RR. HH. solo ve las cerradas, cerrada inmutable (salvo observaciones o reabrir por administrador), fotos y réplica.
\pset tuples_only on
reset role;
select set_config('request.jwt.claim.sub','',false) \g /dev/null
select 'tabla en la réplica de escritorio, no clínica (debe 1): ' || count(*) from sync.tablas where nombre='public.evaluaciones_ergonomicas' and not clinica and subible;
insert into public.puestos (id, org_id, empresa_id, nombre) values
 ('18400000-0000-0000-0000-0000000000a1','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a','Cajera 184'),
 ('18400000-0000-0000-0000-0000000000b1','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000b','Chofer 184');

set role authenticated;
-- Médico de A evalúa en A; no en B; el puesto debe ser de la empresa
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false) \g /dev/null
insert into public.evaluaciones_ergonomicas (id, org_id, empresa_id, puesto_id, puesto, metodo, datos, resultado, hallazgos, evaluado_por) values
 ('18400000-0000-0000-0000-0000000000e1','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a','18400000-0000-0000-0000-0000000000a1','Cajera 184','rula',
  '{"brazo":3}','{"puntaje":6}','[{"id":"h1","factor":"Postura de hombro","p":4,"s":3,"departamento":"ingenieria"}]','00000000-0000-0000-0000-0000000000a1');
select 'médico A crea en A y queda como evaluador aunque mande otro (debe 1): ' || count(*) from public.evaluaciones_ergonomicas
 where id='18400000-0000-0000-0000-0000000000e1' and evaluado_por='00000000-0000-0000-0000-0000000000a2';
do $$ begin
  insert into public.evaluaciones_ergonomicas (org_id, empresa_id, puesto, metodo) values
   ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000b','Chofer','reba');
  raise notice 'médico A evalúa en B: FALLA';
exception when insufficient_privilege then null; end $$;
do $$ begin
  insert into public.evaluaciones_ergonomicas (org_id, empresa_id, puesto_id, puesto, metodo) values
   ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a','18400000-0000-0000-0000-0000000000b1','Chofer','reba');
  raise notice 'puesto de otra empresa: FALLA';
exception when check_violation then null; end $$;
do $$ begin
  insert into public.evaluaciones_ergonomicas (org_id, empresa_id, puesto, metodo) values
   ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a','X','owas');
  raise notice 'método desconocido: FALLA';
exception when check_violation then null; end $$;

-- Fotos: el médico sube a su evaluación en borrador; a una ruta inventada, no
insert into storage.objects (bucket_id, name) values ('ergonomia', '10000000-0000-0000-0000-000000000001/18400000-0000-0000-0000-0000000000e1/foto.jpg');
select 'foto subida a la evaluación en borrador (debe 1): ' || count(*) from storage.objects where bucket_id='ergonomia';
do $$ begin
  insert into storage.objects (bucket_id, name) values ('ergonomia', '10000000-0000-0000-0000-000000000001/18400000-0000-0000-0000-0000000000ff/foto.jpg');
  raise notice 'foto a evaluación inexistente: FALLA';
exception when insufficient_privilege then null; end $$;

-- RR. HH. de A no ve el borrador ni puede escribir
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a3',false) \g /dev/null
select 'RR. HH. no ve el borrador (debe 0): ' || count(*) from public.evaluaciones_ergonomicas;
select 'RR. HH. no ve la foto del borrador (debe 0): ' || count(*) from storage.objects where bucket_id='ergonomia';
do $$ begin
  insert into public.evaluaciones_ergonomicas (org_id, empresa_id, puesto, metodo) values
   ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a','X','rula');
  raise notice 'RR. HH. crea evaluación: FALLA';
exception when insufficient_privilege then null; end $$;

-- El médico la cierra: RR. HH. la ve; ya no se cambia ni se borra, salvo observaciones
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false) \g /dev/null
update public.evaluaciones_ergonomicas set estado='cerrada', conclusion='Riesgo alto en hombro' where id='18400000-0000-0000-0000-0000000000e1';
select 'cerrada con fecha de cierre (debe 1): ' || count(*) from public.evaluaciones_ergonomicas where estado='cerrada' and cerrada_en = public.hoy_caracas();
do $$ begin
  update public.evaluaciones_ergonomicas set hallazgos='[]' where id='18400000-0000-0000-0000-0000000000e1';
  raise notice 'cambiar hallazgos de una cerrada: FALLA';
exception when insufficient_privilege then null; end $$;
do $$ begin
  update public.evaluaciones_ergonomicas set estado='borrador' where id='18400000-0000-0000-0000-0000000000e1';
  raise notice 'el médico reabre: FALLA';
exception when insufficient_privilege then null; end $$;
do $$ begin
  delete from public.evaluaciones_ergonomicas where id='18400000-0000-0000-0000-0000000000e1';
  raise notice 'borrar una cerrada: FALLA';
exception when insufficient_privilege then null; end $$;
update public.evaluaciones_ergonomicas set observaciones='Entregada a Ingeniería' where id='18400000-0000-0000-0000-0000000000e1';
select 'observaciones en la cerrada (debe 1): ' || count(*) from public.evaluaciones_ergonomicas where observaciones='Entregada a Ingeniería';
do $$ begin
  insert into storage.objects (bucket_id, name) values ('ergonomia', '10000000-0000-0000-0000-000000000001/18400000-0000-0000-0000-0000000000e1/otra.jpg');
  raise notice 'foto nueva a una cerrada: FALLA';
exception when insufficient_privilege then null; end $$;

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a3',false) \g /dev/null
select 'RR. HH. ve la cerrada y su foto (debe 2): ' || ((select count(*) from public.evaluaciones_ergonomicas) + (select count(*) from storage.objects where bucket_id='ergonomia'));
do $$ begin
  update public.evaluaciones_ergonomicas set observaciones='x';
  if found then raise notice 'RR. HH. cambia la evaluación: FALLA'; end if;
end $$;

-- El administrador reabre (sin tocar nada más) y corrige
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false) \g /dev/null
update public.evaluaciones_ergonomicas set estado='borrador' where id='18400000-0000-0000-0000-0000000000e1';
update public.evaluaciones_ergonomicas set tarea='Cobro en caja' where id='18400000-0000-0000-0000-0000000000e1';
select 'reabierta y corregida, el evaluador no cambia (debe 1): ' || count(*) from public.evaluaciones_ergonomicas
 where estado='borrador' and cerrada_en is null and tarea='Cobro en caja' and evaluado_por='00000000-0000-0000-0000-0000000000a2';
reset role;
select 'queda en la bitácora (debe 1): ' || (count(*) > 0)::int from public.bitacora where tabla='public.evaluaciones_ergonomicas';
delete from storage.objects where bucket_id='ergonomia';
delete from public.evaluaciones_ergonomicas where id='18400000-0000-0000-0000-0000000000e1';
delete from public.puestos where id in ('18400000-0000-0000-0000-0000000000a1','18400000-0000-0000-0000-0000000000b1');
