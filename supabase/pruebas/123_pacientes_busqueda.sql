-- Pacientes paginado: buscar_trabajadores respeta RLS, busca sin acentos ni puntos y pagina con total.
\pset tuples_only on
reset role;
select set_config('request.jwt.claim.sub','',false) \g /dev/null
insert into public.trabajadores (id,org_id,empresa_id,cedula,nombres,apellidos,estado) values
 ('30000000-0000-0000-0000-0000000000f1','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a','V-18.456.123','María José','González Pérez','activo'),
 ('30000000-0000-0000-0000-0000000000f2','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000b','V-9.111.222','Pedro','Núñez','egresado')
on conflict (id) do nothing;
select 'el disparador llena el texto de búsqueda sin acentos (debe 1): ' || (busqueda like '%gonzalez perez%' and busqueda like '% 18456123%')::int
from public.trabajadores where id = '30000000-0000-0000-0000-0000000000f1';
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false) \g /dev/null
select 'admin: «gonzalez» encuentra a González (debe 1): ' || count(*) from public.buscar_trabajadores('gonzalez') where id = '30000000-0000-0000-0000-0000000000f1';
select 'admin: «v18456123» encuentra por cédula sin puntos (debe 1): ' || count(*) from public.buscar_trabajadores('v18456123') where id = '30000000-0000-0000-0000-0000000000f1';
select 'admin: «18456» encuentra por dígitos (debe 1): ' || count(*) from public.buscar_trabajadores('18456') where id = '30000000-0000-0000-0000-0000000000f1';
select 'admin: filtro por empresa B y estado egresado (debe 1): ' || count(*) from public.buscar_trabajadores(null, '20000000-0000-0000-0000-00000000000b', 'egresado') where id = '30000000-0000-0000-0000-0000000000f2';
select 'admin: la página trae el total aunque pida 1 fila (debe 1): ' || (count(*) = 1 and min(total) >= 2)::int from public.buscar_trabajadores(null, null, null, 0, 1);
select 'admin: la segunda página no repite la primera (debe 1): ' || (not exists (select 1 from public.buscar_trabajadores(null, null, null, 0, 1) a join public.buscar_trabajadores(null, null, null, 1, 1) b on a.id = b.id))::int;
select 'admin: «%» y «_» no rompen la búsqueda (debe 1): ' || (count(*) >= 0)::int from public.buscar_trabajadores('%_');
-- Médico limitado a la empresa A: no ve a Núñez (empresa B) ni buscándolo
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false) \g /dev/null
select 'médico de A: no encuentra al trabajador de B (debe 0): ' || count(*) from public.buscar_trabajadores('nunez');
select 'médico de A: sí encuentra al de A (debe 1): ' || count(*) from public.buscar_trabajadores('maria jose') where id = '30000000-0000-0000-0000-0000000000f1';
select 'médico de A: el total no cuenta a los de B (debe 1): ' || (not exists (select 1 from public.buscar_trabajadores() where empresa_id = '20000000-0000-0000-0000-00000000000b'))::int;
reset role;
select set_config('request.jwt.claim.sub','',false) \g /dev/null
select 'anónimo no puede llamar buscar_trabajadores (debe 0): ' || has_function_privilege('anon', 'public.buscar_trabajadores(text, uuid, public.estado_trabajador, integer, integer)', 'execute')::int;
select 'buscar_trabajadores es de lectura (stable) para la puerta sin internet (debe 1): ' || (provolatile = 's')::int from pg_proc where proname = 'buscar_trabajadores';
delete from public.trabajadores where id in ('30000000-0000-0000-0000-0000000000f1','30000000-0000-0000-0000-0000000000f2');
