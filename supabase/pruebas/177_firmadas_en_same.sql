-- Consultas del SAME ya firmadas allá: pasan a «firmada» con firma_origen = 'same', sin tocar las de zamorApp,
-- nadie con sesión fabrica la marca, Corregir la borra, y se puede revertir.
\pset tuples_only on
reset role;
select set_config('request.jwt.claim.sub','',false) \g /dev/null
insert into public.importaciones (id,org_id,origen,etapa) values ('17700000-0000-0000-0000-0000000000f1','10000000-0000-0000-0000-000000000001','integral','completa');
insert into clinico.consultas (id,org_id,empresa_id,trabajador_id,estado,fecha,hora_cierre,origen,codigo_origen,lote_importacion) values
 ('17700000-0000-0000-0000-0000000000c1','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a','30000000-0000-0000-0000-00000000000a','cerrada','2023-05-02','2023-05-02 10:30-04','integral','cons:1','17700000-0000-0000-0000-0000000000f1'),
 ('17700000-0000-0000-0000-0000000000c2','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a','30000000-0000-0000-0000-00000000000a','cerrada','2023-06-01',null,'integral','cons:2','17700000-0000-0000-0000-0000000000f1'),
 ('17700000-0000-0000-0000-0000000000c3','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a','30000000-0000-0000-0000-00000000000a','cerrada','2024-02-01',null,null,null,null);
select 'marca solo las 2 del SAME (debe 2): ' || public.marcar_firmadas_same();
select 'quedan firmadas en el SAME (debe 2): ' || count(*) from clinico.consultas
 where id in ('17700000-0000-0000-0000-0000000000c1','17700000-0000-0000-0000-0000000000c2') and estado = 'firmada' and firma_origen = 'same';
select 'firmada_en = hora de cierre del SAME (debe 1): ' || count(*) from clinico.consultas
 where id = '17700000-0000-0000-0000-0000000000c1' and firmada_en = '2023-05-02 10:30-04';
select 'sin hora de cierre: la de inicio (debe 1): ' || count(*) from clinico.consultas
 where id = '17700000-0000-0000-0000-0000000000c2' and firmada_en = hora_inicio;
select 'la de zamorApp sigue cerrada (debe 1): ' || count(*) from clinico.consultas where id = '17700000-0000-0000-0000-0000000000c3' and estado = 'cerrada' and firma_origen is null;
select 'un renglón de bitácora con los ids (debe 2): ' || (despues ->> 'consultas') from public.bitacora where accion = 'FIRMADAS_EN_SAME' order by id desc limit 1;
select 'la vista de la app trae firma_origen (debe 2): ' || count(*) from public.consultas where firma_origen = 'same' and id::text like '17700000%';
select 'repetir no marca nada más (debe 0): ' || public.marcar_firmadas_same();

-- Con sesión nadie fabrica la marca
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false) \g /dev/null
update clinico.consultas set firma_origen = 'same' where id = '17700000-0000-0000-0000-0000000000c3';
reset role;
update clinico.consultas set estado = 'firmada' where id = '17700000-0000-0000-0000-0000000000c3';
select 'con sesión no se marca «del SAME» (debe 1): ' || count(*) from clinico.consultas where id = '17700000-0000-0000-0000-0000000000c3' and estado = 'firmada' and firma_origen is null;
do $$ begin
  insert into clinico.consultas (org_id,empresa_id,trabajador_id,estado,fecha,firma_origen) values
   ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a','30000000-0000-0000-0000-00000000000a','cerrada','2024-03-01','same');
  raise notice 'firma_origen se borra en una consulta sin firmar (debe 0): %', (select count(*) from clinico.consultas where fecha = '2024-03-01' and firma_origen is not null);
end $$;

-- Corregir la reabre y borra la marca; al firmar de nuevo, la firma es de zamorApp
update clinico.consultas set estado = 'borrador' where id = '17700000-0000-0000-0000-0000000000c1';
select 'corregida queda sin marca del SAME (debe 1): ' || count(*) from clinico.consultas where id = '17700000-0000-0000-0000-0000000000c1' and estado = 'borrador' and firma_origen is null;

select 'revertir devuelve a cerrada las que siguen del SAME (debe 1): ' || public.revertir_firmadas_same('10000000-0000-0000-0000-000000000001');
select 'revertida: cerrada sin hora de firma (debe 1): ' || count(*) from clinico.consultas where id = '17700000-0000-0000-0000-0000000000c2' and estado = 'cerrada' and firmada_en is null and firma_origen is null;

select set_config('request.jwt.claim.sub','',false) \g /dev/null
delete from clinico.consultas where id::text like '17700000%' or fecha = '2024-03-01';
delete from public.importaciones where id = '17700000-0000-0000-0000-0000000000f1';
