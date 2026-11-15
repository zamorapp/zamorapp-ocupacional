-- Inicio (20261030939000): «Consultas abiertas» y «Por firmar» no cuentan las consultas traídas del SAME,
-- y el número coincide con la lista que abre la tarjeta (/atencion?ver=…: estado + origen nulo).
\pset tuples_only on
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false) \g /dev/null
create temp table antes238 as select public.inicio_conteos(null,false,true) -> 'tareas' as t;
grant select on antes238 to authenticated;
reset role;
-- Sin usuario = la importación con la clave de servicio (la única que puede poner «origen»)
select set_config('request.jwt.claim.sub','',false) \g /dev/null
insert into clinico.consultas (id,org_id,empresa_id,trabajador_id,estado,fecha,origen) values
 ('5d000000-0000-0000-0000-000000000238','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-0000000000d1','5d000000-0000-0000-0000-0000000000b1','borrador','2023-11-20','integral'),
 ('5d000000-0000-0000-0000-000000000239','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-0000000000d1','5d000000-0000-0000-0000-0000000000b1','cerrada','2026-02-25','integral');
insert into clinico.consultas (id,org_id,empresa_id,trabajador_id,estado,fecha) values
 ('5d000000-0000-0000-0000-000000000240','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-0000000000d1','5d000000-0000-0000-0000-0000000000b1','borrador','2026-10-29');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false) \g /dev/null
set role authenticated;
select 'abiertas: el borrador del SAME no cuenta, el de octubre sí (debe 1): ' || ((public.inicio_conteos(null,false,true) -> 'tareas' ->> 'abiertas')::int - (select (t ->> 'abiertas')::int from antes238));
select 'por firmar: la cerrada del SAME no cuenta (debe 0): ' || ((public.inicio_conteos(null,false,true) -> 'tareas' ->> 'por_firmar')::int - (select (t ->> 'por_firmar')::int from antes238));
select 'número = lista de la tarjeta (debe 1): ' || ((public.inicio_conteos(null,false,true) -> 'tareas' ->> 'abiertas')::int = (select count(*) from public.consultas where estado = 'borrador' and origen is null))::int;
reset role;
delete from clinico.consultas where id in ('5d000000-0000-0000-0000-000000000238','5d000000-0000-0000-0000-000000000239','5d000000-0000-0000-0000-000000000240');
