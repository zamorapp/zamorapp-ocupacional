-- Plantillas de examen por tipo: sembradas en cada organización; solo administrador o gerente médico las cambian.
\pset tuples_only on
reset role;
select 'plantillas base PRE, PER, EGR, REI (debe 4): ' || count(*) from public.lista_items where lista='plantilla_examen' and org_id is null and codigo in ('PRE','PER','EGR','REI');
-- La organización se crea después de las migraciones: la copia la hace copiar_listas_base (igual que al crear una)
select public.copiar_listas_base('10000000-0000-0000-0000-000000000001') \g /dev/null
select 'copiadas a la organización (debe 6): ' || count(*) from public.lista_items where lista='plantilla_examen' and org_id='10000000-0000-0000-0000-000000000001';
select 'copiar dos veces no duplica (debe 6): ' || count(*) from (select public.copiar_listas_base('10000000-0000-0000-0000-000000000001')) x, public.lista_items i where i.lista='plantilla_examen' and i.org_id='10000000-0000-0000-0000-000000000001';
select 'datos de PRE con vigencia 12 (debe 1): ' || count(*) from public.lista_items where lista='plantilla_examen' and org_id='10000000-0000-0000-0000-000000000001' and codigo='PRE' and (datos->>'meses')::int=12 and jsonb_array_length(datos->'empresa')>0;
set role authenticated;
-- El médico la usa (la lee) pero no la cambia
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false) \g /dev/null
select 'médico lee las plantillas (debe 6): ' || count(*) from public.lista_items where lista='plantilla_examen' and org_id='10000000-0000-0000-0000-000000000001';
update public.lista_items set datos='{"meses":1}' where lista='plantilla_examen' and org_id='10000000-0000-0000-0000-000000000001' and codigo='PRE';
do $$ begin
  insert into public.lista_items (org_id,lista,codigo,nombre) values ('10000000-0000-0000-0000-000000000001','plantilla_examen','CAM','Cambio');
  raise notice 'Médico creó plantilla: FALLA';
exception when others then raise notice 'Médico no crea plantillas (ok)'; end $$;
reset role;
select 'médico no la cambió (debe 12): ' || (datos->>'meses') from public.lista_items where lista='plantilla_examen' and org_id='10000000-0000-0000-0000-000000000001' and codigo='PRE';
set role authenticated;
-- El administrador sí
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false) \g /dev/null
update public.lista_items set datos=jsonb_set(datos,'{meses}','6') where lista='plantilla_examen' and org_id='10000000-0000-0000-0000-000000000001' and codigo='PER';
insert into public.lista_items (org_id,lista,codigo,nombre,datos) values ('10000000-0000-0000-0000-000000000001','plantilla_examen','CAM','Cambio de puesto','{"meses":12}');
reset role;
select 'administrador cambió PER y creó CAM (debe 2): ' || count(*) from public.lista_items where lista='plantilla_examen' and org_id='10000000-0000-0000-0000-000000000001' and ((codigo='PER' and (datos->>'meses')::int=6) or codigo='CAM');
