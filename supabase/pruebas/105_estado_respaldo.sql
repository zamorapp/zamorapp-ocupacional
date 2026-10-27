-- Estado del respaldo: lo ven solo administrador y gerente médico; nadie de la app escribe la tabla.
\pset tuples_only on
reset role;
select set_config('request.jwt.claim.sub','',false) \g /dev/null
insert into public.respaldos (fecha,estado,archivo,tamano_kb,destinos) values
 (now() - interval '2 days','ok','respaldo-a.json.gz',1800,2),
 (now() - interval '1 hour','fallo',null,null,0),
 (now() - interval '400 days','ok','respaldo-viejo.json.gz',1500,2);
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false) \g /dev/null
select 'admin ve el último intento fallido (debe 1): ' || (public.estado_respaldo() -> 'ultimo' ->> 'estado' = 'fallo')::int;
select 'admin ve el último correcto (debe 1800): ' || (public.estado_respaldo() -> 'ultimo_ok' ->> 'tamano_kb');
do $$ begin
  insert into public.respaldos (estado) values ('ok');
  raise notice 'un usuario de la app anota un respaldo falso: FALLA';
exception when insufficient_privilege then raise notice 'un usuario de la app no anota respaldos (ok)'; end $$;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false) \g /dev/null
select 'el médico no ve el estado (debe 1): ' || (public.estado_respaldo() is null)::int;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a3',false) \g /dev/null
select 'RRHH de la empresa no ve el estado (debe 1): ' || (public.estado_respaldo() is null)::int;
reset role;
select 'la purga recorta registros de más de un año (debe 1): ' || (public.mantenimiento_purgar() ->> 'registros_respaldo_viejos');
select 'quedan los recientes (debe 2): ' || count(*) from public.respaldos;
