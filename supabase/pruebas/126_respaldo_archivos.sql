-- Respaldo de archivos: el pase sirve una vez, vence a los 10 minutos y solo lo canjea la función de Supabase.
\pset tuples_only on
reset role;
alter table storage.objects add column if not exists created_at timestamptz default now();
alter table storage.objects add column if not exists updated_at timestamptz default now();
alter table storage.objects add column if not exists metadata jsonb;
insert into public.pases_respaldo (huella) values (encode(sha256(convert_to('pase-bueno', 'UTF8')), 'hex'));
insert into public.pases_respaldo (huella, creado) values (encode(sha256(convert_to('pase-viejo', 'UTF8')), 'hex'), now() - interval '11 minutes');
insert into storage.objects (bucket_id, name, updated_at, metadata) values
 ('adjuntos', 'org/trab/viejo.pdf', now() - interval '2 days', '{"size": 10}'),
 ('adjuntos', 'org/trab/nuevo.pdf', now(), '{"size": 20}'),
 ('solicitudes', 'org/sol/carta.pdf', now(), '{"size": 30}'),
 ('adjuntos_huerfanos', 'org/x.pdf', now(), '{"size": 40}');
set role service_role;
select 'el pase bueno se canjea (debe 1): ' || public.canjear_pase_respaldo('pase-bueno')::int;
select 'el mismo pase no sirve dos veces (debe 0): ' || public.canjear_pase_respaldo('pase-bueno')::int;
select 'un pase de hace 11 minutos no sirve (debe 0): ' || public.canjear_pase_respaldo('pase-viejo')::int;
select 'un pase inventado no sirve (debe 0): ' || public.canjear_pase_respaldo('inventado')::int;
select 'archivos cambiados en el último día, sin huérfanos (debe 2): ' || count(*) from public.archivos_para_respaldo(now() - interval '1 day') where nombre like 'org/%';
select 'todos los archivos con datos (debe 3): ' || count(*) from public.archivos_para_respaldo(null) where nombre like 'org/%';
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false) \g /dev/null
do $$ begin
  perform public.canjear_pase_respaldo('x');
  raise notice 'usuario de la app canjea pases: FALLA';
exception when insufficient_privilege then raise notice 'un usuario de la app no canjea pases (ok)'; end $$;
do $$ begin
  perform public.archivos_para_respaldo(null);
  raise notice 'usuario de la app lista archivos: FALLA';
exception when insufficient_privilege then raise notice 'un usuario de la app no lista archivos para respaldo (ok)'; end $$;
do $$ begin
  perform 1 from public.pases_respaldo;
  raise notice 'usuario de la app ve los pases: FALLA';
exception when insufficient_privilege then raise notice 'un usuario de la app no ve los pases (ok)'; end $$;
reset role;
delete from storage.objects where name in ('org/trab/viejo.pdf', 'org/trab/nuevo.pdf', 'org/sol/carta.pdf', 'org/x.pdf');
insert into public.respaldos (estado, tipo, archivo, filas, detalle) values ('aviso', 'archivos', null, 3, '1 archivo no bajó');
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false) \g /dev/null
select 'admin ve el último respaldo de archivos (debe 1): ' || coalesce((public.estado_respaldo() -> 'ultimo_archivos' ->> 'estado' = 'aviso')::int, 0);
select 'el respaldo de archivos no cuenta como respaldo de la base (debe 1): ' || coalesce((public.estado_respaldo() -> 'ultimo' ->> 'tipo' = 'respaldo')::int, 0);
reset role;
