-- La puerta del escritorio atiende sin conexión toda función stable/immutable de public como lectura, desde
-- la copia local (28/10/2026: la 0.1.168 no abría porque una de lectura se tomó por escritura). Para que eso
-- sea seguro, ninguna de ellas puede llamar a una función volátil (que podría escribir), y las funciones de
-- lectura que la app llama al abrir deben seguir declaradas stable.
\pset tuples_only on
reset role;
select 'funciones stable/immutable que llaman a una volátil (debe 0): ' || count(*) || coalesce(' → ' || string_agg(distinct s.oid::regprocedure::text || ' llama a ' || v.proname, ', '), '')
from pg_proc s join pg_namespace n on n.oid = s.pronamespace
join pg_proc v on v.pronamespace = s.pronamespace and v.provolatile = 'v' and v.prokind = 'f'
where n.nspname = 'public' and s.provolatile in ('s', 'i') and s.oid <> v.oid
  and s.prosrc ~* ('(^|[^a-z0-9_])' || v.proname || '\s*\(');
select 'funciones de lectura del menú y del panel declaradas stable (debe 4): ' || count(*)
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.provolatile in ('s', 'i')
  and p.proname in ('trabajadores_por_empresa', 'trabajadores_por_puesto', 'resumen_panel', 'vencimientos_empresas');
