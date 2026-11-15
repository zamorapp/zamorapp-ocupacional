-- Motivos del SAME en la lista y Adecuación de puesto como no preventiva
\pset tuples_only on
reset role;
select 'motivos del SAME en la organización (debe 14): ' || count(*) from public.lista_items
 where lista = 'motivo_consulta' and org_id = '10000000-0000-0000-0000-000000000001'
   and codigo in ('ANU','TRF','EVE','ESP','EXT','PREOP','ENF','URG','ALT','EVO','CMV','CMS','OPS','DOM');
select 'sin códigos repetidos en la organización (debe 0): ' || count(*) from (select codigo from public.lista_items
 where lista = 'motivo_consulta' and org_id = '10000000-0000-0000-0000-000000000001' group by codigo having count(*) > 1) x;
select 'adecuación de puesto no preventiva (debe 0): ' || count(*) from public.lista_items
 where lista = 'motivo_consulta' and codigo = 'ADP' and grupo = 'preventivo';
-- En la base local de la PC no se crea nada (llega por la réplica)
delete from public.lista_items where lista = 'motivo_consulta' and codigo = 'DOM' and org_id = '10000000-0000-0000-0000-000000000001';
update public.lista_items set grupo = 'preventivo' where lista = 'motivo_consulta' and codigo = 'ADP';
select set_config('zamorapp.local', 'on', false) \g /dev/null
\i supabase/migrations/20261030470000_motivos_same.sql
select 'base local: no crea motivos (debe 0): ' || count(*) from public.lista_items where lista = 'motivo_consulta' and codigo = 'DOM' and org_id = '10000000-0000-0000-0000-000000000001';
select 'base local: no cambia Adecuación (debe 0): ' || count(*) from public.lista_items where lista = 'motivo_consulta' and codigo = 'ADP' and grupo = 'no_preventivo';
-- En la nube, una organización a la que le falta un motivo que la base ya tiene lo recibe
select set_config('zamorapp.local', '', false) \g /dev/null
\i supabase/migrations/20261030470000_motivos_same.sql
select 'nube: la base ya tenía DOM y la organización lo recibe (debe 1): ' || count(*) from public.lista_items
 where lista = 'motivo_consulta' and codigo = 'DOM' and org_id = '10000000-0000-0000-0000-000000000001';
