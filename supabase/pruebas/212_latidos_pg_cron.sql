-- Latidos con pg_cron (20261030909000): en la PC y donde no hay pg_cron la migración no falla ni programa nada,
-- y se puede correr dos veces. En Supabase se verifica con: select jobname, schedule from cron.job;
\pset tuples_only on
reset role;
set zamorapp.local = 'on';
\i supabase/migrations/20261030909000_latidos_pg_cron.sql
reset zamorapp.local;
\i supabase/migrations/20261030909000_latidos_pg_cron.sql
select 'sin pg_cron no deja trabajos programados (debe 1): ' || (to_regclass('cron.job') is null)::int;
-- Analizar 06-nov (SSRF). En Supabase el execute de net.* a anon/authenticated lo da supabase_admin y un REVOKE
-- que corre como postgres no lo quita (comprobado en producción al aplicar 909000): es el estado por defecto de
-- Supabase. La protección es que nadie llega a net: (1) PostgREST no sirve el esquema net, (2) ninguna función que
-- anon/authenticated puedan ejecutar menciona net (las que lo llaman tienen la URL fija y están cerradas) y
-- (3) solo postgres programa trabajos de pg_cron.
select 'PostgREST no sirve el esquema net (debe 0): ' || count(*)
  from pg_db_role_setting s join pg_roles r on r.oid = s.setrole, unnest(s.setconfig) c
 where r.rolname = 'authenticator' and c ilike 'pgrst.db_schemas=%' and c ~* '(=|,)\s*net\s*(,|$)';
select 'anon y authenticated no usan el esquema net (debe 0): ' || count(*)
  from (values ('anon'), ('authenticated')) v(rol)
 where to_regnamespace('net') is not null and has_schema_privilege(v.rol, 'net', 'usage')
   and exists (select 1 from pg_db_role_setting s join pg_roles r on r.oid = s.setrole, unnest(s.setconfig) c
                where r.rolname = 'authenticator' and c ~* '^pgrst.db_schemas=.*\mnet\M');
select 'funciones abiertas a anon/authenticated que llaman a net (debe 0): ' || count(*)
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname not in ('net', 'cron', 'extensions', 'pg_catalog', 'information_schema', 'graphql', 'graphql_public', 'vault', 'pgsodium')
   and p.prosrc ~ '\mnet\.(http_|_http)'
   and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute'));
select 'anon/authenticated no programan pg_cron (debe 0): ' || count(*)
  from (values ('anon'), ('authenticated')) v(rol)
 where to_regclass('cron.job') is not null
   and (has_schema_privilege(v.rol, 'cron', 'usage') and has_table_privilege(v.rol, 'cron.job', 'insert'));
