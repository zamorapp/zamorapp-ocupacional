-- «Hoy» es la fecha de Caracas aunque la base corra en UTC (como Supabase), y ninguna función ni
-- fecha por defecto vuelve a usar current_date / now()::date / timestamptz::date.
\pset tuples_only on
reset role;
set timezone = 'UTC';
select '23:30 de Caracas sigue siendo el mismo día (debe 1): ' || (public.fecha_caracas('2026-10-28 03:30+00') = date '2026-10-27')::int;
select '00:00 de Caracas ya es el día siguiente (debe 1): ' || (public.fecha_caracas('2026-10-28 04:00+00') = date '2026-10-28')::int;
select 'hoy_caracas() coincide con la hora de Caracas (debe 1): ' || (public.hoy_caracas() = (now() at time zone 'America/Caracas')::date)::int;
select 'consultas, cobros y notificaciones nacen con hoy_caracas() (debe 3): ' || count(*)
from pg_attrdef d join pg_attribute a on a.attrelid = d.adrelid and a.attnum = d.adnum
where (d.adrelid, a.attname) in (('clinico.consultas'::regclass, 'fecha'), ('public.cobros'::regclass, 'fecha'), ('public.notificaciones_riesgo'::regclass, 'entregada_en'))
  and pg_get_expr(d.adbin, d.adrelid) = 'hoy_caracas()';
-- Vigilancia permanente: cualquier función o default nuevo con la fecha de UTC hace fallar la prueba
select 'funciones con fecha en UTC (debe 0): ' || count(*) || coalesce(' → ' || string_agg(p.oid::regprocedure::text, ', '), '')
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname in ('public', 'clinico', 'sync') and p.prokind = 'f'
  and p.prosrc ~* '(current_date|localtimestamp|\mnow\(\)::date|current_timestamp::date|(_en|fecha_hora)::date)';
select 'fechas por defecto en UTC (debe 0): ' || count(*)
from pg_attrdef d join pg_class c on c.oid = d.adrelid join pg_namespace n on n.oid = c.relnamespace
where n.nspname in ('public', 'clinico', 'sync') and pg_get_expr(d.adbin, d.adrelid) ~* '(CURRENT_DATE|LOCALTIMESTAMP|now\(\)\)?::date)';
-- El reporte sigue funcionando reescrito (padrón con edad y limitaciones vigentes)
select 'reporte padrón responde (debe 1): ' || (jsonb_typeof(public.reporte_listado('pacientes', null, date '2026-01-01', date '2026-12-31')) is not null)::int;
reset timezone;
