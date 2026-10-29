-- Catálogo de paraclínicos: alta, cambio y borrado de un examen de la organización quedan en la bitácora con el usuario;
-- un guardado sin cambios y las otras listas no se anotan.
\pset tuples_only on
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false) \g /dev/null
insert into public.lista_items (id,lista,org_id,nombre,grupo,datos) values
 ('14100000-0000-0000-0000-000000000001','paraclinico','10000000-0000-0000-0000-000000000001','Colinesterasa 141','Toxicología','{"tipo":"numero","unidad":"U/L"}');
update public.lista_items set datos = datos || '{"rango_min":4000,"rango_max":12000,"fuente":"Laboratorio de uso"}' where id='14100000-0000-0000-0000-000000000001';
update public.lista_items set nombre = nombre where id='14100000-0000-0000-0000-000000000001';
insert into public.lista_items (id,lista,org_id,nombre) values ('14100000-0000-0000-0000-000000000002','habito','10000000-0000-0000-0000-000000000001','Hábito 141');
delete from public.lista_items where id='14100000-0000-0000-0000-000000000001';
reset role;
select 'alta, cambio y borrado anotados (debe 3): ' || count(*) from public.bitacora where registro_id='14100000-0000-0000-0000-000000000001';
select 'con el usuario que lo hizo (debe 3): ' || count(*) from public.bitacora where registro_id='14100000-0000-0000-0000-000000000001' and usuario_id='00000000-0000-0000-0000-0000000000a1' and org_id='10000000-0000-0000-0000-000000000001';
select 'el cambio guarda el rango antes y después (debe 1): ' || count(*) from public.bitacora where registro_id='14100000-0000-0000-0000-000000000001' and accion='UPDATE' and antes->'datos'->>'rango_max' is null and despues->'datos'->>'rango_max'='12000' and despues->'datos'->>'fuente'='Laboratorio de uso';
select 'otras listas no se anotan (debe 0): ' || count(*) from public.bitacora where registro_id='14100000-0000-0000-0000-000000000002';
delete from public.lista_items where id='14100000-0000-0000-0000-000000000002';
-- En la base local de la PC no se anota (la nube lo anota al recibir la fila)
set zamorapp.local = 'on';
insert into public.lista_items (id,lista,org_id,nombre) values ('14100000-0000-0000-0000-000000000003','paraclinico','10000000-0000-0000-0000-000000000001','Local 141');
update public.lista_items set datos = '{"unidad":"mg/dL"}' where id='14100000-0000-0000-0000-000000000003';
delete from public.lista_items where id='14100000-0000-0000-0000-000000000003';
reset zamorapp.local;
select 'en la base local no se anota dos veces (debe 0): ' || count(*) from public.bitacora where registro_id='14100000-0000-0000-0000-000000000003';
