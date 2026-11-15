-- Invitación de RR. HH.: la página del enlace dice quién invita (Configuración › Organización › «Quién invita»);
-- vacío = como antes. Sin cuenta solo se ve ese texto, nunca el resto de los ajustes. Deja la base como estaba.
\pset tuples_only on
reset role;
select set_config('request.jwt.claim.sub','',false) \g /dev/null
create temp table ajustes179 as select ajustes from public.organizaciones where id = '10000000-0000-0000-0000-000000000001';
grant select on ajustes179 to public;
insert into public.invitaciones (id,org_id,empresa_id,nombre,token_hash,creada_por) values
 ('7a000000-0000-0000-0000-000000000179','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000b','Ana',sha256(convert_to('token-179','UTF8')),'00000000-0000-0000-0000-0000000000a1');

update public.organizaciones set ajustes = coalesce(ajustes, '{}'::jsonb) - 'invita_como' where id = '10000000-0000-0000-0000-000000000001';
set role anon;
select 'sin «Quién invita» queda como antes (debe 1): ' || count(*) from public.ver_invitacion('token-179') where invita is null and organizacion is not null;
reset role;
update public.organizaciones set ajustes = coalesce(ajustes, '{}'::jsonb) || '{"invita_como": "  el Dr. César Zamora  "}' where id = '10000000-0000-0000-0000-000000000001';
set role anon;
select 'sin cuenta ve quién invita, sin espacios (debe 1): ' || count(*) from public.ver_invitacion('token-179') where invita = 'el Dr. César Zamora';
select 'un token inventado no muestra nada (debe 0): ' || count(*) from public.ver_invitacion('inventado-179');
reset role;
update public.organizaciones set ajustes = coalesce(ajustes, '{}'::jsonb) || '{"invita_como": "   "}' where id = '10000000-0000-0000-0000-000000000001';
set role anon;
select 'solo espacios cuenta como vacío (debe 1): ' || count(*) from public.ver_invitacion('token-179') where invita is null;

select 'sin cuenta no hay «otro rol» (debe 0): ' || count(*) from public.ver_invitacion('token-179') where otro_rol;
-- Con la sesión del administrador abierta (lo que le pasó a Cesar): avisa en vez de dejarlo trancado
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false) \g /dev/null
select 'con sesión del servicio avisa «otro rol» (debe 1): ' || count(*) from public.ver_invitacion('token-179') where otro_rol;
select set_config('request.jwt.claim.sub','',false) \g /dev/null
reset role;
update public.organizaciones set ajustes = (select ajustes from ajustes179) where id = '10000000-0000-0000-0000-000000000001';
delete from public.invitaciones where id = '7a000000-0000-0000-0000-000000000179';
drop table ajustes179;
