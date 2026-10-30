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
