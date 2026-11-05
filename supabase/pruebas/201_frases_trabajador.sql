-- Frases que rotan en el WhatsApp al trabajador: 500 en la base, copia en cada organización, sin duplicar ni reponer lo borrado.
\pset tuples_only on
reset role;
select set_config('request.jwt.claim.sub','',false) \g /dev/null
select 'frases en la base (debe 500): ' || count(*) from public.lista_items where org_id is null and lista = 'frase_trabajador';
select 'cada organización tiene su copia (debe 500): ' || count(*) from public.lista_items where org_id = '10000000-0000-0000-0000-000000000001' and lista = 'frase_trabajador';
select 'cinco temas (debe 5): ' || count(distinct grupo) from public.lista_items where org_id is null and lista = 'frase_trabajador';
select 'ninguna frase repetida (debe 0): ' || count(*) from (select lower(nombre) from public.lista_items where org_id is null and lista = 'frase_trabajador' group by 1 having count(*) > 1) r;
select 'ninguna pasa de 140 letras (debe 0): ' || count(*) from public.lista_items where org_id is null and lista = 'frase_trabajador' and length(nombre) > 140;
select 'el orden no se repite (debe 0): ' || count(*) from (select orden from public.lista_items where org_id is null and lista = 'frase_trabajador' group by 1 having count(*) > 1) r;
select 'repetir la siembra no duplica (debe 0): ' || public.sembrar_frases_trabajador('10000000-0000-0000-0000-000000000001');
-- El servicio ya había escrito la misma frase a mano: no se agrega otra
delete from public.lista_items where org_id = '10000000-0000-0000-0000-000000000001' and lista = 'frase_trabajador' and codigo = 'frase_001';
insert into public.lista_items (lista, org_id, codigo, nombre) values ('frase_trabajador', '10000000-0000-0000-0000-000000000001', 'propia', 'no estás deprimido, estás distraído.');
select 'la misma frase escrita a mano cuenta como existente (debe 0): ' || public.sembrar_frases_trabajador('10000000-0000-0000-0000-000000000001');
delete from public.lista_items where org_id = '10000000-0000-0000-0000-000000000001' and codigo = 'propia';
select 'luego se repone la del banco (debe 1): ' || public.sembrar_frases_trabajador('10000000-0000-0000-0000-000000000001');
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false) \g /dev/null
do $$ begin
  perform public.sembrar_frases_trabajador('10000000-0000-0000-0000-000000000001');
  raise notice 'un usuario de la app siembra frases: FALLA';
exception when insufficient_privilege then raise notice 'un usuario de la app no siembra frases (ok)'; end $$;
reset role;
