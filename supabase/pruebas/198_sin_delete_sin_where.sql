-- Supabase rechaza (pg_safeupdate) todo DELETE/UPDATE sin WHERE que llegue por la API, aun dentro de funciones.
-- La base local no lo carga: esta prueba barre el código de todas las funciones propias y falla si alguna lo tiene.
\pset tuples_only on
reset role;
select 'funciones con DELETE/UPDATE sin WHERE (debe 0): ' || count(*)
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace,
       regexp_split_to_table(p.prosrc, ';') s
 where n.nspname in ('public', 'clinico', 'sync', 'privado')
   and s ~* '^\s*(with\s.*\)\s*)?(delete\s+from|update\s+[a-z_."]+\s+(as\s+)?[a-z_]*\s*set)'
   and s !~* '\mwhere\M' and s !~* '\mexecute\M';
select string_agg(p.oid::regprocedure::text || ': ' || left(regexp_replace(s, '\s+', ' ', 'g'), 120), E'\n')
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace,
       regexp_split_to_table(p.prosrc, ';') s
 where n.nspname in ('public', 'clinico', 'sync', 'privado')
   and s ~* '^\s*(with\s.*\)\s*)?(delete\s+from|update\s+[a-z_."]+\s+(as\s+)?[a-z_]*\s*set)'
   and s !~* '\mwhere\M' and s !~* '\mexecute\M';
