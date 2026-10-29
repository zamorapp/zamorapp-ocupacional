-- vigilancia_series: anon no la ejecuta; un usuario autenticado sí
\pset tuples_only on
reset role;
select 'anon ejecuta vigilancia_series (debe 0): ' || has_function_privilege('anon', 'public.vigilancia_series(uuid,date,date)', 'execute')::int;
select 'authenticated ejecuta vigilancia_series (debe 1): ' || has_function_privilege('authenticated', 'public.vigilancia_series(uuid,date,date)', 'execute')::int;
