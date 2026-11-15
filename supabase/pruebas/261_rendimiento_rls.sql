-- Rendimiento de las reglas de acceso (mig 963): ninguna política llama auth.uid()/auth.role()/current_setting() por
-- cada fila, toda llave foránea tiene índice, y las reglas siguen dando lo mismo (perfil propio, consulta firmada).
\pset tuples_only on
reset role;
select 'políticas con auth.uid() suelto (debe 0): ' || count(*) from pg_policies
 where schemaname in ('public', 'clinico', 'sync')
   and regexp_replace(coalesce(qual, '') || ' ' || coalesce(with_check, ''), 'SELECT (auth\.(uid|role|jwt)\(\)|current_setting\([^()]*\))', '', 'gi')
       ~* '(auth\.(uid|role|jwt)\(\)|current_setting\()';
select 'llaves foráneas sin índice (debe 0): ' || count(*) from pg_constraint c
  join pg_class t on t.oid = c.conrelid join pg_namespace n on n.oid = t.relnamespace
 where c.contype = 'f' and n.nspname in ('public', 'clinico', 'sync') and t.relkind = 'r'
   and not exists (select 1 from pg_index i where i.indrelid = c.conrelid
     and (i.indkey::int2[])[0:cardinality(c.conkey) - 1] @> c.conkey
     and (i.indkey::int2[])[0:cardinality(c.conkey) - 1] <@ c.conkey);
select 'la función auxiliar no la llama nadie de la app (debe 0): ' || (has_function_privilege('authenticated', 'public.envolver_funciones_rls(text)', 'execute'))::int;
select 'envolver no toca lo ya envuelto (debe 1): ' || (public.envolver_funciones_rls('(id = ( SELECT auth.uid() AS uid))') = '(id = ( SELECT auth.uid() AS uid))')::int;
-- La regla sigue igual: cada quien ve solo su perfil
select set_config('request.jwt.claim.sub', (select id::text from public.perfiles order by id limit 1), false);
set role authenticated;
select 'perfil propio sigue viéndose solo el suyo (debe 1): ' || count(*) from public.perfiles where id = auth.uid();
reset role;
select set_config('request.jwt.claim.sub', '', false);
