-- Local primero: el informe de vigilancia de una empresa y período creado en la PC sin internet y también en la web
-- (ids distintos) se funde por clave natural campo por campo; si los dos escribieron distinto, es conflicto.
\pset tuples_only on
reset role;
-- La web ya creó el informe de la empresa A, 3.er trimestre: con resumen y la sección «edad» del análisis
insert into public.informes_vigilancia (id, org_id, empresa_id, desde, hasta, resumen, analisis) values
 ('44000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a',
  '2026-07-01','2026-09-30','Resumen de la web','{"edad":"Mayoría entre 30 y 40"}');
set role authenticated;
select set_config('request.path','/rpc/aplicar_cambios',false) \g /dev/null
select set_config('request.headers','{}',false) \g /dev/null
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false) \g /dev/null
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-0000000000a2","role":"authenticated","aal":"aal1"}',false) \g /dev/null
-- La PC (sin internet) creó el mismo informe con otro id: conclusiones, la sección «sexo» y la «edad» igual que la web
create temp table r144 as select x from jsonb_array_elements(public.aplicar_cambios('e0000000-0000-0000-0000-000000000001','s1',
 '[{"id":"c0000000-0000-0000-0000-000000000144","tabla":"public.informes_vigilancia","fila_id":"44000000-0000-0000-0000-0000000000f1","op":"I",
   "datos":{"org_id":"10000000-0000-0000-0000-000000000001","empresa_id":"20000000-0000-0000-0000-00000000000a","desde":"2026-07-01","hasta":"2026-09-30",
            "resumen":"Resumen de la web","conclusiones":"Conclusiones de la PC","analisis":{"edad":"Mayoría entre 30 y 40","sexo":"60 % mujeres"}}}]')) x;
select 'se funde en la fila de la nube (debe 1): ' || count(*) from r144 where x->>'estado' = 'aplicado' and x->>'fusionado_en' = '44000000-0000-0000-0000-000000000001';
select 'no se duplica (debe 1): ' || count(*) from public.informes_vigilancia where empresa_id = '20000000-0000-0000-0000-00000000000a' and desde = '2026-07-01';
select 'suma lo que solo escribió la PC (debe 1): ' || count(*) from public.informes_vigilancia where id = '44000000-0000-0000-0000-000000000001'
  and resumen = 'Resumen de la web' and conclusiones = 'Conclusiones de la PC' and analisis = '{"edad":"Mayoría entre 30 y 40","sexo":"60 % mujeres"}';
select 'la versión que responde es la nueva (debe 1): ' || count(*) from r144, public.informes_vigilancia i
  where i.id = '44000000-0000-0000-0000-000000000001' and (x->>'version')::bigint = i.version;
-- Otra PC creó el mismo informe con otro resumen y otra sección «sexo»: conflicto visible, nada se pisa
drop table r144;
create temp table r144 as select x from jsonb_array_elements(public.aplicar_cambios('e0000000-0000-0000-0000-000000000001','s1',
 '[{"id":"c0000000-0000-0000-0000-000000000145","tabla":"public.informes_vigilancia","fila_id":"44000000-0000-0000-0000-0000000000f2","op":"I",
   "datos":{"org_id":"10000000-0000-0000-0000-000000000001","empresa_id":"20000000-0000-0000-0000-00000000000a","desde":"2026-07-01","hasta":"2026-09-30",
            "resumen":"Otro resumen","recomendaciones":"Pausas activas","analisis":{"sexo":"55 % mujeres"}}}]')) x;
select 'texto distinto en el mismo campo es conflicto (debe 1): ' || count(*) from r144 where x->>'estado' = 'conflicto' and x->>'motivo' like '%resumen%' and x->>'motivo' like '%analisis.sexo%';
select 'en conflicto no se suma nada (debe 1): ' || count(*) from public.informes_vigilancia where id = '44000000-0000-0000-0000-000000000001'
  and resumen = 'Resumen de la web' and recomendaciones is null and analisis->>'sexo' = '60 % mujeres';
reset role;
select 'queda en Conflictos (debe 1): ' || count(*) from sync.conflictos where fila_id = '44000000-0000-0000-0000-0000000000f2' and resuelto_en is null;
-- El consolidado (empresa vacía) también funde por clave: nulls not distinct
insert into public.informes_vigilancia (id, org_id, empresa_id, desde, hasta, resumen) values
 ('44000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001',null,'2026-07-01','2026-09-30',null);
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false) \g /dev/null
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated","aal":"aal2"}',false) \g /dev/null
select 'consolidado fundido (debe 1): ' || count(*) from jsonb_array_elements(public.aplicar_cambios('e0000000-0000-0000-0000-000000000001','s1',
 '[{"id":"c0000000-0000-0000-0000-000000000146","tabla":"public.informes_vigilancia","fila_id":"44000000-0000-0000-0000-0000000000f3","op":"I",
   "datos":{"org_id":"10000000-0000-0000-0000-000000000001","empresa_id":null,"desde":"2026-07-01","hasta":"2026-09-30","resumen":"Consolidado de la PC"}}]')) x
  where x->>'fusionado_en' = '44000000-0000-0000-0000-000000000002';
-- Sin permiso sobre la fila que ya existe (el médico solo ve la empresa A): no se funde en el consolidado de otra empresa
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false) \g /dev/null
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-0000000000a2","role":"authenticated","aal":"aal1"}',false) \g /dev/null
reset role;
insert into public.informes_vigilancia (id, org_id, empresa_id, desde, hasta) values
 ('44000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000b','2026-07-01','2026-09-30');
set role authenticated;
select 'empresa ajena: no se funde (debe 0): ' || count(*) from jsonb_array_elements(public.aplicar_cambios('e0000000-0000-0000-0000-000000000001','s1',
 '[{"id":"c0000000-0000-0000-0000-000000000147","tabla":"public.informes_vigilancia","fila_id":"44000000-0000-0000-0000-0000000000f4","op":"I",
   "datos":{"org_id":"10000000-0000-0000-0000-000000000001","empresa_id":"20000000-0000-0000-0000-00000000000b","desde":"2026-07-01","hasta":"2026-09-30","resumen":"x"}}]')) x
  where x->>'estado' = 'aplicado';
reset role;
select 'la de la empresa ajena sigue vacía (debe 1): ' || count(*) from public.informes_vigilancia where id = '44000000-0000-0000-0000-000000000003' and resumen is null;
-- Las tablas sin clave natural siguen igual: sync.vacio y fundir solo los usa aplicar_cambios
select 'sync.vacio: "", espacios, {} y null (debe 4): ' || ((sync.vacio('""')::int) + sync.vacio('"  "')::int + sync.vacio('{}')::int + sync.vacio(null)::int);
delete from public.informes_vigilancia where id::text like '44000000-%';
