-- Firma y sello en la copia del escritorio: el personal clínico los recibe (para imprimir sin internet);
-- un rol no clínico que baja la copia (auditor) no.
\pset tuples_only on
reset role;
select set_config('request.jwt.claim.sub','',false) \g /dev/null
update public.perfiles set firma_url='data:image/png;base64,FIRMA192', sello_url='data:image/png;base64,SELLO192', mostrar_firma=true
 where id='00000000-0000-0000-0000-0000000000a2';
insert into public.equipos (id,org_id,nombre,serie,secreto_hash) values
 ('e0000000-0000-0000-0000-000000000192','10000000-0000-0000-0000-000000000001','PC firma','Y',encode(sha256('s192'::bytea),'hex'))
 on conflict do nothing;
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false) \g /dev/null
select 'el médico baja su firma y sello a la PC (debe 1): ' || count(*)
  from jsonb_array_elements(public.instantanea('e0000000-0000-0000-0000-000000000192','s192','public.perfiles')->'filas') f
 where f->>'id'='00000000-0000-0000-0000-0000000000a2' and f->>'firma_url' like '%FIRMA192' and f->>'sello_url' like '%SELLO192';
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a5',false) \g /dev/null
-- Desde 20261030945000 la firma ajena no baja a otra PC: se imprime con firma_de_documento (en línea)
select 'la firma del médico no baja a la PC de enfermería (debe 0): ' || count(*)
  from jsonb_array_elements(public.instantanea('e0000000-0000-0000-0000-000000000192','s192','public.perfiles')->'filas') f
 where f->>'id'='00000000-0000-0000-0000-0000000000a2' and f->>'firma_url' like '%FIRMA192';
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000d1',false) \g /dev/null
select 'el auditor no baja firmas ni sellos de otros (debe 0): ' || count(*)
  from jsonb_array_elements(public.instantanea('e0000000-0000-0000-0000-000000000192','s192','public.perfiles')->'filas') f
 where f->>'id' <> '00000000-0000-0000-0000-0000000000d1' and (f ? 'firma_url' or f ? 'sello_url');
select 'el auditor sí baja los nombres (debe 1): ' || least(count(*),1)
  from jsonb_array_elements(public.instantanea('e0000000-0000-0000-0000-000000000192','s192','public.perfiles')->'filas') f
 where f ? 'nombre_completo';
-- Huella de catálogos: cambia cuando cambia la firma, y no cuando no cambia nada
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false) \g /dev/null
create temp table h192 as select public.huella_catalogos('e0000000-0000-0000-0000-000000000192','s192') h;
select 'huella estable sin cambios (debe 1): ' || count(*) from h192 where h = public.huella_catalogos('e0000000-0000-0000-0000-000000000192','s192');
update public.perfiles set firma_url='data:image/png;base64,FIRMA192b' where id='00000000-0000-0000-0000-0000000000a2';
select 'huella de perfiles cambia con la firma (debe 1): ' || count(*) from h192
 where h->>'public.perfiles' <> public.huella_catalogos('e0000000-0000-0000-0000-000000000192','s192')->>'public.perfiles'
   and h->>'public.organizaciones' = public.huella_catalogos('e0000000-0000-0000-0000-000000000192','s192')->>'public.organizaciones';
select 'huella sin cie10 (debe 0): ' || count(*) from h192 where h ? 'public.cie10';
reset role;
select set_config('request.jwt.claim.sub','',false) \g /dev/null
delete from public.equipos where id='e0000000-0000-0000-0000-000000000192';
