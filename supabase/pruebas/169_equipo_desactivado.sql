-- Celular sin internet: el borrado remoto pregunta sin sesión si el equipo fue desactivado.
-- Solo responde true para un equipo existente y desactivado; nada más se puede saber de los equipos.
\pset tuples_only on
reset role;
insert into public.equipos (id, org_id, nombre, serie, secreto_hash, activo) values
 ('16900000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Celular · prueba 169', 'Q', 'x', true);
set role anon;
select 'activo: no se borra (debe 0): ' || public.equipo_desactivado('16900000-0000-0000-0000-000000000001')::int;
select 'id inventado: no se borra (debe 0): ' || public.equipo_desactivado('16900000-0000-0000-0000-0000000000ff')::int;
do $$ begin perform 1 from public.equipos; raise notice 'anon lee equipos: FALLA'; exception when insufficient_privilege then raise notice 'anon no lee equipos (ok)'; end $$;
reset role;
update public.equipos set activo = false where id = '16900000-0000-0000-0000-000000000001';
set role anon;
select 'desactivado: se borra (debe 1): ' || public.equipo_desactivado('16900000-0000-0000-0000-000000000001')::int;
reset role;
delete from public.equipos where id = '16900000-0000-0000-0000-000000000001';
