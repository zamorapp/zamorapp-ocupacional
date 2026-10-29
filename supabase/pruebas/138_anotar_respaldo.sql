-- Fase C (local primero): la PC anota respaldos y pruebas de restauración con el secreto del equipo.
\pset tuples_only on
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false) \g /dev/null
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-0000000000a2","role":"authenticated","aal":"aal1"}',false) \g /dev/null
select 'respaldo anotado (debe 1): ' || (public.anotar_respaldo('e0000000-0000-0000-0000-000000000001','s1','respaldo','ok','zamorapp-20261029-1000.dump', 1234, 2, 'copia en la PC y en Drive') > 0)::int;
select 'prueba de restauración anotada (debe 1): ' || (public.anotar_respaldo('e0000000-0000-0000-0000-000000000001','s1','restauracion','ok','zamorapp-20261029-1000.zamorapp', 1234, null, 'descifrada con la clave de respaldo') > 0)::int;
-- el Inicio (administrador) la muestra; el médico no ve estado_respaldo (null)
select 'el médico no ve el estado del respaldo (debe 1): ' || (public.estado_respaldo() is null)::int;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false) \g /dev/null
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated","aal":"aal2"}',false) \g /dev/null
select 'el Inicio la muestra (debe 1): ' || coalesce((public.estado_respaldo()->'ultima_restauracion'->>'estado' = 'ok')::int, 0);
reset role;
select 'con el nombre del equipo (debe 1): ' || count(*) from public.respaldos where equipo = 'PC consultorio' and tipo = 'restauracion';
set role authenticated;
-- secreto malo: no entra
do $$ begin
  perform public.anotar_respaldo('e0000000-0000-0000-0000-000000000001','malo','respaldo','ok');
  raise exception 'FALLA: anotó con secreto malo';
exception when insufficient_privilege then raise notice 'secreto malo rechazado'; end $$;
-- tipo inválido: no entra
do $$ begin
  perform public.anotar_respaldo('e0000000-0000-0000-0000-000000000001','s1','otro','ok');
  raise exception 'FALLA: anotó un tipo inválido';
exception when invalid_parameter_value then raise notice 'tipo inválido rechazado'; end $$;
-- nadie lee la tabla directo
do $$ begin
  perform count(*) from public.respaldos;
  raise exception 'FALLA: authenticated lee public.respaldos';
exception when insufficient_privilege then raise notice 'tabla cerrada'; end $$;
