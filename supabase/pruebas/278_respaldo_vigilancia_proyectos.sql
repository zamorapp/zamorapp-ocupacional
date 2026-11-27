\pset tuples_only on
begin;
reset role;
alter table storage.objects add column if not exists updated_at timestamptz;
alter table storage.objects add column if not exists metadata jsonb;

insert into storage.objects (bucket_id, name, updated_at, metadata) values
 ('vigilancia-proyectos', 'prueba-respaldo/CTR-01--2026-T1.pdf', now() - interval '2 days', '{"size": 20}'),
 ('vigilancia-proyectos', 'prueba-respaldo/CTR-01--2026-T3.pdf', now(), '{"size": 40}'),
 ('adjuntos_huerfanos', 'prueba-respaldo/otro.pdf', now(), '{"size": 80}');

set local role service_role;
select 'el respaldo completo incluye ambos informes (debe 60): ' || sum(bytes)
from public.archivos_para_respaldo(null)
where nombre like 'prueba-respaldo/%';
select 'el respaldo incremental incluye solo el nuevo (debe 40): ' || sum(bytes)
from public.archivos_para_respaldo(now() - interval '1 day')
where nombre like 'prueba-respaldo/%';
reset role;
select 'el inventario sigue vedado para usuarios de la app (debe 0): ' ||
  (has_function_privilege('authenticated', 'public.archivos_para_respaldo(timestamptz)', 'execute')
    or has_function_privilege('anon', 'public.archivos_para_respaldo(timestamptz)', 'execute'))::int;
rollback;
