-- Imágenes de firma y sello: solo el propio médico y el personal clínico de su organización.
\pset tuples_only on
reset role;
update public.perfiles set firma_url='data:image/png;base64,FIRMA', sello_url='data:image/png;base64,SELLO' where id='00000000-0000-0000-0000-0000000000a2';
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a3',false) \g /dev/null
do $$ begin perform firma_url from public.perfiles where id='00000000-0000-0000-0000-0000000000a2'; raise notice 'RR. HH. leyó la firma de la tabla: FALLA'; exception when insufficient_privilege then raise notice 'RR. HH. no lee la firma de la tabla (ok)'; end $$;
select 'RR. HH. obtiene firma por función (debe 0): ' || count(*) from public.firma_sello('00000000-0000-0000-0000-0000000000a2');
select 'RR. HH. sí ve el nombre del médico (debe 1): ' || count(*) from public.perfiles where id='00000000-0000-0000-0000-0000000000a2' and nombre_completo is not null;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a5',false) \g /dev/null
select 'enfermería obtiene firma para imprimir (debe 1): ' || count(*) from public.firma_sello('00000000-0000-0000-0000-0000000000a2') where firma_url like '%FIRMA';
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false) \g /dev/null
select 'el médico ve su firma (debe 1): ' || count(*) from public.firma_sello('00000000-0000-0000-0000-0000000000a2') where sello_url like '%SELLO';
update public.perfiles set mostrar_firma=false where id='00000000-0000-0000-0000-0000000000a2';
select 'el médico edita su perfil (debe 1): ' || count(*) from public.perfiles where id='00000000-0000-0000-0000-0000000000a2' and not mostrar_firma;
reset role;
