-- Citas por confirmar (20261030940000): el Inicio cuenta las provisionales citadas (cualquier fecha, también las
-- vencidas), no las confirmadas ni las canceladas, y RR. HH. sigue viendo solo las citas de su empresa.
\pset tuples_only on
reset role;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false) \g /dev/null
set role authenticated;
create temp table antes239 as select (public.inicio_conteos() -> 'tareas' ->> 'por_confirmar')::int as n;
grant select on antes239 to authenticated;
reset role;
insert into public.citas (id,org_id,empresa_id,trabajador_id,fecha,estado,por_confirmar) values
 ('5d000000-0000-0000-0000-000000000391','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-0000000000d1','5d000000-0000-0000-0000-0000000000b1',public.hoy_caracas() + 3,'citado',true),
 ('5d000000-0000-0000-0000-000000000392','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-0000000000d1','5d000000-0000-0000-0000-0000000000b2',public.hoy_caracas() - 2,'citado',true),
 ('5d000000-0000-0000-0000-000000000393','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-0000000000d1','5d000000-0000-0000-0000-0000000000b3',public.hoy_caracas() + 3,'cancelada',true),
 ('5d000000-0000-0000-0000-000000000394','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-0000000000d1','5d000000-0000-0000-0000-0000000000b4',public.hoy_caracas() + 3,'citado',false);
set role authenticated;
select 'por confirmar: 2 citadas provisionales, también la vencida (debe 2): ' || ((public.inicio_conteos() -> 'tareas' ->> 'por_confirmar')::int - (select n from antes239));
update public.citas set por_confirmar = false where id = '5d000000-0000-0000-0000-000000000391';
select 'al confirmar baja (debe 1): ' || ((public.inicio_conteos() -> 'tareas' ->> 'por_confirmar')::int - (select n from antes239));
update public.citas set estado = 'cancelada' where id = '5d000000-0000-0000-0000-000000000392';
select 'al eliminar (cancelar) baja a cero (debe 0): ' || ((public.inicio_conteos() -> 'tareas' ->> 'por_confirmar')::int - (select n from antes239));
select 'la columna existe en citas (debe 1): ' || count(*) from information_schema.columns where table_schema = 'public' and table_name = 'citas' and column_name = 'por_confirmar';
reset role;
delete from public.citas where id::text like '5d000000-0000-0000-0000-00000000039_';
