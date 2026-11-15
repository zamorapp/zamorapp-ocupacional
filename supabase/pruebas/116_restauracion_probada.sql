-- Prueba de restauración: se anota aparte y no se confunde con el último respaldo.
\pset tuples_only on
reset role;
select set_config('request.jwt.claim.sub','',false) \g /dev/null
insert into public.respaldos (fecha,estado,tipo,archivo,filas) values
 (now() - interval '3 hours','ok','respaldo','respaldo-b.json.gz',100),
 (now() - interval '1 hour','fallo','restauracion','respaldo-b.json.gz',null);
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false) \g /dev/null
-- La restauración fallida es la fila más reciente: el último respaldo debe seguir siendo uno de tipo «respaldo»
select 'la restauración no cuenta como último respaldo (debe 1): ' || coalesce((public.estado_respaldo() -> 'ultimo' ->> 'tipo' = 'respaldo')::int, 0);
select 'admin ve la última restauración (debe 1): ' || coalesce((public.estado_respaldo() -> 'ultima_restauracion' ->> 'estado' = 'fallo')::int, 0);
reset role;
do $$ begin
  insert into public.respaldos (estado, tipo) values ('ok', 'otro');
  raise notice 'tipo inválido: FALLA';
exception when check_violation then raise notice 'tipo inválido rechazado (ok)'; end $$;
