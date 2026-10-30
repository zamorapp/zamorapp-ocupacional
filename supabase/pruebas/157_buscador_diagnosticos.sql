-- Agregar a «Mis diagnósticos» y «Mis medicinas» desde la consulta: médico sí; enfermería, RR. HH., otra lista o la base no.
\pset tuples_only on
-- En Supabase authenticated ya usa el esquema extensions (unaccent); en el banco hay que darlo
grant usage on schema extensions to authenticated;
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false) \g /dev/null
insert into public.lista_items (lista, org_id, codigo, nombre, datos, base_id, activo, origen)
values ('diagnostico', '10000000-0000-0000-0000-000000000001', ' k40.9 ', '  Hernia   inguinal izquierda ', '{"propio": true}', null, true, null);
insert into public.lista_items (lista, org_id, nombre, datos) values ('medicina', '10000000-0000-0000-0000-000000000001', 'Ibuprofeno 400 mg', '{"propio": true}');
insert into public.lista_items (lista, org_id, nombre, datos) values ('diagnostico', '10000000-0000-0000-0000-000000000001', 'Síndrome viral sin código', '{"propio": true}');
select 'el médico agrega a sus listas, nombre y código limpios (debe 1): ' || count(*) from public.lista_items
 where lista = 'diagnostico' and nombre = 'Hernia inguinal izquierda' and codigo = 'K40.9' and activo and base_id is null;
select 'el buscador encuentra lo agregado, también sin código (debe 2): ' ||
 ((select count(*) from public.buscar_diagnosticos('hernia izquierda', 40) where descripcion = 'Hernia inguinal izquierda')
  + (select count(*) from public.buscar_diagnosticos('sindrome viral', 40) where descripcion = 'Síndrome viral sin código' and cie10 = ''));
do $$ begin insert into public.lista_items (lista, org_id, nombre, datos) values ('diagnostico', '10000000-0000-0000-0000-000000000001', 'hernia INGUINAL izquierda', '{"propio": true}');
 raise notice 'duplicado aceptado: FALLA'; exception when unique_violation then raise notice 'el mismo nombre no se duplica (ok)'; end $$;
do $$ begin insert into public.lista_items (lista, org_id, nombre, datos) values ('motivo_consulta', '10000000-0000-0000-0000-000000000001', 'Motivo nuevo', '{"propio": true}');
 raise notice 'otra lista aceptada: FALLA'; exception when others then raise notice 'desde la consulta no se escribe en otra lista (ok)'; end $$;
do $$ begin insert into public.lista_items (lista, org_id, nombre, datos) values ('medicina', null, 'Medicina en la base', '{"propio": true}');
 raise notice 'lista base aceptada: FALLA'; exception when insufficient_privilege then raise notice 'nadie escribe en la lista base (ok)'; end $$;
do $$ begin insert into public.lista_items (lista, org_id, nombre, datos) values ('medicina', '10000000-0000-0000-0000-000000000001', repeat('x', 201), '{"propio": true}');
 raise notice 'nombre largo aceptado: FALLA'; exception when others then raise notice 'nombre de más de 200 rechazado (ok)'; end $$;
do $$ begin update public.lista_items set nombre = 'Cambiado' where lista = 'medicina' and nombre = 'Ibuprofeno 400 mg';
 if found then raise notice 'el médico edita la lista: FALLA'; else raise notice 'el médico no edita la lista (ok)'; end if; end $$;
-- Enfermería y RR. HH. no agregan
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a5',false) \g /dev/null
do $$ begin insert into public.lista_items (lista, org_id, nombre, datos) values ('medicina', '10000000-0000-0000-0000-000000000001', 'Enfermería agrega', '{"propio": true}');
 raise notice 'enfermería agrega: FALLA'; exception when insufficient_privilege then raise notice 'enfermería no agrega (ok)'; end $$;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a3',false) \g /dev/null
do $$ begin insert into public.lista_items (lista, org_id, nombre, datos) values ('diagnostico', '10000000-0000-0000-0000-000000000001', 'RR. HH. agrega', '{"propio": true}');
 raise notice 'RR. HH. agrega: FALLA'; exception when insufficient_privilege then raise notice 'RR. HH. no agrega (ok)'; end $$;
reset role;
select 'la bandeja funde por nombre en lista_items (debe 1): ' || count(*) from sync.tablas where nombre = 'public.lista_items' and clave_natural = array['org_id', 'lista', 'nombre'];
-- En la base de la PC rige lo mismo (no depende de es_base_local)
select 'reglas sin excepción para la base local (debe 0): ' || count(*) from pg_trigger
 where tgname = 'preparar_item_propio' and pg_get_triggerdef(oid) like '%es_base_local%';
delete from public.lista_items where (datos ->> 'propio') = 'true' and org_id = '10000000-0000-0000-0000-000000000001';
select set_config('request.jwt.claim.sub', '', false) \g /dev/null
