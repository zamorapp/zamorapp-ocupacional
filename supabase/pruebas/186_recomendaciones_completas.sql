-- Recomendaciones de cada evaluación más completas (Cesar, 04-nov): el texto nuevo llega a las copias que nadie
-- editó, lo que el médico cambió queda tal cual, las nuevas se copian a cada organización y repetir no duplica.
-- Deja los datos como los encontró.
\pset tuples_only on
reset role;
\set org '''10000000-0000-0000-0000-000000000001'''
select 'nuevas en la organización (debe 23): ' || count(*) from public.lista_items where org_id = :org and lista like 'recomendacion_%'
  and codigo in ('no_apto_temporal','rin_apto','prn_control','psn_reintegro','eve_apto','emp_no_apto','emp_partes_blandas','emp_columna','emp_hombro','emp_hta','emp_diabetes','emp_salud_mental','emp_prenatal','emp_accidente','pac_partes_blandas','pac_columna','pac_hombro','pac_diabetes','pac_salud_mental','pac_vacaciones','pac_egreso','pac_embarazo','pac_accidente');
select 'con categoría para los botones (debe 1): ' || count(*) from public.lista_items where org_id = :org and lista = 'recomendacion_empresa' and codigo = 'emp_salud_mental' and datos->>'categoria' = 'salud_mental';
-- Simula lo de antes: «apto» sin editar y «preempleo» editado por el médico
update public.lista_items set texto = 'Texto viejo apto.' where lista = 'recomendacion_aptitud' and codigo = 'apto' and (org_id is null or org_id = :org);
update public.lista_items set texto = 'Texto viejo preempleo.' where lista = 'recomendacion_aptitud' and codigo = 'preempleo' and org_id is null;
update public.lista_items set texto = 'Lo escribió el médico.' where lista = 'recomendacion_aptitud' and codigo = 'preempleo' and org_id = :org;
update public.lista_items set grupo = 'PER' where lista = 'recomendacion_aptitud' and codigo = 'apto' and (org_id is null or org_id = :org);
\set QUIET on
\o /dev/null
\i supabase/migrations/20261030820000_recomendaciones_completas.sql
\o
select 'la copia sin editar toma el texto nuevo (debe 1): ' || count(*) from public.lista_items where org_id = :org and codigo = 'apto'
  and lista = 'recomendacion_aptitud' and texto like '%evaluación médica periódica%' and texto like E'%\n%';
select 'y su grupo nuevo (debe 1): ' || count(*) from public.lista_items where org_id = :org and codigo = 'apto' and lista = 'recomendacion_aptitud' and grupo = 'PER,ANU';
select 'lo editado por el médico no se toca (debe 1): ' || count(*) from public.lista_items where org_id = :org and codigo = 'preempleo'
  and lista = 'recomendacion_aptitud' and texto = 'Lo escribió el médico.';
select 'la base sí cambia (debe 1): ' || count(*) from public.lista_items where org_id is null and codigo = 'preempleo' and lista = 'recomendacion_aptitud' and texto like '%inducción%';
select 'sin duplicados al repetir (debe 0): ' || count(*) from (select lista, codigo, org_id from public.lista_items where lista like 'recomendacion_%' group by 1,2,3 having count(*) > 1) d;
select 'ninguna base queda de una sola línea (debe 0): ' || count(*) from public.lista_items where org_id is null and lista like 'recomendacion_%' and texto not like E'%\n%' and codigo not like 'integral_%';
-- La categoría elegida por el médico no se pisa al repetir
update public.lista_items set datos = datos || '{"categoria":"habitos"}' where org_id = :org and lista = 'recomendacion_paciente' and codigo = 'pac_columna';
-- La organización borró a propósito una recomendación vieja («apto» de la empresa) y una nueva (pac_hombro)
create temp table _borradas as select * from public.lista_items where org_id = :org
  and ((lista = 'recomendacion_aptitud' and codigo = 'apto') or (lista = 'recomendacion_paciente' and codigo = 'pac_hombro'));
\o /dev/null
delete from public.lista_items where id in (select id from _borradas);
\i supabase/migrations/20261030820000_recomendaciones_completas.sql
\o
select 'la categoría del médico queda (debe 1): ' || count(*) from public.lista_items where org_id = :org and codigo = 'pac_columna' and datos->>'categoria' = 'habitos';
select 'lo borrado por la organización no vuelve (debe 0): ' || count(*) from public.lista_items where org_id = :org
  and ((lista = 'recomendacion_aptitud' and codigo = 'apto') or (lista = 'recomendacion_paciente' and codigo = 'pac_hombro'));
select 'sus copias editadas siguen igual (debe 1): ' || count(*) from public.lista_items where org_id = :org and codigo = 'preempleo'
  and lista = 'recomendacion_aptitud' and texto = 'Lo escribió el médico.';
\o /dev/null
insert into public.lista_items select * from _borradas;
drop table _borradas;
\o
-- Estado como estaba
\o /dev/null
update public.lista_items set datos = datos || '{"categoria":"columna"}' where org_id = :org and lista = 'recomendacion_paciente' and codigo = 'pac_columna';
\o /dev/null
update public.lista_items o set texto = b.texto from public.lista_items b where o.base_id = b.id and o.org_id = :org and o.codigo = 'preempleo' and o.lista = 'recomendacion_aptitud';
\o
