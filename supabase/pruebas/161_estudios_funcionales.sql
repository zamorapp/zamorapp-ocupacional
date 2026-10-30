-- Espirometría, audiometría y electrocardiograma: llegan a cada organización una sola vez, como informe y con su clase,
-- sin duplicar el que ya tiene (aunque lo escriba sin acentos) y sin revivir lo que la organización ya tenía con otro nombre.
\pset tuples_only on
reset role;
delete from public.lista_items where org_id='10000000-0000-0000-0000-000000000001' and lista='paraclinico' and (codigo in ('espirometria','audiometria','ecg') or nombre in ('AUDIOMETRIA'));
insert into public.lista_items (lista,org_id,nombre,datos) values ('paraclinico','10000000-0000-0000-0000-000000000001','AUDIOMETRIA','{"codigo_same":"161"}');
select 'agrega solo los que faltan (debe 2): ' || public.sembrar_estudios_funcionales('10000000-0000-0000-0000-000000000001');
select 'la segunda vez no agrega nada (debe 0): ' || public.sembrar_estudios_funcionales('10000000-0000-0000-0000-000000000001');
select 'no duplica la audiometría del SAME (debe 1): ' || count(*) from public.lista_items where org_id='10000000-0000-0000-0000-000000000001' and lista='paraclinico' and lower(nombre) like 'audiometr%';
select 'llegan como informe y con su clase (debe 2): ' || count(*) from public.lista_items where org_id='10000000-0000-0000-0000-000000000001' and lista='paraclinico' and codigo in ('espirometria','ecg') and datos->>'tipo'='informe' and datos->>'clase' in ('espirometria','electrocardiograma');
select 'el ECG trae sus otros nombres (debe 1): ' || count(*) from public.lista_items where org_id='10000000-0000-0000-0000-000000000001' and codigo='ecg' and datos->'sinonimos' ? 'EKG';
-- En la base local de la PC no siembra (las filas llegan de la nube con sus ids)
delete from public.lista_items where org_id='10000000-0000-0000-0000-000000000001' and codigo='ecg';
set zamorapp.local = 'on';
select 'en la PC no siembra (debe 0): ' || public.sembrar_estudios_funcionales('10000000-0000-0000-0000-000000000001');
reset zamorapp.local;
select 'en la nube sí (debe 1): ' || public.sembrar_estudios_funcionales('10000000-0000-0000-0000-000000000001');
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false) \g /dev/null
select 'nadie la llama desde la app (debe 1): ' || (select count(*) from (select 1) x where not has_function_privilege('authenticated','public.sembrar_estudios_funcionales(uuid)','execute'));
reset role;
delete from public.lista_items where org_id='10000000-0000-0000-0000-000000000001' and lista='paraclinico' and nombre='AUDIOMETRIA';
