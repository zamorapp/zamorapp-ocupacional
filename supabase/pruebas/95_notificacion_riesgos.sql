-- Notificación de riesgos: roles que la registran, empresa asignada, coherencia trabajador-empresa y réplica.
\pset tuples_only on
reset role;
select set_config('request.jwt.claim.sub','',false) \g /dev/null
select 'tabla en la réplica de escritorio (debe 1): ' || count(*) from sync.tablas where nombre='public.notificaciones_riesgo' and not clinica;

set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false) \g /dev/null
insert into public.notificaciones_riesgo (org_id,empresa_id,trabajador_id,puesto,contenido) values
 ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a','30000000-0000-0000-0000-00000000000a','Operador','{"riesgos":[]}');
select 'médico A registra en A (debe 1): ' || count(*) from public.notificaciones_riesgo;
do $$ begin
  insert into public.notificaciones_riesgo (org_id,empresa_id,trabajador_id,puesto) values
   ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000b','30000000-0000-0000-0000-00000000000b','Chofer');
  raise notice 'médico A registra en B: FALLA';
exception when insufficient_privilege then raise notice 'médico A no registra en B (ok)'; end $$;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false) \g /dev/null
do $$ begin
  insert into public.notificaciones_riesgo (org_id,empresa_id,trabajador_id,puesto) values
   ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000b','30000000-0000-0000-0000-00000000000a','Operador');
  raise notice 'trabajador de otra empresa: FALLA';
exception when check_violation then raise notice 'trabajador de otra empresa rechazado (ok)'; end $$;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a3',false) \g /dev/null
select 'RRHH de A la ve (debe 1): ' || count(*) from public.notificaciones_riesgo;
do $$ begin
  update public.notificaciones_riesgo set firmada_en=current_date;
  if found then raise notice 'RRHH firma: FALLA'; else raise notice 'RRHH no cambia la notificación (ok)'; end if;
end $$;
-- Autor fijo y acuse inmutable
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false) \g /dev/null
insert into public.notificaciones_riesgo (id,org_id,empresa_id,trabajador_id,puesto,entregada_por) values
 ('70000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a','30000000-0000-0000-0000-00000000000a','Operador','00000000-0000-0000-0000-0000000000a1');
select 'el autor es quien registra (debe 1): ' || count(*) from public.notificaciones_riesgo where id='70000000-0000-0000-0000-000000000001' and entregada_por='00000000-0000-0000-0000-0000000000a2';
update public.notificaciones_riesgo set firmada_en=current_date where id='70000000-0000-0000-0000-000000000001';
do $$ begin
  update public.notificaciones_riesgo set contenido='{"riesgos":[{"agente":"x"}]}' where id='70000000-0000-0000-0000-000000000001';
  raise notice 'cambiar lo notificado tras el acuse: FALLA';
exception when insufficient_privilege then raise notice 'lo notificado no cambia tras el acuse (ok)'; end $$;
do $$ begin
  delete from public.notificaciones_riesgo where id='70000000-0000-0000-0000-000000000001';
  raise notice 'borrar con acuse: FALLA';
exception when insufficient_privilege then raise notice 'no se borra con acuse (ok)'; end $$;
update public.notificaciones_riesgo set observaciones='Firmó en presencia del delegado' where id='70000000-0000-0000-0000-000000000001';
select 'observaciones sí cambian (debe 1): ' || count(*) from public.notificaciones_riesgo where observaciones is not null;
reset role;
