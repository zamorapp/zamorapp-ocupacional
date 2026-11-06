-- Latidos con pg_cron (20261030909000): en la PC y donde no hay pg_cron la migración no falla ni programa nada,
-- y se puede correr dos veces. En Supabase se verifica con: select jobname, schedule from cron.job;
\pset tuples_only on
reset role;
set zamorapp.local = 'on';
\i supabase/migrations/20261030909000_latidos_pg_cron.sql
reset zamorapp.local;
\i supabase/migrations/20261030909000_latidos_pg_cron.sql
select 'sin pg_cron no deja trabajos programados (debe 1): ' || (to_regclass('cron.job') is null)::int;
-- Analizar 06-nov (SSRF): ningún usuario de la app ejecuta net.http_get (sin pg_net la función no existe: también 0)
select 'authenticated no ejecuta net.http_get (debe 0): ' || coalesce(has_function_privilege('authenticated', to_regprocedure('net.http_get(text,jsonb,jsonb,integer)'), 'execute'), false)::int;
