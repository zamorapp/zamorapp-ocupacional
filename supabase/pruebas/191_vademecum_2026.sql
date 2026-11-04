-- Vademécum 2026: fármacos y presentaciones nuevas en cada organización, sin duplicar lo que el médico ya creó.
\pset tuples_only on
reset role;
select set_config('request.jwt.claim.sub','',false) \g /dev/null
select 'medicinas nuevas en la base (debe 122): ' || count(*) from public.lista_items where org_id is null and lista = 'medicina' and datos ->> 'vademecum' = '2026';
select 'cada organización tiene su copia (debe 122): ' || count(*) from public.lista_items where org_id = '10000000-0000-0000-0000-000000000001' and lista = 'medicina' and datos ->> 'vademecum' = '2026';
select 'presentaciones nuevas en la organización (debe 17): ' || count(*) from public.lista_items where org_id = '10000000-0000-0000-0000-000000000001' and lista = 'presentacion_medicina'
  and codigo in ('tab_rec','tab_lp','tab_mast','tab_efer','tab_sl','cap_blanda','cap_lp','sol_oral','gotas_orales','polvo_susp','sol_iny','jeringa','ovulo','crema_vag','locion','unguento_of','pomada');
select 'toda dosis sugerida trae presentación de la lista (debe 0): ' || count(*) from public.lista_items m
  where m.org_id is null and m.lista = 'medicina' and m.datos ->> 'vademecum' = '2026'
    and not exists (select 1 from public.lista_items p where p.org_id is null and p.lista = 'presentacion_medicina' and p.nombre = substring(m.texto from 'presentacion: ([^\n]*)'));
select 'toda frecuencia sugerida está en la lista (debe 0): ' || count(*) from public.lista_items m
  where m.org_id is null and m.lista = 'medicina' and m.datos ->> 'vademecum' = '2026'
    and not exists (select 1 from public.lista_items p where p.org_id is null and p.lista = 'frecuencia_dosis' and p.nombre = substring(m.texto from 'frecuencia: ([^\n]*)'));
select 'toda duración sugerida está en la lista (debe 0): ' || count(*) from public.lista_items m
  where m.org_id is null and m.lista = 'medicina' and m.datos ->> 'vademecum' = '2026'
    and not exists (select 1 from public.lista_items p where p.org_id is null and p.lista = 'duracion_tratamiento' and p.nombre = substring(m.texto from 'duracion: ([^\n]*)'));
select 'toda vía sugerida está en la lista (debe 0): ' || count(*) from public.lista_items m
  where m.org_id is null and m.lista = 'medicina' and m.datos ->> 'vademecum' = '2026'
    and not exists (select 1 from public.lista_items p where p.org_id is null and p.lista = 'via_administracion' and p.nombre = substring(m.texto from 'via: ([^\n]*)'));
select 'Paracetamol 500 mg se encuentra por la marca (debe 1): ' || count(*) from public.lista_items where org_id is null and nombre = 'Paracetamol' and texto like '%concentracion: 500 mg%marcas: Atamel';
select 'repetir la siembra no duplica (debe 0): ' || public.sembrar_vademecum_2026('10000000-0000-0000-0000-000000000001');
-- El médico ya tenía «Lansoprazol 30 mg» creado a mano: no se agrega otro
delete from public.lista_items where org_id = '10000000-0000-0000-0000-000000000001' and lista = 'medicina' and nombre = 'Lansoprazol';
insert into public.lista_items (lista, org_id, codigo, nombre, texto) values ('medicina', '10000000-0000-0000-0000-000000000001', 'lanso_propio', 'lansoprazol', E'concentracion: 30 mg\npresentacion: Cápsula');
select 'lo creado a mano con la misma concentración cuenta como existente (debe 0): ' || public.sembrar_vademecum_2026('10000000-0000-0000-0000-000000000001');
delete from public.lista_items where org_id = '10000000-0000-0000-0000-000000000001' and codigo = 'lanso_propio';
select 'luego se repone la del vademécum (debe 1): ' || public.sembrar_vademecum_2026('10000000-0000-0000-0000-000000000001');
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false) \g /dev/null
do $$ begin
  perform public.sembrar_vademecum_2026('10000000-0000-0000-0000-000000000001');
  raise notice 'un usuario de la app siembra el vademécum: FALLA';
exception when insufficient_privilege then raise notice 'un usuario de la app no siembra el vademécum (ok)'; end $$;
reset role;
