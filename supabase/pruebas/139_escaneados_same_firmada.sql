-- Escaneados del SAME: entran a su consulta importada aunque esté firmada (solo admin o gerente médico, solo alta,
-- con la marca [SAME …] y sin exámenes). Cualquier otro archivo a una consulta firmada sigue rechazado.
\pset tuples_only on
reset role;
select set_config('request.jwt.claim.sub','',false) \g /dev/null
insert into public.importaciones (id,org_id,origen,etapa) values ('13900000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','integral','historial');
insert into clinico.consultas (id,org_id,empresa_id,trabajador_id,estado,fecha,origen,codigo_origen,lote_importacion) values
 ('4e000000-0000-0000-0000-0000000139a1','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a','30000000-0000-0000-0000-00000000000a','firmada','2020-01-15','integral','139-1','13900000-0000-0000-0000-000000000001'),
 ('4e000000-0000-0000-0000-0000000139a2','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a','30000000-0000-0000-0000-00000000000a','firmada',public.hoy_caracas(),null,null,null),
 ('4e000000-0000-0000-0000-0000000139a3','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a','30000000-0000-0000-0000-00000000000a','cerrada',public.hoy_caracas(),null,null,null);

set role authenticated;
-- Administrador
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false) \g /dev/null
with x as (insert into public.adjuntos (org_id,trabajador_id,consulta_id,nombre,ruta,tipo_mime,tamano,descripcion) values
  ('10000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-00000000000a','4e000000-0000-0000-0000-0000000139a1','rx.jpg','10000000-0000-0000-0000-000000000001/30000000-0000-0000-0000-00000000000a/same-139-1.jpg','image/jpeg',1000,'[SAME recdig:7] Rx de tórax') returning 1)
select 'el escaneado del SAME entra a su consulta importada firmada (debe 1): ' || count(*) from x;
do $$ begin
  insert into public.adjuntos (org_id,trabajador_id,consulta_id,nombre,ruta,tipo_mime,tamano,descripcion) values
   ('10000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-00000000000a','4e000000-0000-0000-0000-0000000139a1','x.pdf','10000000-0000-0000-0000-000000000001/30000000-0000-0000-0000-00000000000a/same-139-2.pdf','application/pdf',10,'otro archivo');
  raise notice 'FALLA: entró un archivo sin la marca del SAME a una consulta firmada';
exception when others then
  if sqlerrm like '%firmada%' then raise notice 'sin la marca [SAME] sigue rechazado (debe 1): 1'; else raise notice 'FALLA: %', sqlerrm; end if;
end $$;
do $$ begin
  insert into public.adjuntos (org_id,trabajador_id,consulta_id,nombre,ruta,tipo_mime,tamano,descripcion) values
   ('10000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-00000000000a','4e000000-0000-0000-0000-0000000139a2','x.pdf','10000000-0000-0000-0000-000000000001/30000000-0000-0000-0000-00000000000a/same-139-3.pdf','application/pdf',10,'[SAME falso]');
  raise notice 'FALLA: entró a una consulta firmada que no viene del SAME';
exception when others then
  if sqlerrm like '%firmada%' then raise notice 'consulta firmada de zamorApp: rechazado aunque diga [SAME] (debe 1): 1'; else raise notice 'FALLA: %', sqlerrm; end if;
end $$;
do $$ begin
  update public.adjuntos set descripcion = '[SAME recdig:7] cambiado' where ruta like '%/same-139-1.jpg';
  raise notice 'FALLA: cambió un escaneado de una consulta firmada';
exception when others then
  if sqlerrm like '%firmada%' then raise notice 'ya subido: no se cambia (debe 1): 1'; else raise notice 'FALLA: %', sqlerrm; end if;
end $$;
do $$ begin
  delete from public.adjuntos where ruta like '%/same-139-1.jpg';
  if found then raise notice 'FALLA: borró un escaneado de una consulta firmada'; else raise notice 'ya subido: no se borra (debe 1): 1'; end if;
exception when others then
  if sqlerrm like '%firmada%' then raise notice 'ya subido: no se borra (debe 1): 1'; else raise notice 'FALLA: %', sqlerrm; end if;
end $$;
-- Médico (no es admin ni gerente médico): no
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false) \g /dev/null
do $$ begin
  insert into public.adjuntos (org_id,trabajador_id,consulta_id,nombre,ruta,tipo_mime,tamano,descripcion) values
   ('10000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-00000000000a','4e000000-0000-0000-0000-0000000139a1','m.pdf','10000000-0000-0000-0000-000000000001/30000000-0000-0000-0000-00000000000a/same-139-4.pdf','application/pdf',10,'[SAME recdig:8]');
  raise notice 'FALLA: el médico subió a una consulta firmada';
exception when others then
  if sqlerrm like '%firmada%' then raise notice 'el médico no sube a una consulta firmada aunque sea del SAME (debe 1): 1'; else raise notice 'FALLA: %', sqlerrm; end if;
end $$;
-- El médico no puede fabricar una consulta «del SAME»: ni al crearla ni al editarla
update public.consultas set origen = 'integral', codigo_origen = 'falso', lote_importacion = '13900000-0000-0000-0000-000000000001'
 where id = '4e000000-0000-0000-0000-0000000139a3';
select 'el médico no pone origen al editar (debe 1): ' || count(*) from public.consultas
 where id = '4e000000-0000-0000-0000-0000000139a3' and origen is null and codigo_origen is null and lote_importacion is null;
with x as (insert into public.consultas (id,org_id,empresa_id,trabajador_id,estado,fecha,origen,codigo_origen,lote_importacion) values
  ('4e000000-0000-0000-0000-0000000139a4','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a','30000000-0000-0000-0000-00000000000a','borrador',public.hoy_caracas(),'integral','falso-2','13900000-0000-0000-0000-000000000001')
  returning origen, codigo_origen, lote_importacion)
select 'el médico no pone origen al crear (debe 1): ' || count(*) from x where origen is null and codigo_origen is null and lote_importacion is null;
reset role;
-- La importación (sin sesión) sí lo pone
select set_config('request.jwt.claim.sub','',false) \g /dev/null
update clinico.consultas set origen = 'integral', codigo_origen = '139-3' where id = '4e000000-0000-0000-0000-0000000139a3';
select 'la importación sin sesión sí pone el origen (debe 1): ' || count(*) from clinico.consultas where id = '4e000000-0000-0000-0000-0000000139a3' and origen = 'integral';
