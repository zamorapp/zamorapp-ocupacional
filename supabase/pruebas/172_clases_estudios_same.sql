-- Clase de los estudios del SAME: se fija por nombre (sin acentos ni signos), no pisa una clase elegida a mano y deja
-- los de imagen como informe. La migración ya corrió al armar la base; aquí se revisa sobre filas propias de la prueba.
\pset tuples_only on
reset role;
insert into public.lista_items (id,lista,org_id,nombre,datos) values
 ('17200000-0000-0000-0000-000000000001','paraclinico','10000000-0000-0000-0000-000000000001','Rx Torax Pa','{}'),
 ('17200000-0000-0000-0000-000000000002','paraclinico','10000000-0000-0000-0000-000000000001','Ecosonograma Prostático','{"clase":"imagen"}'),
 ('17200000-0000-0000-0000-000000000003','paraclinico','10000000-0000-0000-0000-000000000001','V:d:r.l','{}'),
 ('17200000-0000-0000-0000-000000000004','paraclinico','10000000-0000-0000-0000-000000000001','Rc De Columna Toracica Ap Y Lat','{"tipo":"numero"}');
\set QUIET on
\i supabase/migrations/20261030680000_clases_estudios_same.sql
select 'Rx de tórax: rayos X e informe (debe 1): ' || count(*) from public.lista_items where id='17200000-0000-0000-0000-000000000001' and datos->>'clase'='rayos_x' and datos->>'tipo'='informe';
select 'no pisa la clase elegida a mano (debe 1): ' || count(*) from public.lista_items where id='17200000-0000-0000-0000-000000000002' and datos->>'clase'='imagen';
select 'VDRL queda en laboratorio sin tipo (debe 1): ' || count(*) from public.lista_items where id='17200000-0000-0000-0000-000000000003' and datos->>'clase'='laboratorio' and not datos ? 'tipo';
select 'el «RC» va a rayos X y respeta su tipo (debe 1): ' || count(*) from public.lista_items where id='17200000-0000-0000-0000-000000000004' and datos->>'clase'='rayos_x' and datos->>'tipo'='numero';
-- En la PC no cambia nada
update public.lista_items set datos='{}' where id='17200000-0000-0000-0000-000000000001';
set zamorapp.local = 'on';
\i supabase/migrations/20261030680000_clases_estudios_same.sql
reset zamorapp.local;
select 'en la PC no clasifica (debe 0): ' || count(*) from public.lista_items where id='17200000-0000-0000-0000-000000000001' and datos ? 'clase';
delete from public.lista_items where id::text like '17200000-%';
